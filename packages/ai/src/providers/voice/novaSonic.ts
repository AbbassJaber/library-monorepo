import { randomUUID } from 'node:crypto';
import { ProviderUnavailableError } from '../types.js';
import { createQueue } from './types.js';
import type {
  VoiceProvider,
  VoiceProviderEvent,
  VoiceSessionConfig,
  VoiceStream,
} from './types.js';
import { VoiceProviderName } from '@library/contracts';

export const DEFAULT_VOICE_ID = 'tiffany';

type Chunk = { chunk: { bytes: Uint8Array } };
export type NovaInvoke = (
  modelId: string,
  body: AsyncIterable<Chunk>
) => Promise<AsyncIterable<unknown>>;

export interface NovaSonicOptions {
  region: string;
  model: string;
  invoke?: NovaInvoke;
  timeoutMs?: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const sdkInvoke = (region: string, timeoutMs: number): NovaInvoke => {
  let client:
    Promise<{ send: (command: unknown) => Promise<{ body?: AsyncIterable<unknown> }> }> | undefined;
  let Command: (new (input: unknown) => unknown) | undefined;
  return async (modelId, body) => {
    client ??= (async () => {
      const [
        { BedrockRuntimeClient, InvokeModelWithBidirectionalStreamCommand },
        { NodeHttp2Handler },
      ] = await Promise.all([
        import('@aws-sdk/client-bedrock-runtime'),
        import('@smithy/node-http-handler'),
      ]);
      Command = InvokeModelWithBidirectionalStreamCommand as unknown as new (
        input: unknown
      ) => unknown;
      return new BedrockRuntimeClient({
        region,
        requestHandler: new NodeHttp2Handler({
          requestTimeout: timeoutMs,
          sessionTimeout: timeoutMs,
          disableConcurrentStreams: false,
          maxConcurrentStreams: 20,
        }),
      }) as unknown as { send: (command: unknown) => Promise<{ body?: AsyncIterable<unknown> }> };
    })();
    const ready = await client;
    const response = await ready.send(new Command!({ modelId, body }));
    if (!response.body) throw new ProviderUnavailableError('nova-sonic: no response stream');
    return response.body;
  };
};

const INTERRUPTED = /^\s*\{\s*"interrupted"\s*:\s*true\s*\}\s*$/;

export const createNovaSonicProvider = (options: NovaSonicOptions): VoiceProvider => {
  const invoke = options.invoke ?? sdkInvoke(options.region, options.timeoutMs ?? 600_000);
  return {
    name: VoiceProviderName.enum['nova-sonic'],
    model: options.model,
    region: options.region,
    async open(config: VoiceSessionConfig): Promise<VoiceStream> {
      const input = createQueue<Chunk>();
      const send = (event: Record<string, unknown>) =>
        input.push({ chunk: { bytes: encoder.encode(JSON.stringify({ event })) } });
      const promptName = randomUUID();
      const audioName = randomUUID();
      const textBlock = (role: 'SYSTEM' | 'USER', content: string, interactive: boolean) => {
        const contentName = randomUUID();
        send({
          contentStart: {
            promptName,
            contentName,
            type: 'TEXT',
            interactive,
            role,
            textInputConfiguration: { mediaType: 'text/plain' },
          },
        });
        send({ textInput: { promptName, contentName, content } });
        send({ contentEnd: { promptName, contentName } });
      };

      send({
        sessionStart: {
          inferenceConfiguration: {
            maxTokens: config.maxTokens ?? 1024,
            topP: 0.9,
            temperature: config.temperature ?? 0.7,
          },
          turnDetectionConfiguration: { endpointingSensitivity: config.endpointing ?? 'MEDIUM' },
        },
      });
      send({
        promptStart: {
          promptName,
          textOutputConfiguration: { mediaType: 'text/plain' },
          audioOutputConfiguration: {
            mediaType: 'audio/lpcm',
            sampleRateHertz: 24000,
            sampleSizeBits: 16,
            channelCount: 1,
            voiceId: config.voiceId,
            encoding: 'base64',
            audioType: 'SPEECH',
          },
          toolUseOutputConfiguration: { mediaType: 'application/json' },
          toolConfiguration: {
            tools: config.tools.map(tool => ({
              toolSpec: {
                name: tool.name,
                description: tool.description,
                inputSchema: { json: JSON.stringify(tool.inputSchema) },
              },
            })),
          },
        },
      });
      textBlock('SYSTEM', config.system, false);
      send({
        contentStart: {
          promptName,
          contentName: audioName,
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
      });

      let output: AsyncIterable<unknown>;
      try {
        output = await invoke(options.model, input);
      } catch (error) {
        input.end();
        throw new ProviderUnavailableError(
          `nova-sonic: ${String((error as Error).message)}`,
          error
        );
      }

      const events = createQueue<VoiceProviderEvent>();
      const contents = new Map<
        string,
        { role: string; type: string; stage: string | undefined; interrupted: boolean }
      >();
      const toolUses = new Map<string, { toolUseId: string; name: string; content: string }>();
      void (async () => {
        try {
          for await (const part of output) {
            const bytes = (part as Partial<Chunk>).chunk?.bytes;
            if (!bytes) {
              const key = Object.keys(part as object)[0] ?? 'unknown';
              events.push({
                type: 'error',
                message: `${key}: ${String((part as Record<string, { message?: string }>)[key]?.message ?? '')}`,
              });
              continue;
            }
            const event =
              (
                JSON.parse(decoder.decode(bytes)) as {
                  event?: Record<string, Record<string, unknown>>;
                }
              ).event ?? {};
            const [type] = Object.keys(event);
            const e = event[type ?? ''] ?? {};
            const contentId = String(e['contentId'] ?? e['contentName'] ?? '');
            switch (type) {
              case 'userSpeechStart':
                events.push({ type: 'userSpeechStart' });
                break;
              case 'userSpeechEnd':
                events.push({ type: 'userSpeechEnd' });
                break;
              case 'contentStart': {
                let stage: string | undefined;
                try {
                  stage = (
                    JSON.parse(String(e['additionalModelFields'] ?? '{}')) as {
                      generationStage?: string;
                    }
                  ).generationStage;
                } catch {
                  stage = undefined;
                }
                contents.set(contentId, {
                  role: String(e['role']),
                  type: String(e['type']),
                  stage,
                  interrupted: false,
                });
                break;
              }
              case 'textOutput': {
                const content = contents.get(contentId);
                const text = String(e['content'] ?? '');
                if (INTERRUPTED.test(text)) {
                  if (content) content.interrupted = true;
                  events.push({ type: 'interrupted' });
                  break;
                }
                const role = String(e['role'] ?? content?.role) === 'USER' ? 'user' : 'assistant';
                events.push({
                  type: 'text',
                  role,
                  stage:
                    role === 'user' || content?.stage !== 'SPECULATIVE' ? 'final' : 'speculative',
                  contentId,
                  text,
                });
                break;
              }
              case 'audioOutput':
                events.push({
                  type: 'audio',
                  contentId,
                  pcm: new Uint8Array(Buffer.from(String(e['content'] ?? ''), 'base64')),
                });
                break;
              case 'toolUse':
                toolUses.set(contentId, {
                  toolUseId: String(e['toolUseId']),
                  name: String(e['toolName']),
                  content: String(e['content'] ?? '{}'),
                });
                break;
              case 'contentEnd': {
                const content = contents.get(contentId);
                if (String(e['type']) === 'TOOL') {
                  const use = toolUses.get(contentId) ?? [...toolUses.values()][0];
                  if (use) {
                    toolUses.delete([...toolUses.entries()].find(([, value]) => value === use)![0]);
                    let parsed: unknown;
                    try {
                      parsed = JSON.parse(use.content);
                    } catch {
                      parsed = use.content;
                    }
                    events.push({
                      type: 'toolUse',
                      toolUseId: use.toolUseId,
                      name: use.name,
                      input: parsed,
                    });
                  }
                } else if (e['stopReason'] === 'INTERRUPTED') {
                  if (!content?.interrupted) events.push({ type: 'interrupted' });
                } else if (
                  e['stopReason'] === 'END_TURN' &&
                  String(e['type']) === 'TEXT' &&
                  content?.role === 'ASSISTANT' &&
                  content.stage === 'FINAL'
                ) {
                  events.push({ type: 'turnEnd' });
                }
                contents.delete(contentId);
                break;
              }
              case 'usageEvent': {
                const total = (
                  e['details'] as
                    | {
                        total?: { input?: Record<string, number>; output?: Record<string, number> };
                      }
                    | undefined
                )?.total;
                if (total)
                  events.push({
                    type: 'usage',
                    total: {
                      speechIn: total.input?.['speechTokens'] ?? 0,
                      textIn: total.input?.['textTokens'] ?? 0,
                      speechOut: total.output?.['speechTokens'] ?? 0,
                      textOut: total.output?.['textTokens'] ?? 0,
                    },
                  });
                break;
              }
              default:
                break;
            }
          }
        } catch (error) {
          events.push({ type: 'error', message: String((error as Error).message ?? error) });
        } finally {
          input.end();
          events.end();
        }
      })();

      let closed = false;
      return {
        sendAudio(pcm) {
          if (closed) return;
          send({
            audioInput: {
              promptName,
              contentName: audioName,
              content: Buffer.from(pcm).toString('base64'),
            },
          });
        },
        sendToolResult(toolUseId, result) {
          if (closed) return;
          const contentName = randomUUID();
          send({
            contentStart: {
              promptName,
              contentName,
              interactive: false,
              type: 'TOOL',
              role: 'TOOL',
              toolResultInputConfiguration: {
                toolUseId,
                type: 'TEXT',
                textInputConfiguration: { mediaType: 'text/plain' },
              },
            },
          });
          send({ toolResult: { promptName, contentName, content: JSON.stringify(result) } });
          send({ contentEnd: { promptName, contentName } });
        },
        sendText(text) {
          if (!closed) textBlock('USER', text, true);
        },
        async close() {
          if (closed) return;
          closed = true;
          send({ contentEnd: { promptName, contentName: audioName } });
          send({ promptEnd: { promptName } });
          send({ sessionEnd: {} });
          input.end();
        },
        events,
      };
    },
  };
};
