export const THEMES = { dark: 'dark', light: 'light', system: 'system' } as const;
export type Theme = (typeof THEMES)[keyof typeof THEMES];
export const DEFAULT_THEME: Theme = THEMES.dark;
export const UI_STORAGE_KEY = 'library-ui';
