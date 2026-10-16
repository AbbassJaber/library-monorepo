#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ToolName } from '@library/contracts';

const ROOT = join(import.meta.dirname, '../../..');
const envFile = join(ROOT, 'apps/api/.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);
const OUT = process.argv[2] ?? join(ROOT, 'tmp-voice-step0');
mkdirSync(OUT, { recursive: true });
const REGION = process.env.VOICE_AWS_REGION || 'eu-north-1';
const MODEL = process.env.VOICE_MODEL || 'amazon.nova-2-sonic-v1:0';
const VOICE = process.env.VOICE_ID || 'tiffany';
const FIXTURES = join(ROOT, 'packages/ai-eval/fixtures/voice');

const { BedrockRuntimeClient, InvokeModelWithBidirectionalStreamCommand } =
  await import('@aws-sdk/client-bedrock-runtime');
const { BedrockClient, GetModelInvocationLoggingConfigurationCommand } =
  await import('@aws-sdk/client-bedrock');
const { NodeHttp2Handler } = await import('@smithy/node-http-handler');
const { catalogTools, createToolRegistry } = await import('@library/ai');

const logging = await new BedrockClient({ region: REGION }).send(
  new GetModelInvocationLoggingConfigurationCommand({})
);
const loggingConfig = logging.loggingConfig ?? null;
console.log(
  'invocation logging:',
  loggingConfig
    ? JSON.stringify({ ...loggingConfig, s3Config: undefined, cloudWatchConfig: undefined })
    : 'off (no configuration)'
);

const pcmOf = file => {
  const buf = readFileSync(file);
  let offset = 12;
  while (offset < buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === 'data') return buf.subarray(offset + 8, offset + 8 + size);
    offset += 8 + size + (size % 2);
  }
  throw new Error(`no data chunk in ${file}`);
};
const FRAME = 1024;
const SILENCE = Buffer.alloc(FRAME);
const wav = (pcm, rate) => {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
};

const queue = [];
let wake = null;
let inputDone = false;
const push = event => {
  queue.push(event);
  wake?.();
};
const body = {
  async *[Symbol.asyncIterator]() {
    for (;;) {
      while (queue.length > 0)
        yield { chunk: { bytes: new TextEncoder().encode(JSON.stringify(queue.shift())) } };
      if (inputDone) return;
      await new Promise(resolve => (wake = resolve));
      wake = null;
    }
  },
};

const t0 = Date.now();
const at = () => Date.now() - t0;
const prompt = randomUUID();
const audioContent = randomUUID();
const registry = createToolRegistry(catalogTools);
const tools = registry.specs({ id: 1, role: 'READER' }).map(tool => ({
  toolSpec: {
    name: tool.name,
    description: tool.description,
    inputSchema: { json: JSON.stringify(tool.inputSchema) },
  },
}));

push({
  event: {
    sessionStart: {
      inferenceConfiguration: { maxTokens: 1024, topP: 0.9, temperature: 0.7 },
      turnDetectionConfiguration: { endpointingSensitivity: 'MEDIUM' },
    },
  },
});
push({
  event: {
    promptStart: {
      promptName: prompt,
      textOutputConfiguration: { mediaType: 'text/plain' },
      audioOutputConfiguration: {
        mediaType: 'audio/lpcm',
        sampleRateHertz: 24000,
        sampleSizeBits: 16,
        channelCount: 1,
        voiceId: VOICE,
        encoding: 'base64',
        audioType: 'SPEECH',
      },
      toolUseOutputConfiguration: { mediaType: 'application/json' },
      toolConfiguration: { tools },
    },
  },
});
const systemContent = randomUUID();
push({
  event: {
    contentStart: {
      promptName: prompt,
      contentName: systemContent,
      type: 'TEXT',
      interactive: false,
      role: 'SYSTEM',
      textInputConfiguration: { mediaType: 'text/plain' },
    },
  },
});
push({
  event: {
    textInput: {
      promptName: prompt,
      contentName: systemContent,
      content:
        'You are the voice assistant of a library catalog. Use the tools to look books up; never invent books. Answer in one or two short spoken sentences. Lines starting with [app] come from the application, not the user. Reply in the language the user speaks.',
    },
  },
});
push({ event: { contentEnd: { promptName: prompt, contentName: systemContent } } });
push({
  event: {
    contentStart: {
      promptName: prompt,
      contentName: audioContent,
      type: 'AUDIO',
      interactive: true,
      role: 'USER',
      audioInputConfiguration: {
        mediaType: 'audio/lpcm',
        sampleRateHertz: 16000,
        sampleSizeBits: 16,
        channelCount: 1,
        audioType: 'SPEECH',
        encoding: 'base64',
      },
    },
  },
});

