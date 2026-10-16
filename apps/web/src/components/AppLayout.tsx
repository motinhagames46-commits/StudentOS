import { BookOpen, CheckSquare, LayoutDashboard, LogOut, UserRound } from 'lucide-react';
import { NavLink, Outlet } from 'react-router';
import { useLogout, useMe } from '../hooks/useAuth';

const nav = [
  { to: '/', label: 'Painel', icon: LayoutDashboard, end: true },
  { to: '/tarefas', label: 'Tarefas', icon: CheckSquare, end: false },
  { to: '/disciplinas', label: 'Disciplinas', icon: BookOpen, end: false },
  { to: '/conta', label: 'Conta', icon: UserRound, end: false },
];

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
        <div className="px-5 py-5">
          <Logo />
        </div>
        <nav aria-label="Navegação principal" className="flex-1 space-y-1 px-3">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
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
        <button
          type="button"
          onClick={() => logout.mutate()}
          aria-label="Terminar sessão"
          className="inline-flex size-9 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100"
        >
          <LogOut aria-hidden="true" className="size-4" />
        </button>
      </header>

      <main id="conteudo" className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-24 md:px-8 md:pt-10 md:pb-10">
        <Outlet />
      </main>

      {/* Navegação inferior — mobile */}
      <nav
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-4 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {nav.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 py-2 text-xs font-medium ${isActive ? 'text-accent' : 'text-stone-500'}`
            }
          >
            <Icon aria-hidden="true" className="size-5" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
