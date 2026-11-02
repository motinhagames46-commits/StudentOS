import { MessagesSquare, Repeat, ScanText, Timer, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import { PageHeader } from '../components/ui';
import { useAiAllowed } from '../hooks/queries';

interface Entry {
  to: string;
  title: string;
  text: string;
  icon: LucideIcon;
  /** Só nas contas com acesso à IA. */
  ai: boolean;
}

const entries: Entry[] = [
  {
    to: '/sessoes',
    title: 'Modo foco',
    text: 'Temporizador para registar o tempo de cada disciplina.',
    icon: Timer,
    ai: false,
  },
  {
    to: '/revisoes',
    title: 'Revisões',
    text: 'Perguntas dos teus quizzes, repetidas no momento certo para não as esqueceres.',
    icon: Repeat,
    ai: true,
  },
  {
    to: '/documentos',
    title: 'Documentos',
    text: 'Fotografa ou carrega apontamentos e fichas: a IA lê-os e encontra as datas.',
    icon: ScanText,
    ai: true,
  },
  {
    to: '/assistente',
    title: 'Assistente',
    text: 'Pergunta sobre os teus documentos e vê de onde vem cada resposta.',
    icon: MessagesSquare,
    ai: true,
  },
];

/** «Estudar»: o separador que junta o modo foco e, nas contas com IA, revisões, documentos e assistente. */
export function StudyHubPage() {
  const ai = useAiAllowed();
  return (
    <>
      <PageHeader title="Estudar" subtitle="Tudo o que usas quando te sentas a estudar." />
      <ul className="grid gap-3 sm:grid-cols-2">
        {entries
          .filter((e) => ai || !e.ai)
          .map(({ to, title, text, icon: Icon }) => (
            <li key={to}>
              <Link
                to={to}
                className="flex h-full items-start gap-3 rounded-2xl border border-panel-border bg-white p-4 shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-colors hover:bg-stone-50"
              >
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <span>
                  <span className="block font-semibold text-stone-900">{title}</span>
                  <span className="mt-0.5 block text-sm text-stone-600">{text}</span>
                </span>
              </Link>
            </li>
          ))}
      </ul>
    </>
  );
}
