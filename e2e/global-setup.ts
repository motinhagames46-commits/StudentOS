// Aplica as migrações à base de dados de teste antes dos testes (o servidor já está a correr, mas só
// acede à base de dados nos pedidos).
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export default function globalSetup() {
  const url = process.env.E2E_DATABASE_URL ?? 'postgresql://studentos:studentos@localhost:54329/studentos_test';
  execSync('npx prisma migrate deploy', {
    cwd: fileURLToPath(new URL('../apps/api', import.meta.url)),
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: url },
  });
}
