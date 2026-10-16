import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createNovaSonicProvider } from './novaSonic.js';
import type { VoiceProviderEvent } from './types.js';

const enabled = process.env['VOICE_PROVIDER_TESTS'] === '1' && Boolean(process.env['VOICE_MODEL']);
const FIXTURE = join(import.meta.dirname, '../../../../ai-eval/fixtures/voice/v-01.wav');

const pcmOf = (file: string) => {
  const buf = readFileSync(file);
  for (let offset = 12; offset < buf.length;) {
    const size = buf.readUInt32LE(offset + 4);
    if (buf.toString('ascii', offset, offset + 4) === 'data')
      return buf.subarray(offset + 8, offset + 8 + size);
    offset += 8 + size + (size % 2);
  }
  throw new Error('no data chunk');
};

describe.skipIf(!enabled)('Nova 2 Sonic contract (real)', () => {
  it('hears the request, calls the tool, and answers after an object tool result', async () => {
    const stream = await createNovaSonicProvider({
      region: process.env['VOICE_AWS_REGION'] || 'eu-north-1',
      model: process.env['VOICE_MODEL']!,
    }).open({
      system:
        'You are a library voice assistant. Use searchBooks to look books up. Answer in one sentence.',
      tools: [
        {
          name: 'searchBooks',
          description: 'Search the catalog by text.',
          inputSchema: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
        },
      ],
      voiceId: 'tiffany',
    });
    const speech = pcmOf(FIXTURE);
    const silence = new Uint8Array(1024);
    let offset = 0;
    const pacer = setInterval(() => {
      const frame = offset < speech.length ? speech.subarray(offset, offset + 1024) : silence;
      offset += 1024;
      stream.sendAudio(frame);
    }, 32);
    const seen: VoiceProviderEvent[] = [];
    const timeout = setTimeout(() => void stream.close(), 30_000);
    for await (const event of stream.events) {
      seen.push(event);
      if (event.type === 'toolUse')
        stream.sendToolResult(event.toolUseId, {
          books: [
            {
              id: 27,
              title: 'Murder on the Orient Express',
              author: 'Agatha Christie',
              year: 1934,
            },
          ],
        });
      if (event.type === 'turnEnd') break;
    }
    clearInterval(pacer);
    clearTimeout(timeout);
    await stream.close();
    expect(seen).toContainEqual(
      expect.objectContaining({
        type: 'text',
        role: 'user',
        text: expect.stringMatching(/agatha christie/i),
      })
    );
    expect(seen).toContainEqual(expect.objectContaining({ type: 'toolUse', name: 'searchBooks' }));
    expect(seen.some(event => event.type === 'audio')).toBe(true);
    expect(seen).toContainEqual(
      expect.objectContaining({
        type: 'text',
        role: 'assistant',
        stage: 'final',
        text: expect.stringMatching(/orient express/i),
      })
    );
  }, 60_000);
});
