import { VoiceServerMessage, VoiceEndReason } from '@library/contracts';
import type { ChatLocale } from '@library/contracts';
import i18n from 'i18next';
import { useCallStore } from '@/stores/callStore';
import { useChatStore } from '@/stores/chatStore';
import { toast } from '@/stores/uiStore';
import { voiceUrl } from '@/features/ai/useVoice';
import { playTone } from './callTones';

export const LEVEL_POLL_MS = 100;
export const SPEAKING_RMS = 0.015;
export const SPEAKING_HOLD_MS = 450;

export const callLevels = { mic: 0, out: 0 };

interface Live {
  ws: WebSocket;
  context: AudioContext;
  stream: MediaStream;
  player: AudioWorkletNode;
  capture: AudioWorkletNode;
  callId: number;
  poll: ReturnType<typeof setInterval> | null;
}

let live: Live | null = null;
let nextCallId = 1;
let turn: { id: number; draft: string; final: string } | null = null;
let opener: HTMLElement | null = null;
let speakingUntil = 0;

const t = (
  key: 'chat.voicePending' | 'chat.voiceBusyHere' | 'chat.voiceUnavailable' | 'chat.voiceNoMic'
): string => i18n.t(key);

const rms = (analyser: AnalyserNode, buffer: Float32Array<ArrayBuffer>): number => {
  analyser.getFloatTimeDomainData(buffer);
  let sum = 0;
  for (const sample of buffer) sum += sample * sample;
  return Math.sqrt(sum / buffer.length);
};

const startMetering = (context: AudioContext, mic: AudioNode, out: AudioNode) => {
  if (typeof context.createAnalyser !== 'function') return null;
  const micAnalyser = context.createAnalyser();
  const outAnalyser = context.createAnalyser();
  mic.connect(micAnalyser);
  out.connect(outAnalyser);
  const micBuffer = new Float32Array(micAnalyser.fftSize);
  const outBuffer = new Float32Array(outAnalyser.fftSize);
  return setInterval(() => {
    callLevels.mic = useCallStore.getState().muted ? 0 : rms(micAnalyser, micBuffer);
    callLevels.out = rms(outAnalyser, outBuffer);
    const now = Date.now();
    if (callLevels.out > SPEAKING_RMS) speakingUntil = now + SPEAKING_HOLD_MS;
    const speaking = now < speakingUntil;
    if (speaking !== useCallStore.getState().speaking) useCallStore.getState().set({ speaking });
  }, LEVEL_POLL_MS);
};

const cleanup = () => {
  const current = live;
  live = null;
  turn = null;
  callLevels.mic = 0;
  callLevels.out = 0;
  if (!current) return;
  if (current.poll) clearInterval(current.poll);
  current.capture.port.onmessage = null;
  for (const track of current.stream.getTracks()) track.stop();
  if (current.ws.readyState === WebSocket.OPEN || current.ws.readyState === WebSocket.CONNECTING)
    current.ws.close();
  void playTone(current.context, 'end').then(() => current.context.close().catch(() => undefined));
};

const restoreFocus = () => {
  const target = opener;
  opener = null;
  const fallback = document.getElementById('main');
  if (target?.isConnected) target.focus();
  else fallback?.focus();
};

const finish = (reason: VoiceEndReason, notice?: string) => {
  const call = useCallStore.getState();
  const chat = useChatStore.getState();
  if (call.callId !== null && call.startedAt !== null) {
    chat.add({
      role: 'assistant',
      content: '',
      notice: true,
      call: {
        id: call.callId,
        startedAt: call.startedAt,
        durationSeconds: Math.max(0, Math.round((Date.now() - call.startedAt) / 1000)),
        reason,
      },
    });
  }
  if (notice) toast(notice, 'error');
  cleanup();
  useCallStore.getState().reset();
  restoreFocus();
};

const remember = (citations: Array<{ bookId: number; title: string }>) => {
  const { mentioned } = useCallStore.getState();
  const known = new Set(mentioned.map(c => c.bookId));
  const fresh = citations.filter(c => !known.has(c.bookId));
  if (fresh.length > 0) useCallStore.getState().set({ mentioned: [...mentioned, ...fresh] });
};

