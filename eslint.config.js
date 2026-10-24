import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import quality from './eslint-rules/index.cjs';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', '**/generated/**', '.tools/**', '.pgdata/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // Cópia fiel das regras do toolkit (CommonJS por desenho); não se reformata.
    files: ['eslint-rules/**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  // Regras de qualidade do toolkit (eslint-rules/, cópia fiel; auto-teste: npm run lint:rules).
  // max-lines a 350 em aviso: há ficheiros legados acima do limite (contagem e plano em docs/quality.md).
  {
    files: ['apps/*/src/**/*.{ts,tsx}', 'packages/*/src/**/*.ts'],
    plugins: { quality },
    rules: {
      'quality/max-lines': ['warn', { max: 350 }],
      'quality/no-direct-console': ['error', { logger: 'o tratamento de erros da API (middleware/errors.ts)' }],
    },
  },
  {
    // Pontos de registo da API: erros inesperados (com requestId) e arranque do servidor.
    files: ['apps/api/src/middleware/errors.ts', 'apps/api/src/server.ts'],
    rules: { 'quality/no-direct-console': 'off' },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
);
