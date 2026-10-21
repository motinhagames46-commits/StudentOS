// Conjunto de avaliação «Colar ficha da UC» (fixtures/fichas-uc): o resultado esperado tem de ser algo que o
// StudentOS aceita gravar, com pesos que somam 100 % e sem datas (as fichas não as têm).
import { readFileSync, readdirSync } from 'node:fs';
import { assessmentCreateSchema, assessmentTypes, disciplineCreateSchema } from '@studentos/shared';
import { describe, expect, it } from 'vitest';

type AssessmentType = (typeof assessmentTypes)[number];

interface ExpectedAssessment {
  name: string;
  type: AssessmentType;
  acceptTypes?: AssessmentType[];
  weight: number;
  minScore: number | null;
  date?: null;
}

interface Case {
  id: string;
  cdDiscip: string;
  available: boolean;
  difficulty: string;
  expected: {
    discipline: { name: string; ects: number; passingGrade: number };
    assessments: ExpectedAssessment[];
    examRegime: ExpectedAssessment[] | null;
  } | null;
}

const dir = new URL('./fixtures/fichas-uc/', import.meta.url);
const datasets = readdirSync(dir)
  .filter((file) => file.endsWith('.json'))
  .map((file) => ({ file, ...(JSON.parse(readFileSync(new URL(file, dir), 'utf8')) as { cases: Case[] }) }));

const total = (items: ExpectedAssessment[]) => items.reduce((sum, a) => sum + a.weight, 0);

describe.each(datasets)('conjunto $file', ({ cases }) => {
  it('tem identificadores e códigos de UC únicos', () => {
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
    expect(new Set(cases.map((c) => c.cdDiscip)).size).toBe(cases.length);
  });

  it('só os casos negativos não têm resultado esperado', () => {
    for (const c of cases) {
      expect(c.expected === null, c.id).toBe(!c.available);
      expect(c.difficulty === 'negativo', c.id).toBe(!c.available);
    }
  });

  it.each(cases.filter((c) => c.expected).map((c) => [c.id, c] as const))(
    '%s: o esperado é gravável, soma 100 % e não tem datas',
    (_id, c) => {
      const { discipline, assessments, examRegime } = c.expected!;
      expect(() => disciplineCreateSchema.omit({ code: true }).parse(discipline)).not.toThrow();

      for (const a of assessments) {
        expect(a.date).toBeNull();
        const { name, type, weight, minScore, date } = a;
        expect(() => assessmentCreateSchema.parse({ name, type, weight, minScore, date }), a.name).not.toThrow();
        for (const t of a.acceptTypes ?? []) {
          expect(assessmentTypes).toContain(t);
          expect(t).not.toBe(a.type);
        }
      }
      expect(total(assessments)).toBeCloseTo(100, 9);
      if (examRegime) expect(total(examRegime)).toBeCloseTo(100, 9);
    },
  );
});
