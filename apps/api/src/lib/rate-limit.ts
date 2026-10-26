// Limites de pedidos (secção 12.3). As inundações de rede (camadas 3/4) param na Cloudflare do Render antes de
// chegarem à app; aqui trata-se do abuso na aplicação: força bruta, criação de contas em massa, pedidos caros.
// As respostas 429 usam o formato de erro comum (spec §13.2).
// shortcut: contadores em memória de um só processo (o Render gratuito tem uma instância); com várias
// instâncias, usar um store partilhado (Render Key Value / Redis), senão cada uma conta à parte.
import type { Request, Response } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

const MINUTE = 60 * 1000;
const WINDOW_MS = 15 * MINUTE;

const tooManyRequests = (message: string) => (req: Request, res: Response) => {
  res.status(429).json({ error: { code: 'TOO_MANY_REQUESTS', message, requestId: req.requestId } });
};

/**
 * IP real do cliente. No Render todo o tráfego passa pela Cloudflare, que escreve `CF-Connecting-IP` por cima de
 * qualquer valor enviado pelo cliente; o primeiro valor de X-Forwarded-For, pelo contrário, pode ser inventado.
 * Sem esse cabeçalho (local, testes), usa-se `req.ip` (trust proxy). IPv6 conta por sub-rede /56.
 */
export function clientIp(req: Request): string {
  const cf = req.get('cf-connecting-ip');
  const ip = cf && cf.length <= 45 ? cf : (req.ip ?? 'desconhecido');
  return ipKeyGenerator(ip);
}

const base = { standardHeaders: 'draft-8', legacyHeaders: false, validate: { keyGeneratorIpFallback: false } } as const;

/** Teto por IP para toda a API: trava inundações de uma só origem, mas deixa caber uma turma no mesmo Wi-Fi. */
export const generalLimiter = (limit = 2000) =>
  rateLimit({
    ...base,
    windowMs: WINDOW_MS,
    limit,
    keyGenerator: clientIp,
    handler: tooManyRequests('Demasiados pedidos. Espera alguns minutos e tenta novamente.'),
  });

/** Por conta (depois do requireAuth): o uso normal de uma pessoa fica muito abaixo, mesmo com a turma no mesmo IP. */
export const accountLimiter = (limit = 600) =>
  rateLimit({
    ...base,
    windowMs: WINDOW_MS,
    limit,
    keyGenerator: (req) => `conta:${req.userId}`,
    handler: tooManyRequests('Demasiados pedidos desta conta. Espera alguns minutos e tenta novamente.'),
  });

/** Operações caras (gerar plano, importar, exportar), por conta. */
export const costlyLimiter = (limit = 30) =>
  rateLimit({
    ...base,
    windowMs: WINDOW_MS,
    limit,
    keyGenerator: (req) => `caro:${req.userId}`,
    handler: tooManyRequests('Fizeste muitas operações destas seguidas. Espera alguns minutos e tenta novamente.'),
  });

/** Criação de contas por IP, contando também as que correm bem (evita contas em massa a encher a base de dados). */
export const registerLimiter = (limit = 20) =>
  rateLimit({
    ...base,
    windowMs: 60 * MINUTE,
    limit,
    keyGenerator: clientIp,
    handler: tooManyRequests('Foram criadas demasiadas contas a partir desta rede. Tenta novamente daqui a uma hora.'),
  });

/** Tentativas falhadas em operações com palavra-passe ou códigos, por IP (vários alunos na mesma rede cabem). */
export const credentialLimiter = (limit = 50) =>
  rateLimit({
    ...base,
    windowMs: WINDOW_MS,
    limit,
    skipSuccessfulRequests: true,
    keyGenerator: clientIp,
    handler: tooManyRequests('Demasiadas tentativas. Tenta novamente daqui a 15 minutos.'),
  });

/**
 * Logins falhados por IP + email: trava a força bruta a uma conta sem que os erros de um colega bloqueiem os outros,
 * e sem permitir que alguém bloqueie a conta de outra pessoa a partir de outra rede.
 */
export const loginLimiter = (limit = 10) =>
  rateLimit({
    ...base,
    windowMs: WINDOW_MS,
    limit,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => {
      const email: unknown = (req.body as { email?: unknown } | undefined)?.email;
      return `${clientIp(req)}|${typeof email === 'string' ? email.trim().toLowerCase().slice(0, 254) : ''}`;
    },
    handler: tooManyRequests('Demasiadas tentativas com este email. Tenta novamente daqui a 15 minutos.'),
  });
