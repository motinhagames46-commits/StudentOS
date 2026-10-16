import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// O `prisma generate` (usado no build) não liga à base de dados, por isso não exige DATABASE_URL.
// Os comandos que ligam (migrate, db seed) falham com erro claro se a variável não estiver definida.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
