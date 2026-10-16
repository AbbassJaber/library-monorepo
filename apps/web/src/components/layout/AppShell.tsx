import { useTranslation } from 'react-i18next';
import { Outlet, ScrollRestoration } from 'react-router';
import { SkipLink } from '@/components/ui';
import { Toaster } from '@/components/ui/Toaster';
import { AiStatusBadge } from '@/features/ai/AiStatusBadge';
import { ChatHost } from '@/features/ai/ChatHost';
import { CallLayer } from '@/features/call/CallLayer';
import { CommandMenuHost } from '@/features/command/CommandMenuHost';
import { useMe } from '@/features/auth/queries';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export const AppShell = () => {
  const { t } = useTranslation();
  const me = useMe();
  return (
    <div className="flex min-h-dvh">
      <SkipLink />
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main
          id="main"
          tabIndex={-1}
          className="mx-auto w-full max-w-[1240px] flex-1 px-4 pb-16 pt-4 focus:outline-none sm:px-8 lg:pt-1"
        >
          <Outlet />
        </main>
        <footer className="flex flex-wrap items-center justify-between gap-x-4 border-t border-line px-4 py-4 text-meta text-fg-3 sm:px-8 lg:hidden">
          <span>{t('footer')}</span>
          <AiStatusBadge />
        </footer>
      </div>
      {me.data ? (
        <>
          <ChatHost />
          <CallLayer />
          <CommandMenuHost />
        </>
      ) : null}
      <Toaster />
      <ScrollRestoration />
    </div>
  );
};
