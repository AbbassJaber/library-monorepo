import type { ToolSpec } from '../types.js';

export interface VoiceSessionConfig {
  system: string;
  tools: ToolSpec[];
  voiceId: string;
  endpointing?: 'HIGH' | 'MEDIUM' | 'LOW';
  maxTokens?: number;
  temperature?: number;
}

export interface VoiceUsage {
  speechIn: number;
  speechOut: number;
  textIn: number;
  textOut: number;
}

export type VoiceProviderEvent =
  | { type: 'userSpeechStart' }
  | { type: 'userSpeechEnd' }
  | {
      type: 'text';
      role: 'user' | 'assistant';
      stage: 'speculative' | 'final';
      contentId: string;
      text: string;
    }
  | { type: 'audio'; contentId: string; pcm: Uint8Array }
  | { type: 'toolUse'; toolUseId: string; name: string; input: unknown }
  | { type: 'interrupted' }
  | { type: 'turnEnd' }
  | { type: 'usage'; total: VoiceUsage }
  | { type: 'error'; message: string };

export interface VoiceStream {
  sendAudio(pcm: Uint8Array): void;
  sendToolResult(toolUseId: string, result: Record<string, unknown>): void;
  sendText(text: string): void;
  close(): Promise<void>;
  events: AsyncIterable<VoiceProviderEvent>;
}

export interface VoiceProvider {
  name: 'nova-sonic' | 'mock';
  model: string;
  region: string | null;
  open(config: VoiceSessionConfig): Promise<VoiceStream>;
}

export const createQueue = <T>() => {
  const items: T[] = [];
  let wake: (() => void) | null = null;
  let ended = false;
  return {
    push(item: T) {
      if (ended) return;
      items.push(item);
      wake?.();
    },
    end() {
      ended = true;
      wake?.();
    },
    get ended() {
      return ended;
    },
    async *[Symbol.asyncIterator](): AsyncGenerator<T> {
      for (;;) {
        while (items.length > 0) yield items.shift()!;
        if (ended) return;
        await new Promise<void>(resolve => (wake = resolve));
        wake = null;
      }
    },
  };
};
