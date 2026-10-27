import { expect, it } from 'vitest';
import { formatEuros, monthLabel, parseEuros, shiftMonth } from './money';

it('lê valores como se escrevem em Portugal e recusa o resto', () => {
  expect(parseEuros('12')).toBe(1200);
  expect(parseEuros('12,5')).toBe(1250);
  expect(parseEuros(' 12,50 ')).toBe(1250);
  expect(parseEuros('0,07')).toBe(7);
  expect(parseEuros('12.50')).toBe(1250);
  for (const bad of ['', 'abc', '12,505', '-3', '1.234,56', '12 50']) expect(parseEuros(bad)).toBeNull();
});

it('mostra euros e meses em português', () => {
  expect(formatEuros(123456).replace(/\s/g, ' ')).toBe('1234,56 €');
  expect(monthLabel('2026-10')).toBe('outubro de 2026');
  expect(shiftMonth('2026-01', -1)).toBe('2025-12');
});
