import { describe, expect, it } from 'vitest';
import { selectVoiceProvider } from './select.js';

describe('voice provider selection', () => {
  it('is off by default, mock offline, and nova-sonic only with its env-only model id', () => {
    expect(selectVoiceProvider({})).toBeNull();
    expect(selectVoiceProvider({ VOICE_PROVIDER: 'mock' })).toMatchObject({
      name: 'mock',
      region: null,
    });
    expect(() => selectVoiceProvider({ VOICE_PROVIDER: 'nova-sonic' })).toThrow(/VOICE_MODEL/);
    expect(
      selectVoiceProvider({ VOICE_PROVIDER: 'nova-sonic', VOICE_MODEL: 'amazon.nova-2-sonic-v1:0' })
    ).toMatchObject({
      name: 'nova-sonic',
      model: 'amazon.nova-2-sonic-v1:0',
      region: 'eu-north-1',
    });
    expect(() => selectVoiceProvider({ VOICE_PROVIDER: 'whisper' })).toThrow(
      /off\|mock\|nova-sonic/
    );
  });
});
