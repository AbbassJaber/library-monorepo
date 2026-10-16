import { useTranslation } from 'react-i18next';

export const useFormat = () => {
  const { i18n } = useTranslation();
  const locale = i18n.language;
  return {
    rating: (value: number) =>
      new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
        value
      ),
    integer: (value: number) => new Intl.NumberFormat(locale).format(value),
    language: (code: string): string => {
      try {
        return new Intl.DisplayNames(locale, { type: 'language' }).of(code) ?? code;
      } catch {
        return code;
      }
    },
    year: (value: number) => new Intl.NumberFormat(locale, { useGrouping: false }).format(value),
    day: (iso: string) =>
      new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(iso)),
    date: (iso: string) =>
      new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(iso)
      ),
  };
};
