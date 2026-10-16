export interface Shortcut {
  key: string;
  mod: boolean;
}

export const SHORTCUTS = {
  commandMenu: { key: 'k', mod: true },
} as const satisfies Record<string, Shortcut>;

export const isApplePlatform = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform;
  return /mac|iphone|ipad|ipod/i.test(platform);
};

export const matchesShortcut = (event: KeyboardEvent, shortcut: Shortcut): boolean => {
  const mod = isApplePlatform() ? event.metaKey : event.ctrlKey;
  return mod === shortcut.mod && !event.altKey && event.key.toLowerCase() === shortcut.key;
};

export const shortcutLabel = (shortcut: Shortcut): string => {
  const key = shortcut.key.toUpperCase();
  if (!shortcut.mod) return key;
  return isApplePlatform() ? `⌘${key}` : `Ctrl ${key}`;
};
