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
  JWT_SECRET: required('JWT_SECRET'),
};

if (env.isProd && env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET tem de ter pelo menos 32 caracteres em produção');
}