let speech = Buffer.alloc(0);
let streaming = true;
let audioSentMs = 0;
let lastSpeechEnd = null;
const ticker = setInterval(() => {
  if (!streaming) return;
  let frame = SILENCE;
  if (speech.length > 0) {
    frame = speech.subarray(0, FRAME);
    speech = speech.subarray(FRAME);
    if (frame.length < FRAME) frame = Buffer.concat([frame, SILENCE.subarray(frame.length)]);
    if (speech.length === 0) lastSpeechEnd = at();
  }
  audioSentMs += 32;
  push({
    event: {
      audioInput: {
        promptName: prompt,
        contentName: audioContent,
        content: frame.toString('base64'),
      },
    },
  });
}, 32);
const say = id => {
  speech = Buffer.concat([speech, pcmOf(join(FIXTURES, `${id}.wav`))]);
};

const log = [];
const contents = new Map();
const toolUses = new Map();
const turnAudio = new Map();
let audioOutBytes = 0;
let firstAudioAfterSpeech = [];
let waitingFirstAudio = false;
let lastUsage = null;
const usages = [];
let closedAt = null;
let closeReason = null;
const listeners = [];
const onEvent = fn => listeners.push(fn);
const waitFor = (pred, timeoutMs) =>
  new Promise(resolve => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    const fn = entry => {
      if (pred(entry)) {
        clearTimeout(timer);
        listeners.splice(listeners.indexOf(fn), 1);
        resolve(true);
      }
    };
    listeners.push(fn);
  });

const sendToolResult = (toolUseId, result) => {
  const name = randomUUID();
  push({
    event: {
      contentStart: {
        promptName: prompt,
        contentName: name,
        interactive: false,
        type: 'TOOL',
        role: 'TOOL',
        toolResultInputConfiguration: {
          toolUseId,
          type: 'TEXT',
          textInputConfiguration: { mediaType: 'text/plain' },
        },
      },
    },
  });
  push({
    event: {
      toolResult: { promptName: prompt, contentName: name, content: JSON.stringify(result) },
    },
  });
  push({ event: { contentEnd: { promptName: prompt, contentName: name } } });
};
const fakeTool = (toolName, input) =>
  toolName === ToolName.enum.searchBooks
    ? {
        query: input?.q ?? null,
        books: [
          { id: 27, title: 'Murder on the Orient Express', author: 'Agatha Christie', year: 1934 },
          { id: 28, title: 'And Then There Were None', author: 'Agatha Christie', year: 1939 },
        ],
      }
    : {
        status: 'pending_confirmation',
        summary: 'Nothing changed yet; the user must press Confirm.',
      };

const client = new BedrockRuntimeClient({
  region: REGION,
  requestHandler: new NodeHttp2Handler({
    requestTimeout: 600_000,
    sessionTimeout: 600_000,
    disableConcurrentStreams: false,
    maxConcurrentStreams: 20,
  }),
});
const outputLoop = (async () => {
  try {
    const response = await client.send(
      new InvokeModelWithBidirectionalStreamCommand({ modelId: MODEL, body })
    );
    for await (const part of response.body) {
      if (!part.chunk?.bytes) {
        const key = Object.keys(part)[0];
        log.push({ t: at(), type: `exception:${key}`, detail: String(part[key]?.message ?? '') });
        continue;
      }
      const event = JSON.parse(new TextDecoder().decode(part.chunk.bytes)).event ?? {};
      const type = Object.keys(event)[0];
      const e = event[type];
      const entry = { t: at(), type };
      if (type === 'contentStart') {
        let extra = {};
        try {
          extra = JSON.parse(e.additionalModelFields ?? '{}');
        } catch {
          extra = { raw: e.additionalModelFields };
        }
        contents.set(e.contentName ?? e.contentId, {
          role: e.role,
          type: e.type,
          stage: extra.generationStage,
        });
        Object.assign(entry, {
          role: e.role,
          contentType: e.type,
          stage: extra.generationStage,
          contentId: e.contentId,
        });
        if (e.type === 'AUDIO' && e.role === 'ASSISTANT') turnAudio.set(e.contentId, []);
      } else if (type === 'textOutput') {
        Object.assign(entry, { role: e.role, text: e.content, contentId: e.contentId });
      } else if (type === 'audioOutput') {
        const bytes = Buffer.from(e.content, 'base64');
        audioOutBytes += bytes.length;
        turnAudio.get(e.contentId)?.push(bytes);
        if (waitingFirstAudio && lastSpeechEnd !== null) {
          firstAudioAfterSpeech.push(at() - lastSpeechEnd);
          waitingFirstAudio = false;
        }
        entry.bytes = bytes.length;
      } else if (type === 'toolUse') {
        toolUses.set(e.toolUseId, e);
        Object.assign(entry, { toolName: e.toolName, toolUseId: e.toolUseId, content: e.content });
      } else if (type === 'contentEnd') {
        Object.assign(entry, {
          contentType: e.type,
          stopReason: e.stopReason,
          contentId: e.contentId,
        });
        if (e.type === 'TOOL') {
          for (const [id, use] of toolUses) {
            let input = {};
            try {
              input = JSON.parse(use.content);
            } catch {
              input = use.content;
            }
            sendToolResult(id, fakeTool(use.toolName, input));
            log.push({ t: at(), type: 'sent:toolResult', toolUseId: id });
            toolUses.delete(id);
          }
        }
      } else if (type === 'usageEvent') {
        lastUsage = e;
        usages.push({ t: at(), ...e });
        entry.usage = e;
      } else {
        entry.raw = JSON.stringify(e).slice(0, 300);
        if (type === 'userSpeechEnd') {
          lastSpeechEnd = at();
          waitingFirstAudio = true;
        }
      }
      if (type !== 'audioOutput' || entry.bytes === undefined) log.push(entry);
      else if (!log.length || log.at(-1).type !== 'audioOutput')
        log.push({ ...entry, note: 'first audioOutput of a run (later ones counted, not logged)' });
      for (const fn of [...listeners]) fn(entry);
    }
    closeReason = 'stream ended';
  } catch (error) {
    closeReason = `${error.name}: ${String(error.message).slice(0, 300)}`;
  } finally {
    closedAt = at();
    log.push({ t: closedAt, type: 'closed', reason: closeReason });
    for (const fn of [...listeners]) fn({ type: 'closed' });
  }
})();

