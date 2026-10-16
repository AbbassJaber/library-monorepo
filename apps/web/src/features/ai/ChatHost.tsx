import { Suspense, lazy, useState } from 'react';
import { useChatStore } from '@/stores/chatStore';

const ChatPanel = lazy(() => import('./ChatPanel').then(module => ({ default: module.ChatPanel })));

export const ChatHost = () => {
  const open = useChatStore(s => s.open);
  const [loaded, setLoaded] = useState(open);
  if (open && !loaded) setLoaded(true);
  if (!loaded) return null;
  return (
    <Suspense fallback={null}>
      <ChatPanel />
    </Suspense>
  );
};
