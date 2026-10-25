import {
  BookOpen,
  CalendarCheck,
  CalendarDays,
  SlidersHorizontal,
  CheckSquare,
  FileUp,
  Link2,
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
  { to: '/plano', label: 'Plano', icon: CalendarCheck, end: false },
  { to: '/tarefas', label: 'Tarefas', icon: CheckSquare, end: false },
  { to: '/disciplinas', label: 'Disciplinas', icon: BookOpen, end: false },
  { to: '/sessoes', label: 'Foco', icon: Timer, end: false },
];

/** Definições e ferramentas. */
const secondary: NavItem[] = [
  { to: '/preferencias', label: 'Preferências de estudo', icon: SlidersHorizontal, end: false },
  { to: '/importar', label: 'Importar horário', icon: FileUp, end: false },
  { to: '/integracoes', label: 'Integrações', icon: Link2, end: false },
  { to: '/conta', label: 'Conta', icon: UserRound, end: false },
];

const MOBILE_PRIMARY = 4;

function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <span className={`flex items-center gap-2 text-base font-semibold ${dark ? 'text-white' : 'text-stone-900'}`}>
      <img src="/favicon.svg" alt="" className="size-6" />
      StudentOS
    </span>
  );
}

function Avatar({ name, className }: { name: string; className: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${className}`}
    >
      {initials}
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

      {/* Barra lateral escura (estilo Gentelella) — desktop */}
      <aside className="hidden w-[230px] shrink-0 flex-col bg-sidebar text-sidebar-text md:sticky md:top-0 md:flex md:h-dvh">
        <div className="flex h-[58px] items-center px-5">
          <Logo dark />
        </div>
        <div className="flex items-center gap-3 px-5 py-4">
          <Avatar
            name={data?.user.name ?? ''}
            className="size-12 bg-white/10 text-base text-white ring-2 ring-white/20"
          />
          <div className="min-w-0">
            <p className="text-xs text-sidebar-muted">Bem-vindo,</p>
            <p className="truncate text-sm font-medium text-white">{data?.user.name}</p>
            <p className="truncate text-xs text-sidebar-muted">{data?.activeSemester?.label}</p>
          </div>
        </div>
        <nav aria-label="Navegação principal" className="flex-1 overflow-y-auto pb-4">
          <p className="px-5 pt-3 pb-2 text-[11px] font-semibold tracking-wider text-sidebar-muted uppercase">Geral</p>
          {nav.map((item) => (
            <SidebarLink key={item.to} item={item} />
          ))}
          <p className="px-5 pt-5 pb-2 text-[11px] font-semibold tracking-wider text-sidebar-muted uppercase">
            Definições
          </p>
          {secondary.map((item) => (
            <SidebarLink key={item.to} item={item} />
          ))}
        </nav>
        <button
          type="button"
          onClick={() => logout.mutate()}
          className="flex items-center gap-3 border-t border-white/10 px-5 py-3 text-sm text-sidebar-text hover:bg-sidebar-hover hover:text-white focus-visible:outline-white focus-visible:-outline-offset-2"
        >
          <LogOut aria-hidden="true" className="size-4 text-sidebar-muted" />
          Terminar sessão
        </button>
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

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra superior — desktop */}
        <header className="hidden h-[58px] items-center justify-end gap-3 border-b border-panel-border bg-white px-6 md:flex">
          <AlertsBell align="right" />
          <span className="flex items-center gap-2 text-sm text-stone-700">
            <Avatar name={data?.user.name ?? ''} className="size-8 bg-sidebar text-xs text-white" />
            {data?.user.name}
          </span>
        </header>
        <main id="conteudo" className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-24 md:px-8 md:pt-8 md:pb-10">
          <Outlet />
        </main>
      </div>

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
        `group flex items-center gap-3 border-r-[5px] px-5 py-2.5 text-sm transition-colors focus-visible:outline-white focus-visible:-outline-offset-2 ${
          isActive
            ? 'border-brand bg-linear-to-r from-sidebar-active-from to-sidebar-active-to font-medium text-white'
            : 'border-transparent text-sidebar-text hover:bg-sidebar-hover hover:text-white'
        }`
      }
    >
      <Icon aria-hidden="true" className="size-4 text-sidebar-muted group-aria-[current=page]:text-white" />
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
