// Aplica as migrações à base de dados de teste antes de correr os testes.
import { execSync } from 'node:child_process';

export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://studentos:studentos@localhost:54329/studentos_test';
  execSync('npx prisma migrate deploy', { stdio: 'pipe', env: { ...process.env, DATABASE_URL: url } });
}
