import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Response } from 'express';
import { env } from './env.js';

export const SESSION_COOKIE = 'sid';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// bcrypt com custo ≥ 12 (spec §14.1 aceita "alternativa atual e adequada" ao Argon2id; ver docs/ARCHITECTURE.md).
const BCRYPT_COST = env.isTest ? 4 : 12;

export const hashPassword = (password: string) => bcrypt.hash(password, BCRYPT_COST);
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

// Hash fixo usado quando o email não existe, para o tempo de resposta não revelar contas registadas.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', BCRYPT_COST);
export const verifyAgainstDummy = (password: string) => bcrypt.compare(password, DUMMY_HASH);

/** Token opaco de sessão (256 bits). Só o seu SHA-256 é guardado na base de dados. */
export function newSessionToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashSessionToken(token) };
}

export const hashSessionToken = (token: string) => createHash('sha256').update(token).digest('hex');

const cookieOptions = {
  httpOnly: true,
  secure: env.isProd,
  sameSite: 'lax' as const,
  path: '/',
};

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_TTL_MS });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, cookieOptions);
}

// Pequena lista local de palavras-passe comuns (secção 12.1). Alargar com uma lista maior se necessário.
const COMMON_PASSWORDS = new Set([
  '123456789012',
  '1234567890123',
  'password1234',
  'passwordpassword',
  'qwertyuiop12',
  'qwertyuiopas',
  'iloveyou1234',
  'aaaaaaaaaaaa',
  '111111111111',
  '000000000000',
  'abcdefghijkl',
  'abc123abc123',
  'palavrapasse',
  'palavra-passe',
  'benfica12345',
  'portugal1234',
  'studentos123',
  'estudante123',
]);

export function isCommonPassword(password: string): boolean {
  return COMMON_PASSWORDS.has(password.toLowerCase());
}
