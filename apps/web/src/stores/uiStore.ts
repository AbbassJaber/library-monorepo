import type { UiLocale } from '@library/domain-config';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { detectLocale } from '@/i18n';
import { DEFAULT_THEME, THEMES, UI_STORAGE_KEY } from '@/lib/preferences';
import type { Theme } from '@/lib/preferences';

export { DEFAULT_THEME, THEMES, UI_STORAGE_KEY } from '@/lib/preferences';
export type { Theme } from '@/lib/preferences';
export type CatalogViewMode = 'pages' | 'scroll';
export const CATALOG_LAYOUTS = { covers: 'covers', table: 'table' } as const;
export type CatalogLayout = (typeof CATALOG_LAYOUTS)[keyof typeof CATALOG_LAYOUTS];

export interface Toast {
  id: number;
  tone: 'info' | 'success' | 'error';
  message: string;
}

interface UiState {
  theme: Theme;
  locale: UiLocale;
  catalogViewMode: CatalogViewMode;
  catalogLayout: CatalogLayout;
  toasts: Toast[];
  setTheme: (theme: Theme) => void;
  setLocale: (locale: UiLocale) => void;
  setCatalogViewMode: (mode: CatalogViewMode) => void;
  setCatalogLayout: (layout: CatalogLayout) => void;
  toast: (message: string, tone?: Toast['tone']) => void;
  dismissToast: (id: number) => void;
}

let nextToastId = 1;

export const useUiStore = create<UiState>()(
  persist(
    set => ({
      theme: DEFAULT_THEME,
      locale: detectLocale(),
      catalogViewMode: 'pages',
      catalogLayout: CATALOG_LAYOUTS.covers,
      toasts: [],
      setTheme: theme => set({ theme }),
      setLocale: locale => set({ locale }),
      setCatalogViewMode: catalogViewMode => set({ catalogViewMode }),
      setCatalogLayout: catalogLayout => set({ catalogLayout }),
      toast: (message, tone = 'info') =>
        set(state => ({ toasts: [...state.toasts, { id: nextToastId++, tone, message }] })),
      dismissToast: id => set(state => ({ toasts: state.toasts.filter(t => t.id !== id) })),
    }),
    {
      name: UI_STORAGE_KEY,
      partialize: state => ({
        theme: state.theme,
        locale: state.locale,
        catalogViewMode: state.catalogViewMode,
        catalogLayout: state.catalogLayout,
      }),
    }
  )
);

export const toast = (message: string, tone?: Toast['tone']): void =>
  useUiStore.getState().toast(message, tone);

export const applyTheme = (theme: Theme): void => {
  const root = document.documentElement;
  if (theme === THEMES.system) root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
};
