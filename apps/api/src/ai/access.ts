// Quem pode usar a IA e em que estado está: só contas na lista AI_ALLOWED_EMAILS, com a chave configurada
// no servidor e consentimento dado na app. Uma conta fora da lista nem sabe se a IA está configurada.
import { env } from '../lib/env.js';
import { GeminiProvider } from './gemini.js';
import type { AiProvider } from './provider.js';

export type AiStatus = 'NOT_ALLOWED' | 'NOT_CONFIGURED' | 'NEEDS_CONSENT' | 'ENABLED';

/** Versão do texto de consentimento mostrado na página Integrações (2: pesquisa Google no assistente). */
export const AI_CONSENT_VERSION = '2026-10-26.2';

let gemini: GeminiProvider | null = null;
let override: AiProvider | null | undefined;

/** O fornecedor configurado, ou null sem chave. */
export function aiProvider(): AiProvider | null {
  if (override !== undefined) return override;
  if (!env.GEMINI_API_KEY) return null;
  gemini ??= new GeminiProvider(env.GEMINI_API_KEY, env.GEMINI_MODEL, env.GEMINI_EMBEDDING_MODEL);
  return gemini;
}

/** Só para testes: substitui o fornecedor (null = sem chave; undefined = volta ao real). */
export function setAiProviderForTests(provider: AiProvider | null | undefined) {
  override = provider;
}

export const isAiAllowed = (email: string) => env.AI_ALLOWED_EMAILS.includes(email.toLowerCase());

export function aiStatusOf(user: {
  email: string;
  aiConsentAt: Date | null;
  aiConsentVersion: string | null;
}): AiStatus {
  if (!isAiAllowed(user.email)) return 'NOT_ALLOWED';
  if (!aiProvider()) return 'NOT_CONFIGURED';
  // Um consentimento dado a um texto anterior não cobre o que mudou: volta a pedir-se.
  if (!user.aiConsentAt || user.aiConsentVersion !== AI_CONSENT_VERSION) return 'NEEDS_CONSENT';
  return 'ENABLED';
}
