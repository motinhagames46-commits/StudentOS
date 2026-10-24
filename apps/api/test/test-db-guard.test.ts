import { describe, expect, it } from 'vitest';
import { assertDisposableTestDatabase } from './test-db-guard.js';

describe('guarda da base de dados de teste', () => {
  it('aceita bases locais descartáveis (local e CI)', () => {
    expect(() => assertDisposableTestDatabase('postgresql://u:p@localhost:54329/studentos_test')).not.toThrow();
    expect(() => assertDisposableTestDatabase('postgresql://u:p@127.0.0.1:5432/studentos_test')).not.toThrow();
  });

  it('recusa bases remotas ou que não sejam de teste, sem expor a palavra-passe', () => {
    for (const url of [
      'postgresql://u:segredo@ep-x.eu-central-1.aws.neon.tech/neondb?sslmode=require',
      'postgresql://u:segredo@localhost:54329/studentos',
      'isto-nao-e-um-url',
    ]) {
      expect(() => assertDisposableTestDatabase(url)).toThrow(/Recusado|inválido/);
      try {
        assertDisposableTestDatabase(url);
      } catch (e) {
        expect(String(e)).not.toContain('segredo');
      }
    }
  });
});
