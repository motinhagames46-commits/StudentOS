import { existsSync } from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { env } from './lib/env.js';
import { requireAuth } from './middleware/auth.js';
import { apiNotFound, errorHandler, requestId, requireJsonBody } from './middleware/errors.js';
import { assessmentsRouter } from './routes/assessments.js';
import { authRouter } from './routes/auth.js';
import { dashboardRouter } from './routes/dashboard.js';
import { disciplinesRouter } from './routes/disciplines.js';
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

const WEB_DIST = path.resolve(import.meta.dirname, '../../web/dist');

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (env.isProd) app.set('trust proxy', 1);

  app.use(requestId);
  app.use(helmet());
  // Limite de 100 KB, exceto nas importações (ficheiro como texto, até 1 MB + envelope JSON).
  const smallJson = express.json({ limit: '100kb' });
  const importJson = express.json({ limit: '2mb' });
  app.use((req, res, next) =>
    req.method === 'POST' && req.path === '/api/imports' ? importJson(req, res, next) : smallJson(req, res, next),
  );
  app.use(cookieParser());

  const api = express.Router();
  api.use(requireJsonBody);

  // Secção 12.3 — limites de pedidos (desativados nos testes)
  if (!env.isTest) {
    api.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false }));
    api.use(
      ['/auth/login', '/auth/register'],
      rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 10,
        skipSuccessfulRequests: true,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        handler: (req, res) => {
          res.status(429).json({
            error: {
              code: 'TOO_MANY_REQUESTS',
              message: 'Demasiadas tentativas. Tenta novamente daqui a 15 minutos.',
              requestId: req.requestId,
            },
          });
        },
      }),
    );
  }

  api.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  api.use('/auth', authRouter);
  api.use('/me', requireAuth, meRouter);
  api.use('/semesters', requireAuth, semestersRouter);
  api.use('/disciplines', requireAuth, disciplinesRouter);
  api.use('/assessments', requireAuth, assessmentsRouter);
  api.use('/tasks', requireAuth, tasksRouter);
  api.use('/dashboard', requireAuth, dashboardRouter);
  api.use('/study-sessions', requireAuth, studySessionsRouter);
  api.use('/imports', requireAuth, importsRouter);
  api.use('/schedule-blocks', requireAuth, scheduleBlocksRouter);
  api.use('/preferences', requireAuth, preferencesRouter);
  api.use('/planner', requireAuth, plannerRouter);
  api.use('/planned-sessions', requireAuth, plannedSessionsRouter);
  api.use('/integrations', requireAuth, integrationsRouter);
  api.use(['/stats', '/calendar', '/alerts'], requireAuth);
  api.use(insightsRouter);
  api.use(apiNotFound);

  app.use('/api', api);

  // Produção: uma só origem — o Express serve também o frontend (secção 8.1).
  if (existsSync(WEB_DIST)) {
    app.use(express.static(WEB_DIST, { index: false, maxAge: '1h' }));
    app.get('/{*path}', (_req, res) => {
      res.sendFile(path.join(WEB_DIST, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}

export const app = createApp();