const onMessage = (message: VoiceServerMessage) => {
  const current = live;
  if (!current) return;
  const chat = useChatStore.getState();
  const call = useCallStore.getState();
  const assistantTurn = () => {
    turn ??= {
      id: chat.add({
        role: 'assistant',
        content: '',
        voice: true,
        speculative: true,
        callId: current.callId,
      }),
      draft: '',
      final: '',
    };
    return turn;
  };
  switch (message.type) {
    case 'ready':
      call.set({ phase: 'live', startedAt: Date.now(), maxSeconds: message.maxSeconds });
      void playTone(current.context, 'connect');
      break;
    case 'transcript': {
      if (message.role === 'user') {
        turn = null;
        chat.add({ role: 'user', content: message.text, voice: true, callId: current.callId });
        call.set({ lastUser: message.text });
        break;
      }
      const spoken = assistantTurn();
      if (message.stage === 'speculative') spoken.draft += message.text;
      else spoken.final += message.text;
      const content = (spoken.final || spoken.draft).trim();
      chat.update(spoken.id, { content, speculative: spoken.final === '' });
      call.set({ lastAssistant: content });
      break;
    }
    case 'citations': {
      remember(message.citations);
      const spoken = turn;
      if (!spoken) break;
      const entry = chat.entries.find(e => e.id === spoken.id);
      chat.update(spoken.id, { citations: [...(entry?.citations ?? []), ...message.citations] });
      break;
    }
    case 'tool':
      call.set({ toolRunning: message.status === 'running' });
      break;
    case 'pending-action':
      chat.add({
        role: 'assistant',
        content: t('chat.voicePending'),
        voice: true,
        notice: true,
        callId: current.callId,
        action: { pending: message.action, state: 'pending' },
      });
      call.set({ view: 'full' });
      break;
    case 'interrupted':
      current.player.port.postMessage({ type: 'flush' });
      speakingUntil = 0;
      call.set({ speaking: false });
      if (turn && turn.final === '') {
        chat.remove(turn.id);
        turn = null;
      }
      break;
    case 'ended':
      finish(message.reason);
      break;
    case 'error':
      if (call.startedAt === null)
        finish(
          VoiceEndReason.enum.error,
          message.code === 'session_active' ? t('chat.voiceBusyHere') : t('chat.voiceUnavailable')
        );
      break;
    case 'action-decided':
      break;
  }
};

export const startCall = async (locale: ChatLocale): Promise<void> => {
  if (live || useCallStore.getState().phase !== 'idle') return;
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  useChatStore.getState().setOpen(false);
  const callId = nextCallId++;
  useCallStore.getState().reset();
  useCallStore.getState().set({ phase: 'connecting', view: 'full', callId });
  const context = new AudioContext();
  try {
    await context.resume();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    await context.audioWorklet.addModule('/worklets/pcm-capture.js');
    await context.audioWorklet.addModule('/worklets/pcm-player.js');
    const capture = new AudioWorkletNode(context, 'pcm-capture');
    const player = new AudioWorkletNode(context, 'pcm-player');
    const source = context.createMediaStreamSource(stream);
    source.connect(capture);
    player.connect(context.destination);
    const ws = new WebSocket(voiceUrl());
    ws.binaryType = 'arraybuffer';
    live = {
      ws,
      context,
      stream,
      player,
      capture,
      callId,
      poll: startMetering(context, source, player),
    };
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'start', locale, greet: true }));
      capture.port.onmessage = event => {
        if (ws.readyState === WebSocket.OPEN) ws.send(event.data as ArrayBuffer);
      };
    };
    ws.onmessage = event => {
      if (event.data instanceof ArrayBuffer) {
        player.port.postMessage(event.data, [event.data]);
        return;
      }
      const parsed = VoiceServerMessage.safeParse(JSON.parse(String(event.data)));
      if (parsed.success) onMessage(parsed.data);
    };
    ws.onclose = () => {
      if (live?.ws === ws)
        finish(
          VoiceEndReason.enum.error,
          useCallStore.getState().startedAt === null ? t('chat.voiceUnavailable') : undefined
        );
    };
  } catch {
    void context.close().catch(() => undefined);
    for (const track of live?.stream.getTracks() ?? []) track.stop();
    live = null;
    useCallStore.getState().reset();
    toast(t('chat.voiceNoMic'), 'error');
    restoreFocus();
  }
};

export const endCall = (): void => {
  const current = live;
  if (!current) {
    useCallStore.getState().reset();
    return;
  }
  useCallStore.getState().set({ phase: 'ending' });
  if (current.ws.readyState === WebSocket.OPEN) current.ws.send(JSON.stringify({ type: 'stop' }));
  else finish(VoiceEndReason.enum.user);
};

export const setMuted = (muted: boolean): void => {
  for (const track of live?.stream.getAudioTracks() ?? []) track.enabled = !muted;
  useCallStore.getState().set({ muted });
};

export const minimizeCall = (): void => useCallStore.getState().set({ view: 'minimized' });
export const restoreCall = (): void => useCallStore.getState().set({ view: 'full' });

export const abortCall = (): void => {
  cleanup();
  opener = null;
  useCallStore.getState().reset();
};
