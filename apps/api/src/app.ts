import { existsSync } from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { env } from './lib/env.js';
import {
  accountLimiter,
  costlyLimiter,
  credentialLimiter,
  generalLimiter,
  loginLimiter,
  registerLimiter,
} from './lib/rate-limit.js';
import { requireAuth } from './middleware/auth.js';
import { apiNotFound, errorHandler, requestId, requireJsonBody } from './middleware/errors.js';
import { aiRouter } from './routes/ai.js';
import { assessmentsRouter } from './routes/assessments.js';
import { assistantRouter } from './routes/assistant.js';
import { authRouter } from './routes/auth.js';
import { dashboardRouter } from './routes/dashboard.js';
import { disciplinesRouter } from './routes/disciplines.js';
import { documentsRouter } from './routes/documents.js';
import { importsRouter } from './routes/imports.js';
import { insightsRouter } from './routes/insights.js';
import { integrationsRouter } from './routes/integrations.js';
import { meRouter } from './routes/me.js';
import { plannedSessionsRouter } from './routes/planned-sessions.js';
import { plannerRouter, preferencesRouter } from './routes/planner.js';
import { scheduleBlocksRouter } from './routes/schedule-blocks.js';
import { semestersRouter } from './routes/semesters.js';
import { studySessionsRouter } from './routes/study-sessions.js';
import { tasksRouter } from './routes/tasks.js';
import { transfersRouter } from './routes/transfers.js';

const WEB_DIST = path.resolve(import.meta.dirname, '../../web/dist');

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (env.isProd) app.set('trust proxy', 1);

  app.use(requestId);
  app.use(helmet());
  // Limite de 100 KB, exceto nas importações (ficheiro como texto, até 1 MB + envelope JSON). Os documentos
  // (até 15 MB) só são lidos depois da sessão e dos limites de pedidos, no próprio router.
  const smallJson = express.json({ limit: '100kb' });
  const importJson = express.json({ limit: '2mb' });
  app.use((req, res, next) => {
    if (req.method === 'POST' && req.path === '/api/imports') return importJson(req, res, next);
    if (req.method === 'POST' && req.path === '/api/documents') return next();
    return smallJson(req, res, next);
  });
  app.use(cookieParser());

  const api = express.Router();
  api.use(requireJsonBody);

  // Secção 12.3 — limites de pedidos em camadas (desativados nos outros testes; ver test/rate-limit.test.ts)
  const limits = !env.isTest;
  if (limits) {
    api.use(generalLimiter(env.RATE_LIMIT_PER_15_MIN));
    api.post('/auth/register', registerLimiter(env.RATE_LIMIT_REGISTER_PER_HOUR));
    api.post('/auth/login', loginLimiter());
    const credentials = credentialLimiter();
    // Inclui os códigos de transferência: só as tentativas falhadas contam (adivinhar códigos).
    api.use(['/auth/login', '/me/password', '/transfers/preview', '/transfers/accept'], credentials);
    api.delete('/me', credentials);
  }
  // Rotas com sessão: limite por conta (não pelo IP partilhado) e um mais apertado nas operações caras.
  const authed = limits ? [requireAuth, accountLimiter()] : [requireAuth];
  if (limits) {
    const costly = costlyLimiter();
    api.post(
      ['/planner/preview', '/planner/replan', '/imports', '/transfers', '/ai/check', '/documents', '/assistant/ask'],
      requireAuth,
      costly,
    );
    api.get(['/me/export', '/me/calendar.ics'], requireAuth, costly);
  }

  api.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  api.use('/auth', authRouter);
  api.use('/me', ...authed, meRouter);
  api.use('/transfers', ...authed, transfersRouter);
  api.use('/semesters', ...authed, semestersRouter);
  api.use('/disciplines', ...authed, disciplinesRouter);
  api.use('/assessments', ...authed, assessmentsRouter);
  api.use('/tasks', ...authed, tasksRouter);
  api.use('/dashboard', ...authed, dashboardRouter);
  api.use('/study-sessions', ...authed, studySessionsRouter);
  api.use('/imports', ...authed, importsRouter);
  api.use('/schedule-blocks', ...authed, scheduleBlocksRouter);
  api.use('/preferences', ...authed, preferencesRouter);
  api.use('/planner', ...authed, plannerRouter);
  api.use('/planned-sessions', ...authed, plannedSessionsRouter);
  api.use('/integrations', ...authed, integrationsRouter);
  api.use('/ai', ...authed, aiRouter);
  api.use('/documents', ...authed, documentsRouter);
  api.use('/assistant', ...authed, assistantRouter);
  api.use(['/stats', '/calendar', '/alerts'], ...authed);
  api.use(insightsRouter);
  api.use(apiNotFound);

  app.use('/api', api);

  // Produção: uma só origem — o Express serve também o frontend (secção 8.1).
  if (existsSync(WEB_DIST)) {
    // Ficheiros com hash no nome nunca mudam: cache longa. Um ficheiro em falta (versão antiga) dá 404, não o HTML.
    app.use(
      '/assets',
      express.static(path.join(WEB_DIST, 'assets'), { immutable: true, maxAge: '1y' }),
      (_req, res) => {
        res.status(404).end();
      },
    );
    app.use(express.static(WEB_DIST, { index: false, maxAge: '1h' }));
    app.get('/{*path}', (_req, res) => {
      // O HTML revalida sempre, para cada publicação chegar logo ao browser.
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(WEB_DIST, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}

export const app = createApp();
