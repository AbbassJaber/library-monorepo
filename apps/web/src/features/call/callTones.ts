export const TONE_MS = 120;
const TONE_GAIN = 0.06;
const TONES = {
  connect: [660, 880],
  end: [880, 520],
} as const;
export type ToneKind = keyof typeof TONES;

export const playTone = (context: AudioContext, kind: ToneKind): Promise<void> => {
  try {
    if (typeof context.createOscillator !== 'function') return Promise.resolve();
    const [from, to] = TONES[kind];
    const start = context.currentTime;
    const seconds = TONE_MS / 1000;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.setValueAtTime(to, start + seconds / 2);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(TONE_GAIN, start + 0.01);
    gain.gain.setValueAtTime(TONE_GAIN, start + seconds - 0.02);
    gain.gain.linearRampToValueAtTime(0, start + seconds);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + seconds);
    return new Promise(resolve => {
      oscillator.onended = () => resolve();
      setTimeout(resolve, TONE_MS + 50);
    });
  } catch {
    return Promise.resolve();
  }
};
