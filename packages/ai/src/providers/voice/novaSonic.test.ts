import { describe, expect, it } from 'vitest';
import { createNovaSonicProvider } from './novaSonic.js';
import { createQueue } from './types.js';
import type { VoiceProviderEvent, VoiceSessionConfig } from './types.js';

type Wire = Record<string, Record<string, unknown>>;

const fakeBedrock = () => {
  const sent: Wire[] = [];
  const output = createQueue<{ chunk: { bytes: Uint8Array } }>();
  let inputEnded = false;
  const invoke = async (
    _modelId: string,
    body: AsyncIterable<{ chunk: { bytes: Uint8Array } }>
  ) => {
    void (async () => {
      for await (const part of body)
        sent.push(JSON.parse(new TextDecoder().decode(part.chunk.bytes)).event);
      inputEnded = true;
      output.end();
    })();
    return output;
  };
  const emit = (event: Record<string, unknown>) =>
    output.push({ chunk: { bytes: new TextEncoder().encode(JSON.stringify({ event })) } });
  const types = () => sent.map(event => Object.keys(event)[0]);
  return { sent, emit, invoke, types, output, inputEnded: () => inputEnded };
};

const config: VoiceSessionConfig = {
  system: 'You are the library voice assistant.',
  tools: [
    {
      name: 'searchBooks',
      description: 'Search the catalog.',
      inputSchema: { type: 'object', properties: { q: { type: 'string' } } },
    },
  ],
  voiceId: 'tiffany',
  endpointing: 'MEDIUM',
};

const tick = () => new Promise(resolve => setTimeout(resolve, 5));
const collect = async (
  events: AsyncIterable<VoiceProviderEvent>,
  until: (e: VoiceProviderEvent[]) => boolean
) => {
  const seen: VoiceProviderEvent[] = [];
  for await (const event of events) {
    seen.push(event);
    if (until(seen)) break;
  }
  return seen;
};

const contentStart = (contentId: string, role: string, type: string, stage?: string) => ({
  contentStart: {
    contentId,
    role,
    type,
    ...(stage ? { additionalModelFields: JSON.stringify({ generationStage: stage }) } : {}),
  },
});

