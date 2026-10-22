import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PLANNER_PREFERENCES,
  explain,
  overlaps,
  planStudy,
  priorityOf,
  type AvailabilityWindow,
  type PlannerInput,
  type WorkItem,
} from './planner.js';
import { calendarDaysUntil, zonedDayKey } from './timezone.js';

const TZ = 'Europe/Lisbon';
// Segunda-feira, 19/10/2026, 08:00 em Lisboa (07:00 UTC)
const NOW = new Date('2026-10-19T07:00:00Z');

const weekdays18to21: AvailabilityWindow[] = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  startMinute: 18 * 60,
  endMinute: 21 * 60,
}));

function task(id: number, overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    type: 'task',
    id,
    title: `Tarefa ${id}`,
    disciplineId: id,
    disciplineCode: `D${id}`,
    deadline: null,
    remainingMinutes: 100,
    priority: 'MEDIUM',
    weightPercent: null,
    missedCount: 0,
    label: 'Tarefa',
    ...overrides,
  };
}

function input(overrides: Partial<PlannerInput> = {}): PlannerInput {
  return {
    now: NOW,
    from: NOW,
    to: new Date('2026-10-26T07:00:00Z'),
    timeZone: TZ,
    availability: weekdays18to21,
    busy: [],
    protectedMinutesByDay: {},
    items: [task(1)],
    preferences: DEFAULT_PLANNER_PREFERENCES,
    ...overrides,
  };
}

const asIntervals = (sessions: { start: string; end: string }[]) =>
  sessions.map((s) => ({ start: new Date(s.start), end: new Date(s.end) }));

describe('restrições obrigatórias (spec §11.3)', () => {
  it('só agenda dentro da disponibilidade, em hora local', () => {
    const { sessions } = planStudy(input());
    expect(sessions.length).toBeGreaterThan(0);
    for (const s of sessions) {
      const start = new Date(s.start);
      // 18:00–21:00 em Lisboa = 17:00–20:00 UTC em hora de verão, 18:00–21:00 UTC depois de 25/10
      const hourLisbon = Number(
        new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: TZ }).format(start),
      );
      expect(hourLisbon).toBeGreaterThanOrEqual(18);
      expect(new Date(s.end).getTime()).toBeLessThanOrEqual(
        new Date(
          new Date(s.start).toISOString().slice(0, 11) +
            (start < new Date('2026-10-25T01:00:00Z') ? '20:00:00Z' : '21:00:00Z'),
        ).getTime(),
      );
    }
  });

  it('nunca agenda sobre aulas ou eventos ocupados', () => {
    const busy = [{ start: new Date('2026-10-19T17:00:00Z'), end: new Date('2026-10-19T19:00:00Z') }];
    const { sessions } = planStudy(input({ busy }));
    for (const s of asIntervals(sessions)) expect(busy.some((b) => overlaps(b, s))).toBe(false);
    expect(sessions[0]!.start).toBe('2026-10-19T19:00:00.000Z');
  });

  it('nunca cria sessões no passado nem sobrepostas', () => {
    const now = new Date('2026-10-19T17:32:00Z'); // 18:32 em Lisboa, a meio da janela
    const { sessions } = planStudy(input({ now, from: now, items: [task(1, { remainingMinutes: 600 }), task(2)] }));
    const intervals = asIntervals(sessions).sort((a, b) => a.start.getTime() - b.start.getTime());
    expect(intervals[0]!.start.getTime()).toBeGreaterThanOrEqual(now.getTime());
    for (let i = 1; i < intervals.length; i++) {
      expect(intervals[i]!.start.getTime()).toBeGreaterThanOrEqual(intervals[i - 1]!.end.getTime());
    }
  });

  it('respeita a duração das sessões, as pausas e o limite diário', () => {
    const prefs = { ...DEFAULT_PLANNER_PREFERENCES, maxDailyMinutes: 100 };
    const { sessions } = planStudy(
      input({ preferences: prefs, items: [task(1, { remainingMinutes: 1000 }), task(2, { remainingMinutes: 1000 })] }),
    );
    const perDay: Record<string, number> = {};
    for (const s of sessions) {
      expect(s.minutes).toBeLessThanOrEqual(prefs.sessionMinutes);
      const key = zonedDayKey(new Date(s.start), TZ);
      perDay[key] = (perDay[key] ?? 0) + s.minutes;
    }
    expect(Math.max(...Object.values(perDay))).toBeLessThanOrEqual(100);
    const sorted = asIntervals(sessions).sort((a, b) => a.start.getTime() - b.start.getTime());
    for (let i = 1; i < sorted.length; i++) {
      if (zonedDayKey(sorted[i]!.start, TZ) === zonedDayKey(sorted[i - 1]!.start, TZ)) {
        expect(sorted[i]!.start.getTime() - sorted[i - 1]!.end.getTime()).toBeGreaterThanOrEqual(10 * 60 * 1000);
      }
    }
  });

  it('conta as sessões protegidas no limite diário', () => {
    const { sessions } = planStudy(
      input({
        protectedMinutesByDay: { '2026-10-19': 180 },
        busy: [{ start: new Date('2026-10-19T17:00:00Z'), end: new Date('2026-10-19T20:00:00Z') }],
      }),
    );
    expect(sessions.some((s) => zonedDayKey(new Date(s.start), TZ) === '2026-10-19')).toBe(false);
  });

  it('não termina sessões depois do prazo e não ignora a duração estimada', () => {
    const deadline = new Date('2026-10-20T19:00:00Z'); // terça 20:00 em Lisboa
    const { sessions, unplanned } = planStudy(input({ items: [task(1, { deadline, remainingMinutes: 400 })] }));
    for (const s of sessions) expect(new Date(s.end).getTime()).toBeLessThanOrEqual(deadline.getTime());
    const planned = sessions.reduce((sum, s) => sum + s.minutes, 0);
    expect(unplanned).toContainEqual(
      expect.objectContaining({ itemId: 1, reason: 'NO_SPACE', missingMinutes: 400 - planned }),
    );
  });

  it('sem espaço, não cria sessões infinitas: reporta o que falta e dá opções', () => {
    const deadline = new Date('2026-10-23T20:00:00Z');
    const { sessions, unplanned, warnings } = planStudy(input({ availability: [], items: [task(1, { deadline })] }));
    expect(sessions).toEqual([]);
    expect(unplanned[0]).toMatchObject({ reason: 'NO_SPACE', missingMinutes: 100 });
    expect(warnings.join(' ')).toMatch(/disponibilidade/);
  });

  it('itens sem estimativa não são inventados: pede a duração', () => {
    const { sessions, unplanned } = planStudy(input({ items: [task(1, { remainingMinutes: null })] }));
    expect(sessions).toEqual([]);
    expect(unplanned[0]).toMatchObject({ reason: 'NO_ESTIMATE' });
    expect(unplanned[0]!.message).toMatch(/duração estimada/);
  });
});

