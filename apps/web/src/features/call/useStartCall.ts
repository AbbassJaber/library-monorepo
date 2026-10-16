import { useCallback } from 'react';
import { useUiStore } from '@/stores/uiStore';
import { startCall } from './callSession';

export const useStartCall = () => {
  const locale = useUiStore(s => s.locale);
  return useCallback(() => void startCall(locale), [locale]);
};
