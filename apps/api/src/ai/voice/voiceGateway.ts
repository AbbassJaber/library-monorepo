import { randomUUID } from 'node:crypto';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import {
  API_PREFIX,
  VOICE_CLOSE,
  VOICE_FRAME_BYTES,
  VOICE_MAX_TEXT_FRAME_BYTES,
  VoiceClientMessage,
  apiPaths,
  VoiceEndReason,
  ApiErrorCode,
  AiFeature,
} from '@library/contracts';
import type { VoiceServerMessage } from '@library/contracts';
import { ProviderUnavailableError, startVoiceSession } from '@library/ai';
import type { VoiceSessionHandle } from '@library/ai';
import { WebSocketServer } from 'ws';
import type { RawData, WebSocket } from 'ws';
import { COOKIES } from '../../config/constants.js';
import type { Logger } from '../../lib/logger.js';
import type { PrismaClient } from '../../lib/prisma.js';
import type { Actor } from '../../lib/route.js';
import { verifyAccessToken } from '../../lib/tokens.js';
import type { TokenConfig } from '../../lib/tokens.js';
import type { AiRuntime } from '../adapters/index.js';

export const VOICE_PATH = `${API_PREFIX}${apiPaths.ai.voice}`;
const PING_MS = 20_000;
const MAX_FRAMES_PER_SECOND = 64;
const START_TIMEOUT_MS = 10_000;
const MAX_BUFFERED_BYTES = 2 * 1024 * 1024;

export interface VoiceGatewayDeps {
  prisma: PrismaClient;
  logger: Logger;
  runtime: AiRuntime;
  tokens: Pick<TokenConfig, 'accessSecret'> & Partial<TokenConfig>;
  corsOrigins: string[];
}

