// Estado da IA, consentimento e verificação da ligação ao Gemini (passo 1 do roteiro da IA).
import { Router } from 'express';
import { z } from 'zod';
import { AI_CONSENT_VERSION, aiProvider, aiStatusOf, isAiAllowed } from '../ai/access.js';
import { HttpError } from '../lib/http.js';
import { prisma } from '../lib/prisma.js';
import { requireAi } from '../middleware/ai.js';

export const aiRouter = Router();

const userAi = (id: number) =>
  prisma.user.findUniqueOrThrow({ where: { id }, select: { email: true, aiConsentAt: true, aiConsentVersion: true } });

function statusView(user: Awaited<ReturnType<typeof userAi>>) {
  const status = aiStatusOf(user);
  // Uma conta fora da lista só sabe isso: nem o modelo nem o consentimento.
  if (status === 'NOT_ALLOWED') return { status };
  return {
    status,
    consentAt: user.aiConsentAt,
    consentVersion: user.aiConsentVersion,
    model: aiProvider()?.model ?? null,
  };
}

aiRouter.get('/status', async (req, res) => {
  res.json(statusView(await userAi(req.userId)));
});

aiRouter.post('/consent', async (req, res) => {
  const user = await userAi(req.userId);
  if (!isAiAllowed(user.email)) throw new HttpError(403, 'AI_NOT_ALLOWED', 'A IA não está disponível nesta conta.');
  const updated = await prisma.user.update({
    where: { id: req.userId },
    data: { aiConsentAt: new Date(), aiConsentVersion: AI_CONSENT_VERSION },
    select: { email: true, aiConsentAt: true, aiConsentVersion: true },
  });
  res.json(statusView(updated));
});

// Retirar o consentimento: a IA deixa de ser usada a partir daqui (os dados já guardados na app ficam).
aiRouter.delete('/consent', async (req, res) => {
  await prisma.user.update({ where: { id: req.userId }, data: { aiConsentAt: null, aiConsentVersion: null } });
  res.status(204).end();
});

// Pedido real mínimo: só se diz «ligado» depois de o Gemini responder no formato pedido.
aiRouter.post('/check', requireAi, async (_req, res) => {
  const ai = aiProvider()!;
  const answer = await ai.generateJson(
    z.object({ ok: z.boolean() }),
    [{ text: 'Verificação de ligação. Responde só com o JSON {"ok": true}.' }],
    { thinking: 'low' },
  );
  res.json({ ok: answer.ok, model: ai.model });
});