describe('Nova 2 Sonic adapter', () => {
  it('opens in the documented order: session, prompt with tools and voice, system text, then the audio block', async () => {
    const fake = fakeBedrock();
    const provider = createNovaSonicProvider({
      region: 'eu-north-1',
      model: 'nova',
      invoke: fake.invoke,
    });
    await provider.open(config);
    await tick();
    expect(fake.types()).toEqual([
      'sessionStart',
      'promptStart',
      'contentStart',
      'textInput',
      'contentEnd',
      'contentStart',
    ]);
    const [session, prompt, system, text, , audio] = fake.sent;
    expect(session!['sessionStart']).toMatchObject({
      turnDetectionConfiguration: { endpointingSensitivity: 'MEDIUM' },
    });
    const promptStart = prompt!['promptStart'] as {
      audioOutputConfiguration: { voiceId: string; sampleRateHertz: number };
      toolConfiguration: {
        tools: Array<{ toolSpec: { name: string; inputSchema: { json: string } } }>;
      };
    };
    expect(promptStart.audioOutputConfiguration).toMatchObject({
      voiceId: 'tiffany',
      sampleRateHertz: 24000,
    });
    expect(JSON.parse(promptStart.toolConfiguration.tools[0]!.toolSpec.inputSchema.json)).toEqual(
      config.tools[0]!.inputSchema
    );
    expect(system!['contentStart']).toMatchObject({
      type: 'TEXT',
      role: 'SYSTEM',
      interactive: false,
    });
    expect(text!['textInput']).toMatchObject({ content: config.system });
    expect(audio!['contentStart']).toMatchObject({
      type: 'AUDIO',
      role: 'USER',
      interactive: true,
      audioInputConfiguration: { sampleRateHertz: 16000, sampleSizeBits: 16, channelCount: 1 },
    });
  });

  it('relays audio as base64 audioInput in the open audio block', async () => {
    const fake = fakeBedrock();
    const stream = await createNovaSonicProvider({
      region: 'r',
      model: 'm',
      invoke: fake.invoke,
    }).open(config);
    stream.sendAudio(new Uint8Array([1, 2, 3, 4]));
    await tick();
    const audioName = (fake.sent[5]!['contentStart'] as { contentName: string }).contentName;
    expect(fake.sent.at(-1)!['audioInput']).toMatchObject({
      contentName: audioName,
      content: Buffer.from([1, 2, 3, 4]).toString('base64'),
    });
  });

  it('a toolUse is reported when its TOOL block ends, and the result goes back under the same toolUseId', async () => {
    const fake = fakeBedrock();
    const stream = await createNovaSonicProvider({
      region: 'r',
      model: 'm',
      invoke: fake.invoke,
    }).open(config);
    fake.emit(contentStart('t1', 'TOOL', 'TOOL'));
    fake.emit({
      toolUse: { toolName: 'searchBooks', toolUseId: 'use-1', content: '{"q":"agatha christie"}' },
    });
    fake.emit({ contentEnd: { contentId: 't1', type: 'TOOL', stopReason: 'TOOL_USE' } });
    const [event] = await collect(stream.events, seen => seen.some(e => e.type === 'toolUse'));
    expect(event).toEqual({
      type: 'toolUse',
      toolUseId: 'use-1',
      name: 'searchBooks',
      input: { q: 'agatha christie' },
    });
    stream.sendToolResult('use-1', { books: [{ id: 27 }] });
    await tick();
    const [start, result, end] = fake.sent.slice(-3);
    expect(start!['contentStart']).toMatchObject({
      type: 'TOOL',
      role: 'TOOL',
      toolResultInputConfiguration: { toolUseId: 'use-1', type: 'TEXT' },
    });
    expect(JSON.parse((result!['toolResult'] as { content: string }).content)).toEqual({
      books: [{ id: 27 }],
    });
    expect(end!['contentEnd']).toBeDefined();
  });

  it('marks assistant text SPECULATIVE or FINAL, user text FINAL, and forwards audio as bytes', async () => {
    const fake = fakeBedrock();
    const stream = await createNovaSonicProvider({
      region: 'r',
      model: 'm',
      invoke: fake.invoke,
    }).open(config);
    fake.emit({ userSpeechStart: {} });
    fake.emit({ userSpeechEnd: {} });
    fake.emit(contentStart('u1', 'USER', 'TEXT', 'FINAL'));
    fake.emit({ textOutput: { contentId: 'u1', role: 'USER', content: 'do you have dune?' } });
    fake.emit(contentStart('a1', 'ASSISTANT', 'TEXT', 'SPECULATIVE'));
    fake.emit({ textOutput: { contentId: 'a1', role: 'ASSISTANT', content: 'Yes, Dune.' } });
    fake.emit(contentStart('a2', 'ASSISTANT', 'AUDIO'));
    fake.emit({
      audioOutput: { contentId: 'a2', content: Buffer.from([9, 9]).toString('base64') },
    });
    fake.emit({ contentEnd: { contentId: 'a2', type: 'AUDIO', stopReason: 'END_TURN' } });
    fake.emit(contentStart('a3', 'ASSISTANT', 'TEXT', 'FINAL'));
    fake.emit({ textOutput: { contentId: 'a3', role: 'ASSISTANT', content: 'Yes, Dune.' } });
    fake.emit({ contentEnd: { contentId: 'a3', type: 'TEXT', stopReason: 'END_TURN' } });
    const seen = await collect(stream.events, all => all.some(e => e.type === 'turnEnd'));
    expect(seen.map(e => (e.type === 'text' ? `${e.role}:${e.stage}:${e.text}` : e.type))).toEqual([
      'userSpeechStart',
      'userSpeechEnd',
      'user:final:do you have dune?',
      'assistant:speculative:Yes, Dune.',
      'audio',
      'assistant:final:Yes, Dune.',
      'turnEnd',
    ]);
    expect(seen.find(e => e.type === 'audio')).toMatchObject({ pcm: new Uint8Array([9, 9]) });
  });

  it('reports a barge-in once, from either form (the interrupted text or the INTERRUPTED stop reason)', async () => {
    const fake = fakeBedrock();
    const stream = await createNovaSonicProvider({
      region: 'r',
      model: 'm',
      invoke: fake.invoke,
    }).open(config);
    fake.emit(contentStart('b1', 'ASSISTANT', 'TEXT', 'FINAL'));
    fake.emit({
      textOutput: { contentId: 'b1', role: 'ASSISTANT', content: '{ "interrupted" : true }' },
    });
    fake.emit({ contentEnd: { contentId: 'b1', type: 'TEXT', stopReason: 'INTERRUPTED' } });
    fake.emit(contentStart('b2', 'ASSISTANT', 'TEXT', 'FINAL'));
    fake.emit({ contentEnd: { contentId: 'b2', type: 'TEXT', stopReason: 'INTERRUPTED' } });
    fake.emit({
      usageEvent: {
        details: {
          total: {
            input: { speechTokens: 5, textTokens: 7 },
            output: { speechTokens: 11, textTokens: 13 },
          },
        },
      },
    });
    const seen = await collect(stream.events, all => all.some(e => e.type === 'usage'));
    expect(seen).toEqual([
      { type: 'interrupted' },
      { type: 'interrupted' },
      { type: 'usage', total: { speechIn: 5, textIn: 7, speechOut: 11, textOut: 13 } },
    ]);
  });

  it('injects [app] text as an interactive user block, and closes in order', async () => {
    const fake = fakeBedrock();
    const stream = await createNovaSonicProvider({
      region: 'r',
      model: 'm',
      invoke: fake.invoke,
    }).open(config);
    stream.sendText('[app] The user confirmed.');
    await tick();
    expect(fake.sent.slice(-3).map(e => Object.keys(e)[0])).toEqual([
      'contentStart',
      'textInput',
      'contentEnd',
    ]);
    expect(fake.sent.at(-3)!['contentStart']).toMatchObject({
      type: 'TEXT',
      role: 'USER',
      interactive: true,
    });
    expect(fake.sent.at(-2)!['textInput']).toMatchObject({ content: '[app] The user confirmed.' });
    const closing = stream.close();
    for await (const _ of stream.events) void _;
    await closing;
    const audioName = (fake.sent[5]!['contentStart'] as { contentName: string }).contentName;
    expect(fake.sent.slice(-3)).toEqual([
      { contentEnd: expect.objectContaining({ contentName: audioName }) },
      { promptEnd: expect.any(Object) },
      { sessionEnd: {} },
    ]);
    expect(fake.inputEnded()).toBe(true);
  });

  it('a stream error becomes an error event, then the events end', async () => {
    const fake = fakeBedrock();
    const failing = async (
      modelId: string,
      body: AsyncIterable<{ chunk: { bytes: Uint8Array } }>
    ) => {
      await fake.invoke(modelId, body);
      return (async function* () {
        yield {
          chunk: {
            bytes: new TextEncoder().encode(JSON.stringify({ event: { userSpeechStart: {} } })),
          },
        };
        throw new Error('Timed out waiting for audio bytes');
      })();
    };
    const stream = await createNovaSonicProvider({ region: 'r', model: 'm', invoke: failing }).open(
      config
    );
    const seen: VoiceProviderEvent[] = [];
    for await (const event of stream.events) seen.push(event);
    expect(seen).toEqual([
      { type: 'userSpeechStart' },
      { type: 'error', message: 'Timed out waiting for audio bytes' },
    ]);
  });
});
