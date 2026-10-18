import {
  BookOpen,
  CalendarDays,
  CheckSquare,
  FileUp,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  Timer,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { useLogout, useMe } from '../hooks/useAuth';
import { AlertsBell } from './AlertsBell';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end: boolean;
}

/** Secções principais (barra lateral; as quatro primeiras também na barra inferior do telemóvel). */
const nav: NavItem[] = [
  { to: '/', label: 'Painel', icon: LayoutDashboard, end: true },
  { to: '/calendario', label: 'Calendário', icon: CalendarDays, end: false },
  { to: '/tarefas', label: 'Tarefas', icon: CheckSquare, end: false },
  { to: '/disciplinas', label: 'Disciplinas', icon: BookOpen, end: false },
  { to: '/sessoes', label: 'Foco', icon: Timer, end: false },
];

/** Definições e ferramentas. */
const secondary: NavItem[] = [
  { to: '/importar', label: 'Importar horário', icon: FileUp, end: false },
  { to: '/conta', label: 'Conta', icon: UserRound, end: false },
];

const MOBILE_PRIMARY = 4;

function Logo() {
  return (
    <span className="flex items-center gap-2 text-base font-semibold text-stone-900">
      <img src="/favicon.svg" alt="" className="size-6" />
      StudentOS
    </span>
  );
}

export function AppLayout() {
  const { data } = useMe();
  const logout = useLogout();

  return (
    <div className="min-h-dvh md:flex">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2"
      >
        Saltar para o conteúdo
      </a>

      {/* Barra lateral — desktop */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-stone-200 bg-white md:flex md:sticky md:top-0 md:h-dvh">
        <div className="flex items-center justify-between py-4 pr-3 pl-5">
          <Logo />
          <AlertsBell />
        </div>
        <nav aria-label="Navegação principal" className="flex-1 space-y-1 overflow-y-auto px-3">
          {nav.map((item) => (
            <SidebarLink key={item.to} item={item} />
          ))}
          <p className="px-3 pt-4 pb-1 text-[11px] font-semibold tracking-wide text-stone-500 uppercase">Definições</p>
          {secondary.map((item) => (
            <SidebarLink key={item.to} item={item} />
          ))}
        </nav>
        <div className="border-t border-stone-200 p-3">
          <p className="truncate px-3 text-sm font-medium text-stone-800">{data?.user.name}</p>
          <p className="truncate px-3 text-xs text-stone-500">{data?.activeSemester?.label}</p>
          <button
            type="button"
            onClick={() => logout.mutate()}
            className="mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-stone-600 hover:bg-stone-50 hover:text-stone-900"
          >
            <LogOut aria-hidden="true" className="size-4" />
            Terminar sessão
          </button>
        </div>
      </aside>

      {/* Barra superior — mobile */}
      <header className="flex items-center justify-between border-b border-stone-200 bg-white px-4 py-3 md:hidden">
        <Logo />
        <div className="flex items-center gap-1">
          <AlertsBell align="right" />
          <button
            type="button"
            onClick={() => logout.mutate()}
            aria-label="Terminar sessão"
            className="inline-flex size-9 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100"
          >
            <LogOut aria-hidden="true" className="size-4" />
          </button>
        </div>
      </header>

      <main id="conteudo" className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-24 md:px-8 md:pt-10 md:pb-10">
        <Outlet />
      </main>

      <MobileNav />
    </div>
  );
}

function SidebarLink({ item: { to, label, icon: Icon, end } }: { item: NavItem }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          isActive ? 'bg-stone-100 text-stone-900' : 'text-stone-600 hover:bg-stone-50 hover:text-stone-900'
        }`
      }
    >
      <Icon aria-hidden="true" className="size-4" />
      {label}
    </NavLink>
  );
}

/** Barra inferior no telemóvel: quatro atalhos e um menu "Mais" com as restantes secções. */
function MobileNav() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const more = [...nav.slice(MOBILE_PRIMARY), ...secondary];
  const moreActive = more.some((i) => location.pathname.startsWith(i.to));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const tab = 'flex flex-col items-center gap-1 py-2 text-xs font-medium';
  return (
    <>
      {open && (
        <div className="fixed inset-0 z-20 bg-stone-900/20 md:hidden" onClick={() => setOpen(false)}>
          <nav
            id="menu-mais"
            aria-label="Mais secções"
            className="absolute inset-x-3 bottom-20 rounded-xl border border-stone-200 bg-white p-2 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {more.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${isActive ? 'bg-stone-100 font-medium' : 'text-stone-700'}`
                }
              >
                <Icon aria-hidden="true" className="size-4" />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      )}
      <nav
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {nav.slice(0, MOBILE_PRIMARY).map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `${tab} ${isActive ? 'text-accent' : 'text-stone-500'}`}
          >
            <Icon aria-hidden="true" className="size-5" />
            {label}
          </NavLink>
        ))}
        <button
          type="button"
          aria-expanded={open}
          aria-controls="menu-mais"
          onClick={() => setOpen((o) => !o)}
          className={`${tab} ${open || moreActive ? 'text-accent' : 'text-stone-500'}`}
        >
          <MoreHorizontal aria-hidden="true" className="size-5" />
          Mais
        </button>
      </nav>
    </>
  );
}