const endOfTurn = () =>
  waitFor(
    e =>
      e.type === 'closed' ||
      (e.type === 'contentEnd' && e.contentType === 'TEXT' && e.stopReason === 'END_TURN'),
    45_000
  );
const phase = name => log.push({ t: at(), type: `phase:${name}` });

phase('A english + tool');
say('v-01');
waitingFirstAudio = true;
await endOfTurn();
await waitFor(e => e.type === 'closed', 3000);

phase('B barge-in');
say('v-11');
waitingFirstAudio = true;
await waitFor(e => e.type === 'audioOutput' || e.type === 'closed', 30_000);
await new Promise(resolve => setTimeout(resolve, 1500));
phase('B interrupt now');
say('v-11b');
await waitFor(e => e.type === 'closed', 15_000);

phase('C [app] text');
const textContent = randomUUID();
push({
  event: {
    contentStart: {
      promptName: prompt,
      contentName: textContent,
      type: 'TEXT',
      interactive: true,
      role: 'USER',
      textInputConfiguration: { mediaType: 'text/plain' },
    },
  },
});
push({
  event: {
    textInput: {
      promptName: prompt,
      contentName: textContent,
      content: '[app] The user confirmed: "Dune" was added to the reading list.',
    },
  },
});
push({ event: { contentEnd: { promptName: prompt, contentName: textContent } } });
await endOfTurn();
await waitFor(e => e.type === 'closed', 3000);

phase('D french');
const frenchStart = log.length;
say('v-12');
waitingFirstAudio = true;
await endOfTurn();
await waitFor(e => e.type === 'closed', 3000);

phase('E idle (no audio frames)');
streaming = false;
const idleStart = at();
await waitFor(e => e.type === 'closed', 7 * 60_000 - idleStart);
const idleMs = closedAt !== null && closedAt >= idleStart ? closedAt - idleStart : null;
clearInterval(ticker);

if (closedAt === null) {
  push({ event: { contentEnd: { promptName: prompt, contentName: audioContent } } });
  push({ event: { promptEnd: { promptName: prompt } } });
  push({ event: { sessionEnd: {} } });
  inputDone = true;
  wake?.();
  await Promise.race([outputLoop, new Promise(resolve => setTimeout(resolve, 10_000))]);
} else {
  inputDone = true;
  wake?.();
}

for (const [id, chunks] of turnAudio)
  if (chunks.length > 0)
    writeFileSync(join(OUT, `assistant-${id.slice(0, 8)}.wav`), wav(Buffer.concat(chunks), 24000));
const frenchAudio = log
  .slice(frenchStart)
  .filter(e => e.type === 'contentStart' && e.contentType === 'AUDIO' && e.role === 'ASSISTANT')
  .map(e => e.contentId);
const summary = {
  region: REGION,
  model: MODEL,
  voice: VOICE,
  invocationLogging: loggingConfig ? 'ON' : 'off',
  audioSentSeconds: audioSentMs / 1000,
  audioReceivedSeconds: audioOutBytes / 48000,
  lastUsage,
  usageEvents: usages.length,
  firstAudioAfterSpeechMs: firstAudioAfterSpeech,
  idleCloseMs: idleMs,
  closeReason,
  frenchAssistantAudio: frenchAudio.map(id => `assistant-${id.slice(0, 8)}.wav`),
};
writeFileSync(join(OUT, 'events.json'), JSON.stringify(log, null, 2));
writeFileSync(join(OUT, 'usage.json'), JSON.stringify(usages, null, 2));
writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
process.exit(0);
