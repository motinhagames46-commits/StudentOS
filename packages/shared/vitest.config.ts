import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Igual ao Render: o processo corre em UTC; o fuso da aplicação é sempre explícito (Europe/Lisbon).
    env: { TZ: 'UTC' },
  },
});
