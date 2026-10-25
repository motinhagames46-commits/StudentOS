import {
  ArrowRight,
  CalendarCheck,
  CalendarRange,
  Calculator,
  Gauge,
  Lock,
  type LucideIcon,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useEffect } from 'react';
import { Link } from 'react-router';
import { LandingDemo } from '../components/landing/LandingDemo';

// Página de entrada para quem não tem sessão. Regras: só afirmações verdadeiras e verificáveis na app —
// sem testemunhos, números de utilizadores, preços ou urgência inventados (docs/research/onboarding-e-landing.md).

const primaryCta =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent-hover';
const secondaryCta =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-stone-800 transition-colors hover:bg-stone-50';

const PAINS = [
  'As datas estão espalhadas pelo Moodle, pelos emails e pelas fichas das UC.',
  'Não sabes se um 8 no teste ainda te deixa passar — nem quanto precisas no exame.',
  'Estudas quando sobra tempo, e o tempo sobra quase sempre na véspera.',
];

const BENEFITS: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: Calculator,
    title: 'Sabes sempre a nota de que precisas',
    text: 'Médias ponderadas na escala 0–20, com a nota mínima de cada componente. O simulador diz-te quanto precisas para passar, para um 14 ou para um 16 — e avisa quando já não dá.',
  },
  {
    icon: CalendarCheck,
    title: 'Um plano que respeita a tua vida',
    text: 'O planeador reparte o estudo pelas horas que indicaste, nunca por cima das aulas, e não mexe em sessões concluídas ou fixadas. Cada sessão diz porque está ali.',
  },
  {
    icon: Gauge,
    title: 'O ritmo certo, pelos ECTS',
    text: 'Cada ECTS corresponde a 25–28 horas de trabalho. O StudentOS reparte esse tempo até à avaliação, para não ficar tudo para a última semana.',
  },
  {
    icon: CalendarRange,
    title: 'O teu horário entra e sai',
    text: 'Importas o horário em .ics ou CSV, com pré-visualização antes de gravar. Exportas as sessões para o Google Calendar, o Outlook ou o calendário do iPhone.',
  },
];

const STEPS = [
  { title: 'Cria a conta', text: 'Nome, email e palavra-passe. Mais nada.' },
  {
    title: 'Responde a 4 perguntas',
    text: 'Disciplinas, como são avaliadas, quando podes estudar e como gostas de estudar.',
  },
  { title: 'Recebe a tua semana', text: 'Um plano de estudo real, que vês e confirmas antes de ficar gravado.' },
];

const FAQ = [
  { q: 'É mesmo grátis?', a: 'Sim. Não há planos pagos, anúncios nem cartão.' },
  { q: 'Preciso de instalar alguma coisa?', a: 'Não. Funciona no browser, no computador e no telemóvel.' },
  {
    q: 'O plano de estudo usa inteligência artificial?',
    a: 'Não. É um algoritmo determinístico: as mesmas respostas dão sempre o mesmo plano, e cada sessão vem com a explicação.',
  },
  {
    q: 'Liga ao Moodle ou ao Outlook?',
    a: 'Ainda não. Essas ligações só serão feitas com autorização formal. Entretanto importas o horário por ficheiro (.ics ou CSV).',
  },
  {
    q: 'Como é calculada a nota de que preciso?',
    a: 'Com a média ponderada das avaliações (pesos que somam 100 %) e as notas mínimas de cada componente. Se for impossível atingir a nota, o StudentOS diz-to.',
  },
  {
    q: 'O que acontece aos meus dados?',
    a: 'Usamos só um cookie, o da sessão; não há publicidade nem análise. Exportas tudo em JSON e eliminas a conta quando quiseres, na própria app.',
  },
];

