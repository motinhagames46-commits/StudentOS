// Assistente sobre os documentos (passo 3 da IA): só com a IA ativa; a conversa não fica guardada.
import { Router } from 'express';
import { assistantAskSchema } from '@studentos/shared';
import { aiProvider } from '../ai/access.js';
import { answerQuestion } from '../ai/assistant.js';
import { parse } from '../lib/http.js';
import { findOwnedDiscipline } from '../lib/ownership.js';
import { requireAi } from '../middleware/ai.js';

export const assistantRouter = Router();

assistantRouter.post('/ask', requireAi, async (req, res) => {
  const input = parse(assistantAskSchema, req.body);
  if (input.disciplineId) await findOwnedDiscipline(req.userId, input.disciplineId);
  res.json(await answerQuestion(aiProvider()!, req.userId, input));
});
