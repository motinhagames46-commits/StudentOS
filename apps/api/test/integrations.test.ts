import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { createMoodleProvider, createOutlookProvider, MockMoodleProvider } from '../src/integrations/providers.js';
import { IntegrationNotConfiguredError } from '../src/integrations/types.js';
import { createUserAndLogin, resetDb } from './helpers.js';

const mockData = {
  courses: [{ externalId: '42', name: 'Programação Web', code: 'PW' }],
  activities: [
    { externalId: 'a1', title: 'Entrega 1', dueAt: new Date('2026-11-06T23:59:00Z'), courseExternalId: '42' },
    { externalId: 'a2', title: 'Entrega 2', dueAt: new Date('2027-03-01T23:59:00Z'), courseExternalId: '42' },
  ],
  events: [],
};

describe('estado das integrações (spec §9, §10)', () => {
  let cookie: string[];
  beforeEach(async () => {
    await resetDb();
    ({ cookie } = await createUserAndLogin('ines'));
  });

  it('exige sessão', async () => {
    expect((await request(app).get('/api/integrations')).status).toBe(401);
  });

  it('sem autorização, Outlook e Moodle ficam NOT_CONFIGURED — nunca CONNECTED', async () => {
    const res = await request(app).get('/api/integrations').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(
      res.body.map((i: { provider: string; status: string; available: boolean }) => [
        i.provider,
        i.status,
        i.available,
      ]),
    ).toEqual([
      ['OUTLOOK', 'NOT_CONFIGURED', false],
      ['MOODLE', 'NOT_CONFIGURED', false],
    ]);
    expect(JSON.stringify(res.body)).toMatch(/nunca pede nem guarda a tua palavra-passe/);
  });
});

describe('contrato dos fornecedores', () => {
  it('o mock só existe em testes; noutros ambientes o fornecedor é NOT_CONFIGURED', async () => {
    expect(createMoodleProvider({ NODE_ENV: 'test', MOODLE_INTEGRATION_MODE: 'mock' }, mockData).kind).toBe('mock');
    expect(createMoodleProvider({ NODE_ENV: 'production', MOODLE_INTEGRATION_MODE: 'mock' }, mockData).kind).toBe(
      'not-configured',
    );
    expect(createMoodleProvider({ NODE_ENV: 'development', MOODLE_INTEGRATION_MODE: 'mock' }, mockData).kind).toBe(
      'not-configured',
    );
  });

  it('fornecedores não configurados falham de forma controlada', async () => {
    const moodle = createMoodleProvider({ NODE_ENV: 'production' });
    expect(await moodle.checkConnection()).toEqual({ ok: false, status: 'NOT_CONFIGURED', capabilities: [] });
    await expect(moodle.getCourses()).rejects.toBeInstanceOf(IntegrationNotConfiguredError);
    await expect(createOutlookProvider().getEvents({ from: new Date(), to: new Date() })).rejects.toBeInstanceOf(
      IntegrationNotConfiguredError,
    );
  });

  it('o mock respeita o contrato (filtra por intervalo) e identifica-se como simulado', async () => {
    const mock = new MockMoodleProvider(mockData);
    const check = await mock.checkConnection();
    expect(check.status).not.toBe('CONNECTED');
    expect(check.capabilities.every((c) => c.startsWith('mock:'))).toBe(true);
    const activities = await mock.getActivities({ from: new Date('2026-10-01'), to: new Date('2026-12-31') });
    expect(activities.map((a) => a.externalId)).toEqual(['a1']);
  });
});
