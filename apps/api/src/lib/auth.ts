import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Response } from 'express';
import { env } from './env.js';

export const SESSION_COOKIE = 'sid';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const BCRYPT_COST = env.isTest ? 4 : 12; // custo ≥ 12 (RNF01); reduzido só nos testes

export const hashPassword = (password: string) => bcrypt.hash(password, BCRYPT_COST);
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

// Hash fixo usado quando o email não existe, para o tempo de resposta não revelar contas registadas.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', BCRYPT_COST);
export const verifyAgainstDummy = (password: string) => bcrypt.compare(password, DUMMY_HASH);

interface SessionPayload {
  sub: string;
  tv: number;
}

export function signSession(user: { id: number; tokenVersion: number }): string {
  return jwt.sign({ tv: user.tokenVersion }, env.JWT_SECRET, {
    subject: String(user.id),
    expiresIn: SESSION_TTL_SECONDS,
    algorithm: 'HS256',
  });
}

export function verifySession(token: string): { userId: number; tokenVersion: number } | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as SessionPayload;
    const userId = Number(payload.sub);
    if (!Number.isInteger(userId) || typeof payload.tv !== 'number') return null;
    return { userId, tokenVersion: payload.tv };
  } catch {
    return null;
  }
}

const cookieOptions = {
  httpOnly: true,
  secure: env.isProd,
  sameSite: 'lax' as const,
  path: '/',
};

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_TTL_SECONDS * 1000 });
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
