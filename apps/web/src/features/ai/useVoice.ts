import { API_PREFIX, apiPaths, VoiceMode } from '@library/contracts';
import { useAiStatus } from './queries';

export const voiceSupported = (): boolean =>
  typeof window !== 'undefined' &&
  window.isSecureContext &&
  typeof navigator.mediaDevices?.getUserMedia === 'function' &&
  typeof window.AudioContext === 'function' &&
  typeof window.AudioWorkletNode === 'function';

export const useCanTalk = (): boolean | undefined => {
  const status = useAiStatus();
  if (!status.data) return undefined;
  return status.data.voiceMode === VoiceMode.enum.server && voiceSupported();
};

export const voiceUrl = (): string => {
  const base = (import.meta.env['VITE_API_BASE'] as string | undefined) ?? API_PREFIX;
  const url = new URL(`${base}${apiPaths.ai.voice}`, window.location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
};
