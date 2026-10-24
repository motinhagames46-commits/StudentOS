// Perfil de lint com tipos (toolkit: next.typed.config.mjs.example, adaptado ao monorepo).
// Só as duas regras de correção assíncrona; corre à parte por ser mais lento (npm run lint:typed).
// Erro onde o código já está limpo (API, shared, E2E); aviso na web, com dívida contada em docs/quality.md.
import tseslint from 'typescript-eslint';
import base from './eslint.config.js';

const asyncRules = (severity) => ({
  '@typescript-eslint/no-floating-promises': severity,
  '@typescript-eslint/no-misused-promises': severity,
});

export default tseslint.config(
  ...base,
  {
    files: ['apps/*/src/**/*.{ts,tsx}', 'apps/*/test/**/*.ts', 'packages/*/src/**/*.ts', 'e2e/**/*.ts'],
    // Os testes do shared não pertencem a nenhum tsconfig (correm só no Vitest).
    ignores: ['packages/*/src/**/*.test.ts'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: asyncRules('error'),
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    rules: asyncRules('warn'),
  },
);
