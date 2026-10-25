import { studyPreferencesSchema } from '@studentos/shared';
import { describe, expect, it } from 'vitest';
import {
  ASSESSMENT_TEMPLATES,
  SESSION_PRESETS,
  availabilityFromChoices,
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
