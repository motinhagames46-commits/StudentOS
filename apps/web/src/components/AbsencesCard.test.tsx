import { expect, it } from 'vitest';
import { absenceSummary } from './AbsencesCard';

it('avisa perto do limite de faltas e quando é ultrapassado', () => {
  expect(absenceSummary(2, null).tone).toBe('neutral');
  expect(absenceSummary(2, 6)).toEqual({ text: 'Podes faltar mais 4 vezes.', tone: 'neutral' });
  expect(absenceSummary(5, 6)).toEqual({ text: 'Só podes faltar mais uma vez.', tone: 'warn' });
  expect(absenceSummary(6, 6).tone).toBe('danger');
  expect(absenceSummary(8, 6)).toEqual({ text: 'Ultrapassaste o limite de faltas em 2.', tone: 'danger' });
});
