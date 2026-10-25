import { scheduleBlockCreateSchema, studyPreferencesSchema } from '@studentos/shared';
import { describe, expect, it } from 'vitest';
import {
  ASSESSMENT_TEMPLATES,
  SESSION_PRESETS,
  availabilityFromChoices,
  commitmentBlock,
  firstDateOnWeekday,
  summarizeByDiscipline,
  weeklyAvailableMinutes,
} from './onboarding';

describe('questionário de boas-vindas', () => {
  it('cada modelo de avaliação soma exatamente 100 %', () => {
    for (const t of ASSESSMENT_TEMPLATES) {
      expect(
        t.items.reduce((s, i) => s + i.weight, 0),
        t.id,
      ).toBe(100);
    }
  });

  it('gera disponibilidade válida (sem sobreposições) para qualquer combinação de dias e períodos', () => {
    const all = availabilityFromChoices([5, 1, 3, 1], ['manha', 'tarde', 'fim-tarde', 'noite']);
    expect(all).toHaveLength(12);
    expect(all[0]).toEqual({ weekday: 1, startMinute: 540, endMinute: 720 });
    for (const preset of SESSION_PRESETS) {
      const parsed = studyPreferencesSchema.safeParse({
        sessionMinutes: preset.sessionMinutes,
        minSessionMinutes: Math.min(25, preset.sessionMinutes),
        breakMinutes: preset.breakMinutes,
        maxDailyMinutes: 180,
        availability: all,
      });
      expect(parsed.success, preset.id).toBe(true);
    }
  });

  it('conta as horas disponíveis por semana', () => {
    // 5 dias × fim de tarde (2 h) = 10 h
    expect(weeklyAvailableMinutes([1, 2, 3, 4, 5], ['fim-tarde'])).toBe(600);
    expect(weeklyAvailableMinutes([], ['noite'])).toBe(0);
  });

  it('resume o plano por disciplina, da que tem mais tempo para a que tem menos', () => {
    expect(
      summarizeByDiscipline([
        { disciplineCode: 'BD', minutes: 50 },
        { disciplineCode: 'PW', minutes: 50 },
        { disciplineCode: 'PW', minutes: 25 },
        { disciplineCode: null, minutes: 30 },
      ]),
    ).toEqual([
      { code: 'PW', minutes: 75, sessions: 2 },
      { code: 'BD', minutes: 50, sessions: 1 },
      { code: 'Sem disciplina', minutes: 30, sessions: 1 },
    ]);
  });
});

describe('compromissos fixos', () => {
  it('começa no próximo dia da semana pedido (hoje incluído)', () => {
    // 2026-10-25 é domingo
    expect(firstDateOnWeekday('2026-10-25', 7)).toBe('2026-10-25');
    expect(firstDateOnWeekday('2026-10-25', 1)).toBe('2026-10-26');
    expect(firstDateOnWeekday('2026-10-27', 1)).toBe('2026-11-02');
  });

  it('gera um bloco semanal ocupado, válido para a API, na hora de Lisboa', () => {
    const block = commitmentBlock(
      { title: ' Trabalho ', weekday: 2, start: '18:00', end: '22:00' },
      '2026-10-25',
      '2027-01-31',
    );
    expect(block).toMatchObject({ title: 'Trabalho', kind: 'OTHER', isBusy: true, repeatWeeklyUntil: '2027-01-31' });
    // terça 27/10 já é hora de inverno (UTC+0); em julho seria UTC+1
    expect(block.startAt).toBe('2026-10-27T18:00:00.000Z');
    expect(block.endAt).toBe('2026-10-27T22:00:00.000Z');
    expect(scheduleBlockCreateSchema.safeParse(block).success).toBe(true);
    expect(
      commitmentBlock({ title: 'Treino', weekday: 3, start: '19:00', end: '20:30' }, '2027-07-05', '2027-07-31')
        .startAt,
    ).toBe('2027-07-07T18:00:00.000Z');
  });
});
