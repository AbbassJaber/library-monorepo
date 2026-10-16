import { useEffect } from 'react';
import { useUiStore } from '@/stores/uiStore';
import { setLocale } from './index';

export const useLocaleSync = (): void => {
  const locale = useUiStore(s => s.locale);
  useEffect(() => void setLocale(locale), [locale]);
};
