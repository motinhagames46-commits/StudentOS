import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { createUserAndLogin, registerUser, resetDb } from './helpers.js';

let afonso: string[]; // conta de origem
let motinha: string[]; // conta de destino (outro email do mesmo estudante)
let pwId: number;

beforeEach(async () => {
  await resetDb();
  ({ cookie: afonso, disciplineId: pwId } = await createUserAndLogin('afonso'));
  ({ cookie: motinha } = await registerUser('motinha'));
});

const post = (cookie: string[], url: string, body: object) => request(app).post(url).set('Cookie', cookie).send(body);

async function seedSource() {
  const { body: bd } = await post(afonso, '/api/disciplines', { name: 'Bases de Dados', code: 'BD', ects: 6 });
  await post(afonso, `/api/disciplines/${pwId}/assessments`, { name: 'Teste', type: 'TEST', weight: 40, score: 14 });
  await post(afonso, `/api/disciplines/${pwId}/assessments`, { name: 'Projeto', type: 'PROJECT', weight: 60 });
  await post(afonso, `/api/disciplines/${bd.id}/assessments`, { name: 'Exame', type: 'EXAM', weight: 100 });
  await post(afonso, '/api/tasks', { title: 'Relatório', disciplineId: pwId });
  await post(afonso, '/api/tasks', { title: 'Pessoal' }); // sem disciplina: fica
  const start = new Date(Date.now() + 2 * 864e5);
  const block = (title: string, disciplineId: number | null) =>
    post(afonso, '/api/schedule-blocks', {
      title,
      kind: 'CLASS',
      startAt: start.toISOString(),
      endAt: new Date(start.getTime() + 2 * 36e5).toISOString(),
      disciplineId,
    });
  await block('Aula PW', pwId);
  await block('Aula sem disciplina', null);
  return { bdId: bd.id as number };
}

const codeFor = async (body: object) => {
  const res = await post(afonso, '/api/transfers', body);
  expect(res.status).toBe(201);
  return res.body.code as string;
};

