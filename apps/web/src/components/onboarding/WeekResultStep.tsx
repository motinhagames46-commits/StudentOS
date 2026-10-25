import { DEFAULT_TIMEZONE, zonedDayKey } from '@studentos/shared';
import { CalendarPlus, CheckCircle2 } from 'lucide-react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { useConfirmPlan, usePlanPreview } from '../../hooks/queries';
import { downloadFile, errorMessage } from '../../lib/api';
import { formatTime, studyTitle } from '../../lib/format';
import { summarizeByDiscipline } from '../../lib/onboarding';
import { Button, ErrorState, FormError, LoadingList } from '../ui';

const TZ = DEFAULT_TIMEZONE;
const longDay = new Intl.DateTimeFormat('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ });
const hours = (minutes: number) => `${Math.round((minutes / 60) * 10) / 10} h`.replace('.', ',');

/** Último passo: o plano real dos próximos 7 dias, calculado pelo planeador determinístico. */
export function WeekResultStep({
  headingRef,
  onFinish,
  onBack,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>;
  onFinish: () => void;
  onBack: () => void;
}) {
  const preview = usePlanPreview();
  const confirm = useConfirmPlan();
  const [icsError, setIcsError] = useState<string | null>(null);
  const requested = useRef(false);

  // Um só pedido mesmo com o duplo efeito do StrictMode (cada pedido cria uma nova versão do rascunho).
  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    preview.mutate({ days: 7 });
  }, [preview]);

  const heading = (
    <h1 ref={headingRef} tabIndex={-1} className="text-xl font-semibold tracking-tight text-stone-900 outline-none">
      A tua semana
    </h1>
  );

  if (preview.isError) {
    return (
      <div className="space-y-4">
        {heading}
        <ErrorState message={errorMessage(preview.error)} onRetry={() => preview.mutate({ days: 7 })} />
      </div>
    );
  }
  if (!preview.data) {
    return (
      <div className="space-y-4" aria-busy="true">
        {heading}
        <p className="text-sm text-stone-600">A calcular o plano com as tuas respostas…</p>
        <LoadingList rows={4} />
      </div>
    );
  }

  const draft = preview.data;
  const p = draft.proposal;
  const total = p.sessions.reduce((s, x) => s + x.minutes, 0);
  const byDiscipline = summarizeByDiscipline(p.sessions);
  const byDay = new Map<string, typeof p.sessions>();
  for (const s of p.sessions) {
    const key = zonedDayKey(new Date(s.start), TZ);
    byDay.set(key, [...(byDay.get(key) ?? []), s]);
  }

  if (confirm.isSuccess) {
    return (
      <div className="space-y-4">
        {heading}
        <p role="status" className="flex items-start gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-900">
          <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          Plano guardado: {confirm.data.created} {confirm.data.created === 1 ? 'sessão' : 'sessões'} no teu calendário
          do StudentOS.
        </p>
        <p className="text-sm text-stone-700">
          Queres vê-las também no telemóvel? Descarrega o ficheiro e abre-o no Google Calendar, Outlook ou Calendário do
          iPhone (é uma cópia: não fica sincronizado).
        </p>
        <FormError message={icsError} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setIcsError(null);
              downloadFile('/me/calendar.ics', `studentos-calendario-${zonedDayKey(new Date(), TZ)}.ics`).catch(
                (err: unknown) => setIcsError(errorMessage(err)),
              );
            }}
          >
            <CalendarPlus aria-hidden="true" className="size-4" />
            Adicionar ao meu calendário (.ics)
          </Button>
          <Button onClick={onFinish}>Ir para o painel</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        {heading}
        <p className="mt-1 text-sm text-stone-600">
          {p.sessions.length > 0
            ? `${p.sessions.length} ${p.sessions.length === 1 ? 'sessão' : 'sessões'} de estudo, ${hours(total)} nos próximos 7 dias — só nas horas que indicaste e nunca por cima das aulas.`
            : 'Ainda não há sessões para os próximos 7 dias.'}
        </p>
      </div>

      {p.sessions.length === 0 && (
        <div role="status" className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-3 text-sm text-stone-800">
          <p className="font-medium">Porque está vazia?</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {p.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
            {p.unplanned.map((u) => (
              <li key={`${u.type}${u.itemId}`}>{u.message}</li>
            ))}
            {p.warnings.length === 0 && p.unplanned.length === 0 && (
              <li>Não há disciplinas com ECTS, tarefas nem avaliações para estudar nesta semana.</li>
            )}
          </ul>
        </div>
      )}

      {byDiscipline.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Tempo por disciplina">
          {byDiscipline.map((d) => (
            <li key={d.code} className="rounded-full bg-accent-soft px-3 py-1 text-sm text-stone-800">
              <strong className="font-medium">{d.code}</strong> · {hours(d.minutes)}
            </li>
          ))}
        </ul>
      )}

      {byDay.size > 0 && (
        <ol className="space-y-3">
          {[...byDay.entries()].map(([day, sessions]) => (
            <li key={day}>
              <h2 className="text-sm font-medium text-stone-900 first-letter:uppercase">
                {longDay.format(new Date(sessions[0]!.start))}
              </h2>
              <ul className="mt-1 space-y-1">
                {sessions.map((s) => (
                  <li key={s.start} className="flex gap-3 text-sm text-stone-700">
                    <span className="w-24 shrink-0 tabular-nums text-stone-600">
                      {formatTime(s.start)}–{formatTime(s.end)}
                    </span>
                    {studyTitle(s.title, s.disciplineCode ?? undefined)}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}

      {p.sessions.length > 0 && p.unplanned.length > 0 && (
        <details className="text-sm text-stone-700">
          <summary className="cursor-pointer">O que ficou de fora ({p.unplanned.length})</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {p.unplanned.map((u) => (
              <li key={`${u.type}${u.itemId}`}>{u.message}</li>
            ))}
          </ul>
        </details>
      )}

      <FormError message={confirm.isError ? errorMessage(confirm.error) : null} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onBack}>
          Ajustar horas livres
        </Button>
        {p.sessions.length > 0 ? (
          <Button loading={confirm.isPending} onClick={() => confirm.mutate(draft.id)}>
            Confirmar plano
          </Button>
        ) : (
          <Button onClick={onFinish}>Ir para o painel</Button>
        )}
      </div>
      {p.sessions.length > 0 && (
        <p className="text-right text-xs text-stone-600">
          Nada fica marcado sem confirmares. Podes mudar ou apagar sessões depois, no Plano.
        </p>
      )}
    </div>
  );
}
