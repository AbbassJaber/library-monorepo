import { Suspense, lazy, useEffect, useState } from 'react';
import { SHORTCUTS, matchesShortcut } from '@/lib/shortcuts';
import { useCommandStore } from '@/stores/commandStore';

const CommandMenu = lazy(() => import('./CommandMenu'));

export const CommandMenuHost = () => {
  const open = useCommandStore(s => s.open);
  const setOpen = useCommandStore(s => s.setOpen);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!matchesShortcut(event, SHORTCUTS.commandMenu)) return;
      event.preventDefault();
      setOpen(!useCommandStore.getState().open);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [setOpen]);

  if (open && !loaded) setLoaded(true);

  if (!loaded && !open) return null;
  return (
    <Suspense fallback={null}>
      <CommandMenu />
    </Suspense>
  );
};