const cookieValue = (header: string | undefined, name: string): string | null => {
  for (const part of (header ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
};

const refuse = (socket: Duplex, status: 401 | 403 | 404, text: string) => {
  socket.once('finish', () => socket.destroy());
  socket.end(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
};

const startOfDay = (now: Date) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

export const attachVoiceGateway = (server: Server, deps: VoiceGatewayDeps) => {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: Math.max(64 * 1024, VOICE_FRAME_BYTES * 8),
  });
  const connecting = new Set<number>();
  const sessions = deps.runtime.voiceSessions;

  const authenticate = async (req: IncomingMessage): Promise<Actor | 401> => {
    const bearer = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? '')?.[1];
    const token = bearer ?? cookieValue(req.headers.cookie, COOKIES.access);
    if (!token) return 401;
    const userId = verifyAccessToken(token, deps.tokens as TokenConfig);
    if (userId === null) return 401;
    const user = await deps.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, disabledAt: true },
    });
    if (!user || user.disabledAt !== null) return 401;
    return { id: user.id, role: user.role };
  };

  const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const path = new URL(req.url ?? '/', 'http://local').pathname;
    if (path !== VOICE_PATH) return;
    if (!deps.runtime.voice) return refuse(socket, 404, 'Not Found');
    const origin = req.headers.origin;
    if (!origin || !deps.corsOrigins.includes(origin)) return refuse(socket, 403, 'Forbidden');
    void authenticate(req).then(
      actor => {
        if (actor === 401) return refuse(socket, 401, 'Unauthorized');
        wss.handleUpgrade(req, socket, head, ws => void onConnection(ws, actor));
      },
      () => refuse(socket, 401, 'Unauthorized')
    );
  };

  const send = (ws: WebSocket, message: VoiceServerMessage) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
  };
  const close = (ws: WebSocket, code: number, reason: string) => {
    send(ws, { type: 'error', code: reason, message: reason.replace(/_/g, ' ') });
    ws.close(code, reason);
  };

  const onConnection = async (ws: WebSocket, actor: Actor) => {
    const voice = deps.runtime.voice!;
    if (sessions.has(actor.id) || connecting.has(actor.id))
      return close(ws, VOICE_CLOSE.sessionActive, 'session_active');
    if (sessions.size + connecting.size >= voice.limits.maxSessions)
      return close(ws, VOICE_CLOSE.busy, 'voice_busy');
    connecting.add(actor.id);
    const early: Array<{ data: RawData; isBinary: boolean }> = [];
    let deliver: ((data: RawData, isBinary: boolean) => void) | null = null;
    let onStart: ((data: RawData, isBinary: boolean) => void) | null = null;
    ws.on('message', (data: RawData, isBinary: boolean) => {
      if (onStart) {
        const first = onStart;
        onStart = null;
        first(data, isBinary);
      } else if (deliver) deliver(data, isBinary);
      else early.push({ data, isBinary });
    });
    let handle: VoiceSessionHandle | null = null;
    let ended = false;
    const release = () => {
      connecting.delete(actor.id);
      if (handle && sessions.get(actor.id) === handle) sessions.delete(actor.id);
    };
    ws.on('close', () => {
      ended = true;
      release();
      void handle?.stop(VoiceEndReason.enum.user);
    });
    try {
      const now = new Date();
      const [lastHour, today] = await Promise.all([
        deps.prisma.aiRun.count({
          where: {
            userId: actor.id,
            feature: AiFeature.enum.VOICE,
            createdAt: { gt: new Date(now.getTime() - 3_600_000) },
          },
        }),
        deps.prisma.aiRun.aggregate({
          where: {
            userId: actor.id,
            feature: AiFeature.enum.VOICE,
            createdAt: { gte: startOfDay(now) },
          },
          _sum: { latencyMs: true },
        }),
      ]);
      if (lastHour >= voice.limits.sessionsPerHour) {
        release();
        return close(ws, VOICE_CLOSE.rateLimited, 'rate_limited');
      }
      const remaining = voice.limits.dailySeconds - Math.ceil((today._sum.latencyMs ?? 0) / 1000);
      if (remaining < 5) {
        release();
        send(ws, { type: 'ended', reason: VoiceEndReason.enum['daily-budget'] });
        return close(ws, VOICE_CLOSE.rateLimited, 'daily_budget');
      }

      const start = await new Promise<VoiceClientMessage | null>(resolve => {
        const timer = setTimeout(() => resolve(null), START_TIMEOUT_MS);
        const take = (data: RawData, isBinary: boolean) => {
          clearTimeout(timer);
          if (isBinary) return resolve(null);
          try {
            const parsed = VoiceClientMessage.safeParse(JSON.parse(String(data)));
            resolve(parsed.success && parsed.data.type === 'start' ? parsed.data : null);
          } catch {
            resolve(null);
          }
        };
        const queued = early.shift();
        if (queued) take(queued.data, queued.isBinary);
        else onStart = take;
      });
      if (ended) return;
      if (!start || start.type !== 'start') {
        release();
        return close(ws, VOICE_CLOSE.invalidMessage, 'start_expected');
      }

      const agent = deps.runtime.agentDeps();
      handle = await startVoiceSession(
        {
          voice: voice.provider,
          ports: agent.ports,
          registry: agent.registry,
          confirmSecret: agent.confirmSecret,
          voiceId: voice.voiceId,
          ...(agent.search ? { search: agent.search } : {}),
          limits: {
            maxSeconds: Math.min(voice.limits.maxSeconds, remaining),
            idleSeconds: voice.limits.idleSeconds,
          },
        },
        { actor, requestId: null },
        { sessionId: randomUUID(), locale: start.locale, greet: start.greet },
        {
          send: message => send(ws, message),
          audio: pcm => {
            if (ws.readyState === ws.OPEN && ws.bufferedAmount < MAX_BUFFERED_BYTES) ws.send(pcm);
          },
        }
      );
      connecting.delete(actor.id);
      if (ended) {
        void handle.stop(VoiceEndReason.enum.user);
        return;
      }
      sessions.set(actor.id, handle);
      void handle.done.then(summary => {
        release();
        deps.logger.info('voice session', {
          userId: actor.id,
          endReason: summary.endReason,
          durationMs: summary.durationMs,
          costUsd: summary.costUsd,
          tools: summary.toolCalls.length,
        });
        if (ws.readyState === ws.OPEN) ws.close(VOICE_CLOSE.normal, summary.endReason);
      });

      let windowStart = Date.now();
      let frames = 0;
      deliver = (data: RawData, isBinary: boolean) => {
        if (isBinary) {
          const now = Date.now();
          if (now - windowStart >= 1000) {
            windowStart = now;
            frames = 0;
          }
          if (++frames > MAX_FRAMES_PER_SECOND) return;
          const buffer = Array.isArray(data)
            ? Buffer.concat(data)
            : Buffer.from(data as ArrayBuffer);
          handle?.audio(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength));
          return;
        }
        if ((data as Buffer).length > VOICE_MAX_TEXT_FRAME_BYTES)
          return close(ws, VOICE_CLOSE.invalidMessage, 'message_too_large');
        let parsed: ReturnType<typeof VoiceClientMessage.safeParse>;
        try {
          parsed = VoiceClientMessage.safeParse(JSON.parse(String(data)));
        } catch {
          return close(ws, VOICE_CLOSE.invalidMessage, 'invalid_message');
        }
        if (!parsed.success) return close(ws, VOICE_CLOSE.invalidMessage, 'invalid_message');
        if (parsed.data.type === 'stop') void handle?.stop(VoiceEndReason.enum.user);
      };
      for (const queued of early.splice(0)) deliver(queued.data, queued.isBinary);
    } catch (error) {
      release();
      deps.logger.warn('voice session failed to start', {
        userId: actor.id,
        message: String((error as Error).message),
      });
      send(ws, {
        type: 'error',
        code:
          error instanceof ProviderUnavailableError
            ? ApiErrorCode.enum.AI_UNAVAILABLE
            : ApiErrorCode.enum.INTERNAL,
        message: 'The voice assistant is unavailable right now.',
      });
      if (ws.readyState === ws.OPEN) ws.close(1011, 'unavailable');
    }
  };

  const alive = new WeakMap<WebSocket, boolean>();
  wss.on('connection', ws => {
    alive.set(ws, true);
    ws.on('pong', () => alive.set(ws, true));
  });
  const pinger = setInterval(() => {
    for (const ws of wss.clients) {
      if (alive.get(ws) === false) {
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      ws.ping();
    }
  }, PING_MS);
  pinger.unref();

  server.on('upgrade', onUpgrade);
  return {
    async close() {
      clearInterval(pinger);
      server.off('upgrade', onUpgrade);
      await Promise.all(
        [...sessions.values()].map(handle => handle.stop(VoiceEndReason.enum.user))
      );
      for (const ws of wss.clients) ws.terminate();
      await new Promise(resolve => wss.close(() => resolve(undefined)));
    },
  };
};
