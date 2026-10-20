import { DEFAULT_TIMEZONE, zonedDayKey } from '@studentos/shared';
import { CalendarArrowDown, CalendarDays, FileUp, Plus, Rows3 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { BlockForm } from '../components/BlockForm';
import { CalendarView } from '../components/CalendarView';
import { WeekView } from '../components/WeekView';
import { Badge, Button, Card, FormError } from '../components/ui';
import { PageHeader } from '../components/ui';
import { useDeleteBlock, useSkipOccurrence, useUpdateBlock } from '../hooks/queries';
import { downloadFile, errorMessage } from '../lib/api';
import { blockKindLabels, formatDate, formatTime, originLabels } from '../lib/format';
import type { BlockOccurrence, CalendarData } from '../lib/types';

/** Calendário: vista semanal (aulas, eventos, prazos) e mensal (spec §7.5). */
export function CalendarPage() {
  const [view, setView] = useState<'week' | 'month'>('week');
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<BlockOccurrence | null>(null);

  function handleSelect(id: string, data: CalendarData | undefined) {
    setSelected(data?.blocks.find((b) => b.id === id) ?? null);
  }

  return (
    <>
      <PageHeader
        title="Calendário"
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              to="/importar"
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
            >
              <FileUp aria-hidden="true" className="size-4" />
              Importar horário
            </Link>
            {!adding && (
              <Button onClick={() => setAdding(true)}>
                <Plus aria-hidden="true" className="size-4" />
                Aula ou evento
              </Button>
            )}
          </div>
        }
      />

      {adding && (
        <Card title="Nova aula ou evento" className="mb-4">
          <BlockForm onDone={() => setAdding(false)} />
        </Card>
      )}

      <Card>
        {view === 'week' ? (
          <WeekView
            onSelect={handleSelect}
            selectedId={selected?.id ?? null}
            header={<ViewToggle view={view} onChange={setView} />}
          />
        ) : (
          <div className="space-y-3">
            <div className="flex justify-end">
              <ViewToggle view={view} onChange={setView} />
            </div>
            <CalendarView />
            <p className="text-xs text-stone-500">
              A vista mensal mostra prazos e avaliações; as aulas aparecem na vista semanal.
            </p>
          </div>
        )}
      </Card>

      {selected && view === 'week' && <BlockDetails occurrence={selected} onClose={() => setSelected(null)} />}

      <ExportCalendarCard />
    </>
  );
}

/** Exportação .ics do plano (GET /api/me/calendar.ics): ficheiro descarregado com a sessão, sem link público. */
function ExportCalendarCard() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function exportCalendar() {
    setBusy(true);
    setError(null);
    try {
      await downloadFile('/me/calendar.ics', `studentos-calendario-${zonedDayKey(new Date(), DEFAULT_TIMEZONE)}.ics`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Levar o plano para outro calendário" className="mt-4">
      <div className="space-y-3 text-sm text-stone-600">
        <p>
          Descarrega um ficheiro .ics com as sessões de estudo planeadas, as avaliações e os prazos das tarefas por
          fazer, de hoje em diante, para importares no Google Calendar, no Calendário da Apple ou no Outlook. Cada
          evento traz um lembrete. É uma cópia deste momento: o que mudares depois no StudentOS não aparece sozinho no
          outro calendário.
        </p>
        <p>
          O ficheiro é gerado agora e não fica guardado no StudentOS; o serviço onde o importares passa a ter uma cópia.
          Vê a{' '}
          <Link to="/privacidade" className="font-medium text-accent underline">
            página de privacidade
          </Link>
          .
        </p>
        <Button variant="secondary" onClick={exportCalendar} loading={busy}>
          <CalendarArrowDown aria-hidden="true" className="size-4" />
          Exportar para o meu calendário
        </Button>
        <FormError message={error} />
      </div>
    </Card>
  );
}

function ViewToggle({ view, onChange }: { view: 'week' | 'month'; onChange: (v: 'week' | 'month') => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="Vista"
      className="mr-1 inline-flex rounded-lg border border-stone-200 bg-white p-0.5"
    >
      {(
        [
          ['week', 'Semana', Rows3],
          ['month', 'Mês', CalendarDays],
        ] as const
      ).map(([value, label, Icon]) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={view === value}
          onClick={() => onChange(value)}
          className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium ${
            view === value ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-50'
          }`}
        >
          <Icon aria-hidden="true" className="size-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}

function BlockDetails({ occurrence: o, onClose }: { occurrence: BlockOccurrence; onClose: () => void }) {
  const update = useUpdateBlock();
  const remove = useDeleteBlock();
  const skip = useSkipOccurrence();
  const error = update.error ?? remove.error ?? skip.error;

  return (
    <Card
      title={o.title}
      className="mt-4"
      action={
        <Button variant="ghost" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-2">
          <Badge>{blockKindLabels[o.kind]}</Badge>
          {o.recurring && <Badge tone="blue">Série recorrente</Badge>}
          {!o.isBusy && <Badge>Não bloqueia estudo</Badge>}
          {o.conflict && <Badge tone="red">Em conflito com outro evento</Badge>}
        </div>
        <p className="text-stone-700">
          {formatDate(o.start)}, {formatTime(o.start)}–{formatTime(o.end)}
          {o.location && ` · ${o.location}`}
          {o.discipline && ` · ${o.discipline.code}`}
        </p>
        <p className="text-xs text-stone-500">
          Origem: {originLabels[o.origin]}
          {o.sourceLabel && ` («${o.sourceLabel}»)`}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            loading={update.isPending}
            onClick={() => update.mutate({ id: o.blockId, isBusy: !o.isBusy }, { onSuccess: onClose })}
          >
            {o.isBusy ? 'Não bloquear estudo' : 'Marcar como ocupado'}
          </Button>
          {o.recurring && (
            <Button
              variant="secondary"
              loading={skip.isPending}
              onClick={() => skip.mutate({ id: o.blockId, occurrenceStart: o.start }, { onSuccess: onClose })}
            >
              Cancelar só esta
            </Button>
          )}
          <Button
            variant="danger"
            loading={remove.isPending}
            onClick={() => {
              const msg = o.recurring
                ? `Eliminar a série «${o.title}» inteira (todas as semanas)?`
                : `Eliminar «${o.title}»?`;
              if (window.confirm(msg)) remove.mutate(o.blockId, { onSuccess: onClose });
            }}
          >
            {o.recurring ? 'Eliminar série' : 'Eliminar'}
          </Button>
        </div>
        <FormError message={error ? errorMessage(error) : null} />
      </div>
    </Card>
  );
}