export function LandingPage() {
  useEffect(() => {
    document.title = 'StudentOS — organiza o semestre e estuda com um plano';
    return () => {
      document.title = 'StudentOS';
    };
  }, []);

  return (
    <div className="min-h-dvh bg-white text-stone-900">
      <header className="border-b border-stone-200/70 bg-white/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 text-base font-semibold">
            <img src="/favicon.svg" alt="" className="size-7" />
            StudentOS
          </Link>
          <nav aria-label="Página de entrada" className="flex items-center gap-1 text-sm">
            <a href="#como-funciona" className="hidden rounded-lg px-3 py-2 text-stone-700 hover:bg-stone-100 sm:block">
              Como funciona
            </a>
            <a href="#perguntas" className="hidden rounded-lg px-3 py-2 text-stone-700 hover:bg-stone-100 sm:block">
              Perguntas
            </a>
            <Link to="/login" className="rounded-lg px-3 py-2 font-medium text-stone-800 hover:bg-stone-100">
              Entrar
            </Link>
            <Link
              to="/registo"
              className="ml-1 rounded-lg bg-accent px-3 py-2 font-semibold text-white hover:bg-accent-hover"
            >
              Criar conta
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="bg-linear-to-b from-accent-soft to-white">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 md:grid-cols-[1.1fr_1fr] md:py-20">
            <div>
              <p className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium text-stone-700 ring-1 ring-stone-200">
                <Sparkles aria-hidden="true" className="size-3.5 text-accent" />
                Para estudantes do ensino superior
              </p>
              <h1 className="mt-4 text-4xl leading-tight font-bold tracking-tight text-balance md:text-5xl">
                Organiza o semestre, sabe a nota de que precisas e estuda com um plano.
              </h1>
              <p className="mt-5 max-w-xl text-lg text-stone-700">
                O StudentOS junta disciplinas, avaliações, prazos e horário num só sítio — e diz-te, com as contas
                feitas, quanto precisas em cada avaliação e quando estudar para lá chegar.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link to="/registo" className={primaryCta}>
                  Criar conta grátis
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
                <a href="#como-funciona" className={secondaryCta}>
                  Ver como funciona
                </a>
              </div>
              <p className="mt-4 text-sm text-stone-600">
                Grátis, sem anúncios. 4 perguntas e tens a tua primeira semana planeada.
              </p>
            </div>
            <LandingDemo />
          </div>
        </section>

        <section aria-labelledby="problema" className="mx-auto max-w-6xl px-4 py-16">
          <h2 id="problema" className="max-w-2xl text-3xl font-bold tracking-tight text-balance">
            O semestre não corre mal num dia. Corre mal aos poucos.
          </h2>
          <ul className="mt-8 grid gap-4 md:grid-cols-3">
            {PAINS.map((p) => (
              <li key={p} className="rounded-xl border border-stone-200 bg-stone-50 p-5 text-stone-800">
                {p}
              </li>
            ))}
          </ul>
          <p className="mt-6 max-w-2xl text-lg text-stone-700">
            O StudentOS foi feito para isto: pôr tudo à vista e transformar «tenho de estudar» em sessões concretas, na
            altura certa.
          </p>
        </section>

        <section aria-labelledby="beneficios" className="bg-stone-50">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <h2 id="beneficios" className="text-3xl font-bold tracking-tight">
              O que ganhas
            </h2>
            <ul className="mt-8 grid gap-5 md:grid-cols-2">
              {BENEFITS.map(({ icon: Icon, title, text }) => (
                <li key={title} className="rounded-xl border border-stone-200 bg-white p-6">
                  <span className="inline-flex size-10 items-center justify-center rounded-lg bg-accent-soft text-accent">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <h3 className="mt-4 text-lg font-semibold">{title}</h3>
                  <p className="mt-2 text-stone-700">{text}</p>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-stone-700">
              E ainda: tarefas com prioridades e prazos, modo foco com cronómetro, alertas das próximas 48 horas e
              estatísticas do teu estudo.
            </p>
          </div>
        </section>

        <section aria-labelledby="por-dentro" className="mx-auto max-w-6xl px-4 pt-16">
          <h2 id="por-dentro" className="text-3xl font-bold tracking-tight">
            Vê por dentro
          </h2>
          <p className="mt-2 text-stone-700">Tudo o que importa esta semana, num só ecrã.</p>
          <figure className="mt-8">
            <img
              src="/landing/painel.jpg"
              width={1280}
              height={800}
              loading="lazy"
              decoding="async"
              alt="Painel do StudentOS: tarefas da semana, tarefa em atraso, plano de hoje com a sugestão do que estudar agora e próximas avaliações."
              className="h-auto w-full rounded-xl border border-stone-200 shadow-xl shadow-stone-900/10"
            />
            <figcaption className="mt-3 text-center text-sm text-stone-600">O painel, com dados de exemplo.</figcaption>
          </figure>
        </section>

        <section
          id="como-funciona"
          aria-labelledby="como-funciona-titulo"
          className="mx-auto max-w-6xl scroll-mt-4 px-4 py-16"
        >
          <h2 id="como-funciona-titulo" className="text-3xl font-bold tracking-tight">
            Como funciona
          </h2>
          <ol className="mt-8 grid gap-5 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-xl border border-stone-200 p-6">
                <span className="inline-flex size-8 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">
                  {i + 1}
                </span>
                <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-stone-700">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="confianca" className="bg-[#2A3F54] text-white">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-2">
            <div>
              <h2 id="confianca" className="text-3xl font-bold tracking-tight">
                Feito com transparência
              </h2>
              <ul className="mt-6 space-y-4 text-stone-100">
                <li className="flex gap-3">
                  <Lock aria-hidden="true" className="mt-1 size-5 shrink-0 text-[#5FD3BC]" />
                  Os dados são teus: exportas tudo em JSON e eliminas a conta quando quiseres, na própria app.
                </li>
                <li className="flex gap-3">
                  <ShieldCheck aria-hidden="true" className="mt-1 size-5 shrink-0 text-[#5FD3BC]" />
                  Sem anúncios e sem cookies de análise: só o cookie que mantém a sessão iniciada.
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-semibold">O que ainda não faz</h3>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-stone-200">
                <li>Não liga ao Moodle nem ao Outlook: importas o horário por ficheiro.</li>
                <li>Não há app nas lojas: usas no browser, também no telemóvel.</li>
                <li>A primeira abertura do dia pode demorar até um minuto, enquanto o servidor gratuito arranca.</li>
              </ul>
              <h3 className="mt-8 text-lg font-semibold">Quem fez</h3>
              <p className="mt-2 text-stone-200">
                Um estudante de TPSI no IPVC, a partir dos problemas reais de quem estuda no ensino superior.
              </p>
            </div>
          </div>
        </section>

        <section id="perguntas" aria-labelledby="perguntas-titulo" className="mx-auto max-w-3xl scroll-mt-4 px-4 py-16">
          <h2 id="perguntas-titulo" className="text-3xl font-bold tracking-tight">
            Perguntas frequentes
          </h2>
          <div className="mt-6 divide-y divide-stone-200 border-y border-stone-200">
            {FAQ.map((f) => (
              <details key={f.q} className="group py-4">
                <summary className="cursor-pointer list-none font-medium text-stone-900 [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center justify-between gap-4">
                    {f.q}
                    <span
                      aria-hidden="true"
                      className="text-xl text-stone-500 group-open:rotate-45 motion-safe:transition-transform"
                    >
                      +
                    </span>
                  </span>
                </summary>
                <p className="mt-2 text-stone-700">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section aria-labelledby="cta-final" className="bg-accent-soft">
          <div className="mx-auto max-w-3xl px-4 py-16 text-center">
            <h2 id="cta-final" className="text-3xl font-bold tracking-tight text-balance">
              Começa a próxima semana com um plano.
            </h2>
            <p className="mt-3 text-lg text-stone-700">Leva poucos minutos e não custa nada.</p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link to="/registo" className={primaryCta}>
                Criar conta grátis
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
              <Link to="/login" className={secondaryCta}>
                Já tenho conta
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-stone-200">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-stone-600">
          <span>StudentOS · projeto académico</span>
          <Link to="/privacidade" className="underline hover:text-stone-900">
            Privacidade
          </Link>
        </div>
      </footer>
    </div>
  );
}
