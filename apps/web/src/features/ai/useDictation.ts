import type { ChatLocale } from '@library/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCallStore } from '@/stores/callStore';
import { toast } from '@/stores/uiStore';

export const DICTATION_SILENCE_MS = 8000;
const DICTATION_LANG: Record<ChatLocale, string> = { en: 'en-US', fr: 'fr-FR' };

interface RecognitionResult {
  readonly isFinal: boolean;
  readonly 0: { readonly transcript: string };
}
interface RecognitionEvent {
  readonly resultIndex: number;
  readonly results: ArrayLike<RecognitionResult>;
}
export interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type RecognitionConstructor = new () => Recognition;

const recognitionClass = (): RecognitionConstructor | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export const dictationSupported = (): boolean => recognitionClass() !== null;

type DictationErrorKey =
  | 'dictation.errors.notAllowed'
  | 'dictation.errors.noSpeech'
  | 'dictation.errors.network'
  | 'dictation.errors.other';
const ERROR_KEYS: Record<string, DictationErrorKey> = {
  'not-allowed': 'dictation.errors.notAllowed',
  'service-not-allowed': 'dictation.errors.notAllowed',
  'audio-capture': 'dictation.errors.notAllowed',
  'no-speech': 'dictation.errors.noSpeech',
  network: 'dictation.errors.network',
};

export const useDictation = (locale: ChatLocale, onFinal: (text: string) => void) => {
  const { t } = useTranslation();
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const recognition = useRef<Recognition | null>(null);
  const silence = useRef<ReturnType<typeof setTimeout> | null>(null);
  const final = useRef(onFinal);
  useEffect(() => {
    final.current = onFinal;
  }, [onFinal]);

  const stop = useCallback(() => {
    if (silence.current) clearTimeout(silence.current);
    silence.current = null;
    recognition.current?.stop();
  }, []);

  const armSilence = useCallback(() => {
    if (silence.current) clearTimeout(silence.current);
    silence.current = setTimeout(stop, DICTATION_SILENCE_MS);
  }, [stop]);

  const start = useCallback(() => {
    const Recognizer = recognitionClass();
    if (!Recognizer || recognition.current) return;
    const r = new Recognizer();
    r.lang = DICTATION_LANG[locale];
    r.continuous = true;
    r.interimResults = true;
    r.onresult = event => {
      armSilence();
      let heard = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result) continue;
        const text = result[0].transcript;
        if (result.isFinal) final.current(text.trim());
        else heard += text;
      }
      setInterim(heard.trim());
    };
    r.onerror = event => {
      if (event.error === 'aborted') return;
      toast(t(ERROR_KEYS[event.error] ?? 'dictation.errors.other'), 'error');
    };
    r.onend = () => {
      if (silence.current) clearTimeout(silence.current);
      silence.current = null;
      recognition.current = null;
      setListening(false);
      setInterim('');
    };
    recognition.current = r;
    try {
      r.start();
      setListening(true);
      armSilence();
    } catch {
      recognition.current = null;
      toast(t('dictation.errors.other'), 'error');
    }
  }, [armSilence, locale, t]);

  const callPhase = useCallStore(s => s.phase);
  useEffect(() => {
    if (callPhase !== 'idle') stop();
  }, [callPhase, stop]);

  useEffect(
    () => () => {
      if (silence.current) clearTimeout(silence.current);
      recognition.current?.abort();
    },
    []
  );

  return { listening, interim, start, stop };
};
