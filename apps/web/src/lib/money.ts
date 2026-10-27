// Dinheiro em cêntimos inteiros (EUR): mostrar com o formato português e ler o que se escreve («12,50»).

const euros = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });

export const formatEuros = (cents: number) => euros.format(cents / 100);

/** «12», «12,5», «12,50» ou «12.50» → cêntimos; outra coisa → null. */
export function parseEuros(text: string): number | null {
  const value = text.trim();
  if (!/^\d{1,6}([.,]\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split(/[.,]/);
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

/** «outubro de 2026» para «2026-10». */
export function monthLabel(month: string): string {
  return new Date(`${month}-01T12:00:00Z`).toLocaleDateString('pt-PT', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function shiftMonth(month: string, offset: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const t = new Date(Date.UTC(y, m - 1 + offset, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
}