describe('transferir disciplinas para outra conta', () => {
  it('gera um código só para disciplinas próprias', async () => {
    const res = await post(afonso, '/api/transfers', { disciplineIds: [pwId] });
    expect(res.status).toBe(201);
    expect(res.body.code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(res.body.disciplines).toEqual([{ id: pwId, code: 'PW', name: 'Programação Web' }]);
    expect((await post(motinha, '/api/transfers', { disciplineIds: [pwId] })).status).toBe(404);
    expect((await post(afonso, '/api/transfers', { disciplineIds: [] })).status).toBe(400);
    // Só o hash do código fica guardado.
    const stored = await prisma.disciplineTransfer.findFirstOrThrow();
    expect(stored.codeHash).not.toContain(res.body.code.replace('-', ''));
  });

  it('pré-visualiza sem gravar e transfere tudo o que está ligado às disciplinas', async () => {
    const { bdId } = await seedSource();
    const code = await codeFor({ disciplineIds: [pwId, bdId], includeUnlinkedBlocks: true });

    const preview = await post(motinha, '/api/transfers/preview', { code: code.toLowerCase().replace('-', ' ') });
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({
      from: { name: 'afonso' },
      counts: { disciplines: 2, assessments: 3, tasks: 1, classes: 2 },
      conflicts: [],
    });
    expect((await request(app).get('/api/disciplines').set('Cookie', motinha)).body).toHaveLength(0);

    const accept = await post(motinha, '/api/transfers/accept', { code });
    expect(accept.status).toBe(200);
    expect(accept.body.counts).toMatchObject({ disciplines: 2, assessments: 3, tasks: 1, classes: 2 });

    const mine = await request(app).get('/api/disciplines').set('Cookie', motinha);
    expect(mine.body.map((d: { code: string }) => d.code).sort()).toEqual(['BD', 'PW']);
    const pw = mine.body.find((d: { code: string }) => d.code === 'PW');
    expect(pw.assessments).toHaveLength(2);
    expect(pw.grades.currentAverage).toBe(14);
    // O semestre do mesmo nome, criado no registo, é reaproveitado (sem duplicar).
    const { body: me } = await request(app).get('/api/me').set('Cookie', motinha);
    expect(pw.semesterId).toBe(me.activeSemester.id);
    expect(await prisma.semester.count({ where: { userId: me.user.id } })).toBe(1);

    const tasks = await request(app).get('/api/tasks').set('Cookie', motinha);
    expect(tasks.body.map((t: { title: string }) => t.title)).toEqual(['Relatório']);
    expect(await prisma.scheduleBlock.count({ where: { userId: me.user.id } })).toBe(2);

    // A conta de origem fica só com o que não era das disciplinas.
    expect((await request(app).get('/api/disciplines').set('Cookie', afonso)).body).toHaveLength(0);
    const left = await request(app).get('/api/tasks').set('Cookie', afonso);
    expect(left.body.map((t: { title: string }) => t.title)).toEqual(['Pessoal']);
    expect((await request(app).get(`/api/disciplines/${pwId}`).set('Cookie', afonso)).status).toBe(404);

    // Uso único.
    expect((await post(motinha, '/api/transfers/accept', { code })).status).toBe(404);
  });

  it('sem incluir as aulas sem disciplina, essas ficam na conta de origem', async () => {
    await seedSource();
    const code = await codeFor({ disciplineIds: [pwId] });
    const { body } = await post(motinha, '/api/transfers/accept', { code });
    expect(body.counts.classes).toBe(1);
    const afonsoId = (await request(app).get('/api/me').set('Cookie', afonso)).body.user.id;
    expect(await prisma.scheduleBlock.count({ where: { userId: afonsoId } })).toBe(1);
  });

  it('recusa códigos errados, expirados ou da própria conta', async () => {
    const code = await codeFor({ disciplineIds: [pwId] });
    expect((await post(motinha, '/api/transfers/preview', { code: 'ABCD-EFGH' })).status).toBe(404);
    const same = await post(afonso, '/api/transfers/accept', { code });
    expect(same.status).toBe(409);
    expect(same.body.error.code).toBe('TRANSFER_SAME_ACCOUNT');
    await prisma.disciplineTransfer.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await post(motinha, '/api/transfers/accept', { code })).status).toBe(404);
  });

  it('não sobrepõe uma disciplina com a mesma sigla no mesmo semestre: recusa e não muda nada', async () => {
    await post(motinha, '/api/disciplines', { name: 'Programação Web (cópia)', code: 'PW' });
    const code = await codeFor({ disciplineIds: [pwId] });
    const preview = await post(motinha, '/api/transfers/preview', { code });
    expect(preview.body.conflicts).toEqual(['PW']);
    const accept = await post(motinha, '/api/transfers/accept', { code });
    expect(accept.status).toBe(409);
    expect(accept.body.error.message).toMatch(/Já tens a disciplina PW/);
    expect((await request(app).get(`/api/disciplines/${pwId}`).set('Cookie', afonso)).status).toBe(200);
    // O código não foi gasto: depois de resolver o conflito, pode ser usado.
    expect((await prisma.disciplineTransfer.findFirstOrThrow()).usedAt).toBeNull();
  });

  it('aulas importadas que a conta de destino já tem não são duplicadas', async () => {
    const meId = async (c: string[]) => (await request(app).get('/api/me').set('Cookie', c)).body.user.id as number;
    const afonsoId = await meId(afonso);
    const motinhaId = await meId(motinha);
    const base = {
      title: 'Aula importada',
      kind: 'CLASS' as const,
      startAt: new Date(),
      endAt: new Date(Date.now() + 36e5),
      origin: 'IMPORT_ICS' as const,
      externalId: 'uid-123',
      fingerprint: 'f',
    };
    await prisma.scheduleBlock.create({ data: { ...base, userId: afonsoId, disciplineId: pwId } });
    await prisma.scheduleBlock.create({ data: { ...base, userId: motinhaId } });
    const code = await codeFor({ disciplineIds: [pwId] });
    const { body } = await post(motinha, '/api/transfers/accept', { code });
    expect(body.counts.classes).toBe(0);
    expect(body.duplicates.classes).toBe(1);
    expect(await prisma.scheduleBlock.count({ where: { userId: motinhaId } })).toBe(1);
  });
});
