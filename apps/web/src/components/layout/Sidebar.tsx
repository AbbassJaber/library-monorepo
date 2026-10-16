import { MainNav } from './MainNav';
import { LanguageSwitcher, ThemeToggle } from './Preferences';

export const Sidebar = () => (
  <div className="hidden w-60 shrink-0 border-r border-line bg-nav lg:block">
    <div className="sticky top-0 flex h-dvh flex-col overflow-y-auto px-3 py-5">
      <MainNav withWordmark />
      <footer className="mt-auto flex flex-col gap-1 px-2 pt-6">
        <div className="flex items-center gap-2">
          <LanguageSwitcher className="flex-1" />
          <ThemeToggle />
        </div>
      </footer>
    </div>
  </div>
);
