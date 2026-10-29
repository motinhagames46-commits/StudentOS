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
  /** Chave do Gemini: só no servidor (.env local e variáveis do Render). Sem ela, a IA fica «Não configurada». */
  GEMINI_API_KEY: cleanSecret(process.env.GEMINI_API_KEY),
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-flash-latest',
  GEMINI_EMBEDDING_MODEL: process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001',
  /** Emails (separados por vírgulas) das contas que podem usar a IA. Vazio: ninguém. */
  AI_ALLOWED_EMAILS: emailList(process.env.AI_ALLOWED_EMAILS),
  /** Commit a correr (o Render define-o na build e em execução): a web compara-o e avisa se está desatualizada. */
  APP_VERSION: process.env.RENDER_GIT_COMMIT ?? '',
};

/**
 * Uma chave colada no painel do Render ou no .env traz às vezes uma quebra de linha, espaços ou aspas.
 * As chaves nunca os têm, e com eles o pedido nem sai (cabeçalho HTTP inválido).
 */
export function cleanSecret(raw: string | undefined): string {
  return (raw ?? '').replace(/\s+/g, '').replace(/^["']+|["']+$/g, '');
}

function emailList(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function positiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} tem de ser um inteiro positivo`);
  return value;
}