describe('mudança de hora (25/10/2026)', () => {
  it('a janela 18:00–21:00 mantém-se em hora local antes e depois', () => {
    const availability = [6, 7, 1].map((weekday) => ({ weekday, startMinute: 18 * 60, endMinute: 19 * 60 }));
    const now = new Date('2026-10-24T07:00:00Z'); // sábado
    const { sessions } = planStudy(
      input({
        now,
        from: now,
        to: new Date('2026-10-27T00:00:00Z'),
        availability,
        items: [task(1, { remainingMinutes: 150 })],
        preferences: { ...DEFAULT_PLANNER_PREFERENCES, sessionMinutes: 50, breakMinutes: 10 },
      }),
    );
    expect(sessions.map((s) => s.start)).toEqual([
      '2026-10-24T17:00:00.000Z', // sábado 18:00 WEST
      '2026-10-25T18:00:00.000Z', // domingo 18:00 WET (depois da mudança)
      '2026-10-26T18:00:00.000Z', // segunda 18:00 WET
    ]);
  });
});

describe('prioridades e distribuição (spec §11.4–11.5)', () => {
  it('prazos mais próximos e avaliações com mais peso têm prioridade', () => {
    const soon = task(1, { deadline: new Date('2026-10-21T20:00:00Z') });
    const later = task(2, { deadline: new Date('2026-11-10T20:00:00Z') });
    expect(priorityOf(soon, NOW).score).toBeGreaterThan(priorityOf(later, NOW).score);
    const heavy = task(3, { type: 'assessment', weightPercent: 50, label: 'Teste' });
    const light = task(4, { type: 'assessment', weightPercent: 10, label: 'Teste' });
    expect(priorityOf(heavy, NOW).score).toBeGreaterThan(priorityOf(light, NOW).score);
  });

  it('nenhum fator domina: todos estão limitados a [0, 1]', () => {
    const extreme = task(1, { remainingMinutes: 100000, missedCount: 50, deadline: new Date('2020-01-01') });
    const p = priorityOf(extreme, NOW);
    expect(Object.values(p.factors).every((f) => f >= 0 && f <= 1)).toBe(true);
    expect(p.score).toBeLessThanOrEqual(1);
  });

  it('explica a recomendação apenas com dados reais', () => {
    const t = task(7, {
      type: 'assessment',
      title: 'Teste 2',
      disciplineCode: 'MAT',
      deadline: new Date('2026-10-22T08:00:00Z'),
      weightPercent: 40,
      remainingMinutes: 120,
      label: 'Teste',
    });
    const { sessions } = planStudy(input({ items: [t] }));
    expect(sessions[0]!.reason).toBe(
      'Urgência média: Teste «Teste 2» (MAT) é daqui a 3 dias; vale 40% da nota; faltam cerca de 120 min.',
    );
  });

  describe('dias até ao prazo contados em dias civis de Lisboa (igual à lista de tarefas)', () => {
    const at = (deadline: string, now: string) => {
      const t = task(1, { deadline: new Date(deadline), label: 'Tarefa', title: 'T' });
      const n = new Date(now);
      return explain(t, priorityOf(t, n), n, 'Europe/Lisbon');
    };
    it('às 23:00, um prazo amanhã às 10:00 é «amanhã» (não «hoje»)', () => {
      expect(at('2026-10-20T09:00:00Z', '2026-10-19T22:00:00Z')).toMatch(/é amanhã/);
    });
    it('conta dias civis através da mudança de hora (25/10/2026)', () => {
      // sábado 23:30 WEST → segunda 00:30 WET: 25 h, mas dois dias civis
      expect(at('2026-10-26T00:30:00Z', '2026-10-24T22:30:00Z')).toMatch(/é daqui a 2 dias/);
    });
    it('um prazo que já passou hoje não diz «há 1 dia»', () => {
      expect(at('2026-10-19T09:00:00Z', '2026-10-19T15:00:00Z')).toMatch(/o prazo terminou hoje/);
      expect(at('2026-10-17T09:00:00Z', '2026-10-19T15:00:00Z')).toMatch(/o prazo passou há 2 dia\(s\)/);
    });
    it('chama «Urgência» ao nível calculado, para não colidir com a prioridade escolhida', () => {
      expect(at('2026-10-20T09:00:00Z', '2026-10-19T22:00:00Z')).toMatch(/^Urgência (alta|média|baixa):/);
    });
  });

  it('calendarDaysUntil: 0 = hoje, 1 = amanhã, −1 = ontem, no fuso indicado', () => {
    const now = new Date('2026-10-19T22:30:00Z'); // 23:30 em Lisboa
    expect(calendarDaysUntil(new Date('2026-10-19T22:50:00Z'), now, 'Europe/Lisbon')).toBe(0);
    expect(calendarDaysUntil(new Date('2026-10-19T23:10:00Z'), now, 'Europe/Lisbon')).toBe(1);
    expect(calendarDaysUntil(new Date('2026-10-18T12:00:00Z'), now, 'Europe/Lisbon')).toBe(-1);
  });

  it('distribui o trabalho por vários dias em vez de o concentrar', () => {
    const { sessions } = planStudy(input({ items: [task(1, { remainingMinutes: 300 })] }));
    const days = new Set(sessions.map((s) => zonedDayKey(new Date(s.start), TZ)));
    expect(days.size).toBeGreaterThanOrEqual(3);
  });

  it('alterna disciplinas quando a prioridade é comparável', () => {
    const { sessions } = planStudy(
      input({ items: [task(1, { remainingMinutes: 300 }), task(2, { remainingMinutes: 300 })] }),
    );
    const sameDay = sessions.filter((s) => zonedDayKey(new Date(s.start), TZ) === '2026-10-19');
    expect(sameDay.map((s) => s.itemId)).toEqual([1, 2, 1]);
  });

  it('é determinístico: o mesmo input dá o mesmo plano', () => {
    const items = [task(1, { remainingMinutes: 200 }), task(2, { deadline: new Date('2026-10-23T20:00:00Z') })];
    expect(planStudy(input({ items }))).toEqual(planStudy(input({ items })));
  });

  it('avaliações que já passaram não geram sessões', () => {
    const past = task(1, { type: 'assessment', deadline: new Date('2026-10-10T09:00:00Z'), label: 'Teste' });
    const { sessions, unplanned } = planStudy(input({ items: [past] }));
    expect(sessions).toEqual([]);
    expect(unplanned[0]!.reason).toBe('PAST_DEADLINE');
  });

  it('não deixa um prazo próximo sem sessões por causa de itens com mais peso (EDF)', () => {
    // segunda a quarta 18:00–21:00 → 150 min úteis por dia; avaliações pesadas competem com tarefas urgentes
    const items = [
      task(1, { title: 'Ficha 4', deadline: new Date('2026-10-20T22:59:00Z'), remainingMinutes: 90, priority: 'HIGH' }),
      task(2, {
        type: 'assessment',
        title: 'Teste 2',
        label: 'Teste',
        deadline: new Date('2026-10-21T08:00:00Z'),
        remainingMinutes: 180,
        weightPercent: 50,
        priority: 'HIGH',
      }),
      task(3, {
        type: 'assessment',
        title: 'Projeto',
        label: 'Projeto',
        deadline: new Date('2026-10-23T22:59:00Z'),
        remainingMinutes: 240,
        weightPercent: 40,
        priority: 'HIGH',
      }),
    ];
    const { sessions, unplanned } = planStudy(input({ items }));
    const minutesFor = (id: number) => sessions.filter((s) => s.itemId === id).reduce((n, s) => n + s.minutes, 0);
    expect(minutesFor(1)).toBe(90);
    expect(minutesFor(2)).toBe(180);
    expect(minutesFor(3)).toBe(240);
    expect(unplanned).toEqual([]);
    for (const s of sessions) {
      const item = items.find((i) => i.id === s.itemId)!;
      expect(new Date(s.end).getTime()).toBeLessThanOrEqual(item.deadline!.getTime());
    }
  });

  it('trabalho com prazo depois do período fica "para depois", sem alarme de falta de espaço', () => {
    const exam = task(1, { deadline: new Date('2026-11-05T09:00:00Z'), remainingMinutes: 2000 });
    const { unplanned, warnings } = planStudy(input({ items: [exam] }));
    expect(unplanned[0]).toMatchObject({ reason: 'BEYOND_HORIZON' });
    expect(unplanned[0]!.message).toMatch(/ficam para depois deste período \(prazo a 05\/11\)/);
    expect(warnings).toEqual([]);
  });
});

