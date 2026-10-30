import {
  BookOpen,
  CalendarCheck,
  CalendarDays,
  SlidersHorizontal,
  CheckSquare,
  FileUp,
  ScanText,
  Link2,
  LayoutDashboard,
  LogOut,
  MessagesSquare,
  Repeat,
  Wallet,
  MoreHorizontal,
  Moon,
  Sun,
  Timer,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { Suspense, useEffect, useState, useSyncExternalStore } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { useAiStatus } from '../hooks/queries';
import { useLogout, useMe } from '../hooks/useAuth';
import { theme } from '../lib/theme';
import { AlertsBell } from './AlertsBell';
import { IconButton, LoadingList } from './ui';

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

/** Só para contas com acesso à IA (as outras nem sabem que existe). */
const aiItems: NavItem[] = [
  { to: '/documentos', label: 'Documentos', icon: ScanText, end: false },
  { to: '/assistente', label: 'Assistente', icon: MessagesSquare, end: false },
  { to: '/revisoes', label: 'Revisões', icon: Repeat, end: false },
  { to: '/financas', label: 'Finanças', icon: Wallet, end: false },
];

function useNav(): NavItem[] {
  const ai = useAiStatus();
  return ai.data && ai.data.status !== 'NOT_ALLOWED' ? [...nav, ...aiItems] : nav;
}

/** Definições e ferramentas. */
const secondary: NavItem[] = [
  { to: '/preferencias', label: 'Preferências de estudo', icon: SlidersHorizontal, end: false },
  { to: '/importar', label: 'Importar horário', icon: FileUp, end: false },
  { to: '/integracoes', label: 'Integrações', icon: Link2, end: false },
  { to: '/conta', label: 'Conta', icon: UserRound, end: false },
];

const MOBILE_PRIMARY = 4;

function Logo() {
  return (
    <span className="flex items-center gap-2 text-lg font-bold tracking-tight text-stone-900">
      <img src="/favicon.svg" alt="" className="size-7" />
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
  const main = useNav();

  return (
    <div className="min-h-dvh md:flex">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2"
      >
        Saltar para o conteúdo
      </a>

      {/* Barra lateral clara — desktop */}
      <aside className="hidden w-[244px] shrink-0 flex-col border-r border-panel-border bg-white md:sticky md:top-0 md:flex md:h-dvh">
        <div className="flex h-16 items-center px-6">
          <Logo />
        </div>
        <nav aria-label="Navegação principal" className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
          {main.map((item) => (
            <SidebarLink key={item.to} item={item} />
          ))}
          <p className="px-3 pt-6 pb-2 text-xs font-medium text-stone-500">Definições</p>
          {secondary.map((item) => (
            <SidebarLink key={item.to} item={item} />
          ))}
        </nav>
        <div className="px-3 pb-4">
          <button
            type="button"
            onClick={() => logout.mutate()}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] text-stone-700 hover:bg-stone-100"
          >
            <LogOut aria-hidden="true" className="size-5 text-stone-500" />
            Terminar sessão
          </button>
        </div>
      </aside>

      {/* Barra superior de vidro — mobile */}
      <header className="glass sticky top-0 z-20 flex items-center justify-between border-b px-4 py-2.5 md:hidden">
        <Logo />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <AlertsBell align="right" />
          <button
            type="button"
            onClick={() => logout.mutate()}
            aria-label="Terminar sessão"
            className="inline-flex size-9 items-center justify-center rounded-full text-stone-600 hover:bg-stone-900/5"
          >
            <LogOut aria-hidden="true" className="size-4" />
          </button>
        </div>
      </header>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra superior de vidro — desktop */}
        <header className="glass sticky top-0 z-20 hidden h-16 items-center justify-end gap-3 border-b px-6 md:flex">
          <ThemeToggle />
          <AlertsBell align="right" />
          <span className="flex items-center gap-2.5">
            <Avatar name={data?.user.name ?? ''} className="size-9 bg-accent text-xs text-white" />
            <span className="leading-tight">
              <span className="block text-sm font-semibold text-stone-900">{data?.user.name}</span>
              <span className="block text-xs text-stone-600">{data?.activeSemester?.label}</span>
            </span>
          </span>
        </header>
        <main
          id="conteudo"
          className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-[calc(7rem+env(safe-area-inset-bottom))] md:px-8 md:pt-8 md:pb-10"
        >
          <Suspense fallback={<LoadingList rows={4} />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      <MobileNav />
    </div>
  );
}

function ThemeToggle() {
  const dark = useSyncExternalStore(theme.subscribe, theme.isDark);
  return (
    <IconButton label="Modo noite" aria-pressed={dark} onClick={theme.toggle}>
      {dark ? <Sun aria-hidden="true" className="size-4" /> : <Moon aria-hidden="true" className="size-4" />}
    </IconButton>
  );
}

function SidebarLink({ item: { to, label, icon: Icon, end } }: { item: NavItem }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition-colors ${
          isActive ? 'bg-stone-100 font-semibold text-stone-900' : 'text-stone-700 hover:bg-stone-100'
        }`
      }
    >
      <Icon aria-hidden="true" className="size-5 text-stone-500 group-aria-[current=page]:text-accent" />
      {label}
    </NavLink>
  );
}

/** Barra inferior no telemóvel: quatro atalhos e um menu "Mais" com as restantes secções. */
function MobileNav() {
  const nav = useNav();
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

  const tab = 'flex flex-col items-center gap-0.5 rounded-[22px] py-1.5 text-[11px] font-medium';
  return (
    <>
      {open && (
        <div className="fixed inset-0 z-20 bg-black/25 md:hidden" onClick={() => setOpen(false)}>
          <nav
            id="menu-mais"
            aria-label="Mais secções"
            className="glass absolute inset-x-3 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] rounded-3xl border p-2 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {more.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm ${isActive ? 'bg-accent-soft font-semibold text-accent-ink' : 'text-stone-800'}`
                }
              >
                <Icon aria-hidden="true" className="size-5" />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      )}
      {/* Barra de separadores flutuante, de vidro (como no iOS) */}
      <nav
        aria-label="Navegação principal"
        className="glass fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-30 grid grid-cols-5 gap-1 rounded-[28px] border p-1.5 shadow-[0_8px_32px_rgb(0_0_0/0.12)] md:hidden"
      >
        {nav.slice(0, MOBILE_PRIMARY).map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `${tab} ${isActive ? 'bg-accent-soft font-semibold text-accent-ink' : 'text-stone-700'}`
            }
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
          className={`${tab} ${open || moreActive ? 'bg-accent-soft font-semibold text-accent-ink' : 'text-stone-700'}`}
        >
          <MoreHorizontal aria-hidden="true" className="size-5" />
          Mais
        </button>
      </nav>
    </>
  );
}
