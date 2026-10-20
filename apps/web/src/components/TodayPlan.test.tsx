import { expect, it } from 'vitest';
import type { PlannedSession } from '../lib/types';
import { focusStartFor } from './TodayPlan';

it('«Começar agora» numa sessão planeada liga o foco a essa sessão', () => {
  const session: PlannedSession = {
    id: 42,
    startAt: '2026-10-20T14:00:00.000Z',
    endAt: '2026-10-20T14:50:00.000Z',
    plannedMinutes: 50,
    actualMinutes: null,
    status: 'PLANNED',
    pinned: false,
    reason: '',
    task: null,
    assessment: null,
    discipline: { id: 3, name: 'Programação Web', code: 'PW', color: null },
  };
  expect(focusStartFor({ kind: 'session', session, message: '' })).toEqual({ plannedSessionId: 42 });
});

it('«Começar agora» num item usa a disciplina do item, ou nenhuma', () => {
  const item = { type: 'task' as const, id: 7, title: 'Relatório', disciplineId: 3 };
  expect(focusStartFor({ kind: 'item', item, message: '' })).toEqual({ disciplineId: 3 });
  expect(focusStartFor({ kind: 'item', item: { ...item, disciplineId: null }, message: '' })).toEqual({});
});

it('sem trabalho pendente não há nada para começar', () => {
  expect(focusStartFor({ kind: 'missing', message: '' })).toBeNull();
});
