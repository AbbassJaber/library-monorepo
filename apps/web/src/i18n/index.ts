import { UI_LOCALE, UI_LOCALES } from '@library/domain-config';
import type { UiLocale } from '@library/domain-config';
import i18n from 'i18next';
import type { Resource } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { applyZodLocale } from './zod';

export const NAMESPACES = [
  'common',
  'auth',
  'home',
  'catalog',
  'books',
  'shelf',
  'favorites',
  'librarian',
] as const;
export type Namespace = (typeof NAMESPACES)[number];
export const DEFAULT_NS: Namespace = 'common';

export const isUiLocale = (value: unknown): value is UiLocale =>
  typeof value === 'string' && (UI_LOCALES as readonly string[]).includes(value);

export const detectLocale = (): UiLocale => {
  const short = (globalThis.navigator?.language ?? 'en').slice(0, 2).toLowerCase();
  return isUiLocale(short) ? short : UI_LOCALE.en;
};

const lazyBackend = {
  type: 'backend' as const,
  init(): void {},
  read(language: string, namespace: string, callback: (err: unknown, data: unknown) => void) {
    import(`../locales/${language}/${namespace}.json`).then(
      module => callback(null, (module as { default: unknown }).default),
      (error: unknown) => callback(error, null)
    );
  },
};

let initialized: Promise<unknown> = Promise.resolve();

export const initI18n = (
  locale: UiLocale,
  options: { resources?: Resource } = {}
): Promise<unknown> => {
  applyZodLocale(locale);
  const instance = options.resources ? i18n : i18n.use(lazyBackend);
  const ready = instance.use(initReactI18next).init({
    lng: locale,
    fallbackLng: 'en',
    supportedLngs: UI_LOCALES,
    ns: options.resources ? [...NAMESPACES] : [DEFAULT_NS],
    defaultNS: DEFAULT_NS,
    interpolation: { escapeValue: false },
    returnNull: false,
    react: { useSuspense: true },
    ...(options.resources ? { resources: options.resources, initAsync: false } : {}),
  });
  i18n.services.formatter?.add('lowercase', value =>
    typeof value === 'string' ? value.toLowerCase() : String(value)
  );
  initialized = ready;
  return ready;
};

export const setLocale = async (locale: UiLocale): Promise<void> => {
  if (i18n.language !== locale) await i18n.changeLanguage(locale);
  document.documentElement.lang = locale;
  applyZodLocale(locale);
};

export const loadNamespaces = async (...namespaces: Namespace[]): Promise<void> => {
  await initialized;
  await i18n.loadNamespaces(namespaces);
};

export { i18n };
