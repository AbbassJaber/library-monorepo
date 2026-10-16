import { Suspense, lazy, useEffect } from 'react';
import { useCallStore } from '@/stores/callStore';
import { endCall } from './callSession';

const CallScreen = lazy(() =>
  import('./CallScreen').then(module => ({ default: module.CallScreen }))
);
const CallPill = lazy(() => import('./CallPill').then(module => ({ default: module.CallPill })));

export const CallLayer = () => {
  const phase = useCallStore(s => s.phase);
  const view = useCallStore(s => s.view);
  useEffect(
    () => () => {
      if (useCallStore.getState().phase !== 'idle') endCall();
    },
    []
  );
  if (phase === 'idle') return null;
  return <Suspense fallback={null}>{view === 'full' ? <CallScreen /> : <CallPill />}</Suspense>;
};
