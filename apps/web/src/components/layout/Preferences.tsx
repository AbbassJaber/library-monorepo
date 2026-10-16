import { UI_LOCALES } from '@library/domain-config';
import type { UiLocale } from '@library/domain-config';
import { Moon, Sun, SunMoon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '@/components/ui';
import { isUiLocale } from '@/i18n';
import { cn } from '@/lib/cn';
import { THEMES, useUiStore } from '@/stores/uiStore';
import type { Theme } from '@/stores/uiStore';

const nextTheme: Record<Theme, Theme> = {
  [THEMES.dark]: THEMES.light,
  [THEMES.light]: THEMES.system,
  [THEMES.system]: THEMES.dark,
};
const themeIcon: Record<Theme, typeof Sun> = {
  [THEMES.system]: SunMoon,
  [THEMES.light]: Sun,
  [THEMES.dark]: Moon,
};

export const LanguageSwitcher = ({ className }: { className?: string }) => {
  const { t } = useTranslation();
  const locale = useUiStore(s => s.locale);
  const setLocale = useUiStore(s => s.setLocale);
  return (
    <label className={cn('inline-flex min-w-0 items-center', className)}>
      <span className="sr-only">{t('language.label')}</span>
      <select
        value={locale}
        onChange={event => {
          const next = event.target.value;
          if (isUiLocale(next)) setLocale(next);
        }}
        className="target w-full min-w-0 rounded-control border border-line bg-input px-2.5 text-small text-fg hover:border-line-strong"
      >
        {UI_LOCALES.map(code => (
          <option key={code} value={code} lang={code}>
            {t(`language.${code satisfies UiLocale}`)}
          </option>
        ))}
      </select>
    </label>
  );
};

export const ThemeToggle = () => {
  const { t } = useTranslation();
  const theme = useUiStore(s => s.theme);
  const setTheme = useUiStore(s => s.setTheme);
  const ThemeIcon = themeIcon[theme];
  return (
    <IconButton
      label={`${t(`theme.${theme}`)} (${t('theme.change')})`}
      icon={<ThemeIcon className="size-5" aria-hidden="true" />}
      onClick={() => setTheme(nextTheme[theme])}
      className="border-line"
    />
  );
};