describe('itens com estimativa pelo ritmo dos ECTS', () => {
  const ects = (id: number, minutes: number, overrides: Partial<WorkItem> = {}) =>
    task(id, {
      type: 'assessment',
      label: 'Teste',
      title: `Teste ${id}`,
      weightPercent: 40,
      remainingMinutes: minutes,
      estimateSource: 'ects',
      estimateNote: '6 ECTS × 25 h − 60 h de aulas = 90 h; 40 % → 36 h até 31/01 ≈ 1 h 39/semana',
      ...overrides,
    });

  it('a explicação mostra a conta e, sem data, nunca fala em dias até ao prazo', () => {
    const { sessions } = planStudy(input({ items: [ects(1, 99)] }));
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions[0]!.reason).toMatch(/sem prazo definido; vale 40% da nota; ritmo pelos ECTS: 6 ECTS × 25 h/);
    expect(sessions[0]!.reason).not.toMatch(/daqui a|faltam cerca/);
    expect(sessions[0]!.estimateSource).toBe('ects');
  });

  it('o que não cabe é falta de espaço (com aviso e números), não «fica para depois»', () => {
    // 3 dias úteis × 3 h; 6 quotas de 300 min não cabem
    const items = [1, 2, 3, 4, 5, 6].map((id) => ects(id, 300));
    const result = planStudy(input({ items, to: new Date('2026-10-22T07:00:00Z') }));
    const left = result.unplanned.filter((u) => u.missingMinutes);
    expect(left.length).toBeGreaterThan(0);
    expect(left.every((u) => u.reason === 'NO_SPACE')).toBe(true);
    expect(result.warnings.join(' ')).toMatch(
      /O ritmo pelos ECTS pede cerca de 30 h de estudo neste período e só cabem/,
    );
  });

  it('sem estimativa, diz exatamente o que falta', () => {
    const result = planStudy(
      input({
        items: [ects(1, 0, { remainingMinutes: null, missingInfo: 'Falta o ECTS de D1 — indica-o na disciplina.' })],
      }),
    );
    expect(result.unplanned[0]).toMatchObject({
      reason: 'NO_ESTIMATE',
      disciplineId: 1,
      message: 'Falta o ECTS de D1 — indica-o na disciplina.',
    });
  });

  it('regressão: itens com estimativa do estudante dão exatamente o mesmo plano', () => {
    const items = [
      task(1, { remainingMinutes: 240 }),
      task(2, { remainingMinutes: 90, deadline: new Date('2026-10-23T20:00:00Z') }),
    ];
    const plain = planStudy(input({ items }));
    const marked = planStudy(input({ items: items.map((i) => ({ ...i, estimateSource: 'user' as const })) }));
    const strip = (r: typeof plain) => ({ ...r, sessions: r.sessions.map(({ estimateSource: _e, ...rest }) => rest) });
    expect(strip(marked)).toEqual(strip(plain));
    expect(plain.sessions.some((s) => 'estimateSource' in s)).toBe(false);
  });
});
