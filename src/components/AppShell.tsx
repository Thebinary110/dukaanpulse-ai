import * as Dialog from '@radix-ui/react-dialog';
import * as Tooltip from '@radix-ui/react-tooltip';
import { CalendarDays, Menu, ShieldCheck, Store, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useMatches } from 'react-router';
import { getDemoData } from '../data/demoData';
import { Breadcrumbs, type Crumb } from './Breadcrumbs';
import { NAV_ITEMS } from './navItems';
import { SyntheticBadge } from './SyntheticBadge';
import { Wordmark } from './Wordmark';

export interface RouteHandle {
  title: string;
  crumbs: Crumb[];
}

function isRouteHandle(h: unknown): h is RouteHandle {
  return typeof h === 'object' && h !== null && 'title' in h && 'crumbs' in h;
}

function useRouteHandle(): RouteHandle {
  const matches = useMatches();
  for (let i = matches.length - 1; i >= 0; i--) {
    const handle = matches[i]?.handle;
    if (isRouteHandle(handle)) return handle;
  }
  return { title: 'DukaanPulse AI', crumbs: [] };
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { dataset } = getDemoData();
  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pt-5 pb-6">
        <Wordmark />
      </div>

      <div className="mx-3 mb-5 flex items-center gap-3 rounded-xl border border-border bg-surface-raised/60 px-3 py-2.5">
        <span className="grid size-8 place-items-center rounded-lg bg-accent-soft text-accent">
          <Store className="size-4" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-text">{dataset.merchant.name}</span>
          <span className="block truncate text-xs text-muted">Fictional demo merchant</span>
        </span>
      </div>

      <nav aria-label="Main" className="px-3">
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={to === '/'}
                onClick={onNavigate}
                className={({ isActive }) =>
                  [
                    'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive ? 'bg-accent-soft text-text' : 'text-muted hover:bg-surface-hover hover:text-text',
                  ].join(' ')
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-accent" aria-hidden="true" />}
                    <Icon className={`size-[18px] ${isActive ? 'text-accent' : 'text-muted group-hover:text-text'}`} aria-hidden="true" />
                    {label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-auto p-3">
        <aside
          aria-label="Prototype disclaimer"
          className="rounded-xl border border-border bg-surface-raised/40 p-3.5 text-xs leading-relaxed text-muted"
        >
          <p className="mb-1.5 flex items-center gap-1.5 font-medium text-text">
            <ShieldCheck className="size-3.5 text-success" aria-hidden="true" />
            Hackathon prototype
          </p>
          Built for the Paytm Merchant Growth AI Hackathon. Not affiliated with or endorsed by Paytm. No messages are sent
          and no payments are made.
        </aside>
      </div>
    </div>
  );
}

export function AppShell() {
  const { title, crumbs } = useRouteHandle();
  const { asOfLabel } = getDemoData();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    document.title = title === 'DukaanPulse AI' ? title : `${title} · DukaanPulse AI`;
  }, [title]);

  useEffect(() => setDrawerOpen(false), [location.pathname]);

  return (
    <Tooltip.Provider delayDuration={200}>
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-accent px-3 py-2 text-sm font-medium text-on-accent focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      <div className="min-h-dvh lg:grid lg:grid-cols-[256px_1fr]">
        <aside className="sticky top-0 hidden h-dvh border-r border-border bg-surface/60 lg:block">
          <SidebarContent />
        </aside>

        <div className="flex min-w-0 flex-col">
          <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur-md">
            <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-3 px-4 sm:px-6 lg:px-8">
              <Dialog.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
                <Dialog.Trigger asChild>
                  <button
                    type="button"
                    className="-ml-1 grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-hover hover:text-text lg:hidden"
                    aria-label="Open navigation"
                  >
                    <Menu className="size-5" aria-hidden="true" />
                  </button>
                </Dialog.Trigger>
                <Dialog.Portal>
                  <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 lg:hidden" />
                  <Dialog.Content className="fixed inset-y-0 left-0 z-50 w-72 border-r border-border bg-surface shadow-2xl lg:hidden">
                    <Dialog.Title className="sr-only">Navigation</Dialog.Title>
                    <Dialog.Description className="sr-only">Move between sections of DukaanPulse AI.</Dialog.Description>
                    <Dialog.Close
                      className="absolute top-5 right-4 grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-hover hover:text-text"
                      aria-label="Close navigation"
                    >
                      <X className="size-4" aria-hidden="true" />
                    </Dialog.Close>
                    <SidebarContent onNavigate={() => setDrawerOpen(false)} />
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog.Root>

              <div className="min-w-0 flex-1">
                <Breadcrumbs items={crumbs} />
              </div>

              <span className="hidden items-center gap-1.5 text-xs text-muted md:inline-flex">
                <CalendarDays className="size-3.5" aria-hidden="true" />
                Data as of <span className="tabular font-medium text-text">{asOfLabel}</span>
              </span>
              <SyntheticBadge />
            </div>
          </header>

          <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-8 outline-none sm:px-6 lg:px-8">
            <Outlet />
          </main>

          <footer className="mx-auto w-full max-w-[1280px] px-4 pb-6 text-xs text-muted sm:px-6 lg:px-8">
            DukaanPulse AI · Hackathon prototype using synthetic data · Not affiliated with Paytm
          </footer>
        </div>
      </div>
    </Tooltip.Provider>
  );
}
