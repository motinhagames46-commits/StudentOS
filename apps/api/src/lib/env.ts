import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente em falta: ${name} (ver apps/api/.env.example)`);
  return value;
}

const nodeEnv = process.env.NODE_ENV ?? 'development';

export const env = {
  NODE_ENV: nodeEnv,
  isProd: nodeEnv === 'production',
  isTest: nodeEnv === 'test',
  PORT: Number(process.env.PORT ?? 4000),
  DATABASE_URL: required('DATABASE_URL'),
  /** Pedidos por IP a cada 15 minutos (teto geral; cabe uma turma no mesmo Wi-Fi). */
  RATE_LIMIT_PER_15_MIN: positiveInt('RATE_LIMIT_PER_15_MIN', 2000),
  /** Contas criadas por IP a cada hora. Só os testes E2E o aumentam: todos vêm do mesmo IP. */
  RATE_LIMIT_REGISTER_PER_HOUR: positiveInt('RATE_LIMIT_REGISTER_PER_HOUR', 20),
};

function positiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} tem de ser um inteiro positivo`);
  return value;
}
