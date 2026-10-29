import { readFileSync } from 'node:fs';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { createUserAndLogin, resetDb } from './helpers.js';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

let ines: string[];
let rui: string[];

beforeEach(async () => {
  await resetDb();
  ({ cookie: ines } = await createUserAndLogin('ines'));
  ({ cookie: rui } = await createUserAndLogin('rui'));
});

const upload = (cookie: string[], body: object) => request(app).post('/api/imports').set('Cookie', cookie).send(body);
const icsUpload = (cookie: string[], name = 'outlook.ics') =>
  upload(cookie, { kind: 'ICS', filename: name, content: fixture(name) });

const confirmAll = (cookie: string[], job: { id: string; items: { key: string; action: string }[] }) =>
  request(app)
    .post(`/api/imports/${job.id}/confirm`)
    .set('Cookie', cookie)
    .send({ items: job.items.map((i) => ({ key: i.key, action: i.action })) });

describe('pré-visualização (spec §8.2)', () => {
  it('analisa o ficheiro sem gravar aulas nem tarefas', async () => {
    const res = await icsUpload(ines);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('NEEDS_REVIEW');
    expect(res.body.items).toHaveLength(3);
    expect(res.body.counts).toMatchObject({ total: 3, ready: 3, duplicates: 0, errors: 0 });
    expect(await prisma.scheduleBlock.count()).toBe(0);
    expect(await prisma.task.count({ where: { origin: { not: 'MANUAL' } } })).toBe(0);
  });

  it('valida a extensão, o conteúdo real e o tamanho', async () => {
    const wrongExt = await upload(ines, { kind: 'ICS', filename: 'horario.txt', content: fixture('outlook.ics') });
    expect(wrongExt.status).toBe(400);
    const notIcs = await upload(ines, { kind: 'ICS', filename: 'x.ics', content: 'olá' });
    expect(notIcs.status).toBe(400);
    const zip = await upload(ines, { kind: 'CSV', filename: 'x.csv', content: 'PK\u0003\u0004binário' });
    expect(zip.status).toBe(400);
    const broken = await upload(ines, { kind: 'ICS', filename: 'x.ics', content: 'BEGIN:VCALENDAR\nBEGIN:VEVENT' });
    expect(broken.status).toBe(422);
    expect(broken.body.error.code).toBe('INVALID_FILE');
    const huge = await upload(ines, { kind: 'CSV', filename: 'x.csv', content: 'a'.repeat(2_100_000) });
    expect(huge.status).toBe(413);
  });
});

describe('confirmação', () => {
  it('grava apenas os itens confirmados, com as edições do utilizador', async () => {
    const { body: job } = await icsUpload(ines);
    const series = job.items.find((i: { recurrenceRule: string | null }) => i.recurrenceRule);
    const allDay = job.items.find((i: { allDay: boolean }) => i.allDay);
    const res = await request(app)
      .post(`/api/imports/${job.id}/confirm`)
      .set('Cookie', ines)
      .send({
        items: [
          { key: series.key, action: 'create', title: 'PW — Teórica' },
          { key: allDay.key, action: 'skip' },
          // o terceiro item não é enviado → não é importado
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.counts).toMatchObject({ created: 1, skipped: 2 });
    const blocks = await prisma.scheduleBlock.findMany();
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ title: 'PW — Teórica', origin: 'IMPORT_ICS', sourceLabel: 'outlook.ics' });

    const after = await request(app).get(`/api/imports/${job.id}`).set('Cookie', ines);
    expect(after.body.status).toBe('CONFIRMED');
    expect(after.body.items).toEqual([]); // minimização: a pré-visualização é apagada
  });

  it('cancelar não grava dados', async () => {
    const { body: job } = await icsUpload(ines);
    expect((await request(app).delete(`/api/imports/${job.id}`).set('Cookie', ines)).status).toBe(204);
    expect(await prisma.scheduleBlock.count()).toBe(0);
    expect((await request(app).get(`/api/imports/${job.id}`).set('Cookie', ines)).status).toBe(404);
  });

  it('valida os itens editados no servidor', async () => {
    const { body: job } = await icsUpload(ines);
    const res = await request(app)
      .post(`/api/imports/${job.id}/confirm`)
      .set('Cookie', ines)
      .send({
        items: [
          {
            key: job.items[0].key,
            action: 'create',
            startAt: '2026-10-20T10:00:00Z',
            endAt: '2026-10-20T09:00:00Z',
          },
        ],
      });
    expect(res.status).toBe(400);
    expect(await prisma.scheduleBlock.count()).toBe(0);
  });

  it('deteta duplicados ao reimportar o mesmo ficheiro', async () => {
    const { body: first } = await icsUpload(ines);
    await confirmAll(ines, first);
    expect(await prisma.scheduleBlock.count()).toBe(3);

    const { body: second } = await icsUpload(ines);
    expect(second.counts.duplicates).toBe(3);
    expect(second.items.every((i: { action: string }) => i.action === 'skip')).toBe(true);
    expect(second.items[0].duplicate.reason).toBe('external');
    await confirmAll(ines, second);
    expect(await prisma.scheduleBlock.count()).toBe(3);
  });

  it('importa prazos do Moodle como tarefas e associa a disciplina pela categoria', async () => {
    const bd = await request(app)
      .post('/api/disciplines')
      .set('Cookie', ines)
      .send({ name: 'Bases de Dados', code: 'BD' });
    const { body: job } = await icsUpload(ines, 'moodle.ics');
    expect(job.items[0]).toMatchObject({ target: 'task', disciplineId: bd.body.id });
    await confirmAll(ines, job);
    const tasks = await prisma.task.findMany({ where: { origin: 'IMPORT_ICS' } });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ title: 'Entrega do projeto de BD termina', disciplineId: bd.body.id });
  });

  it('exige confirmação do formato quando há datas ambíguas', async () => {
    const csv = fixture('eventos.csv');
    const { body: job } = await upload(ines, { kind: 'CSV', filename: 'eventos.csv', content: csv });
    expect(job.csv.dateFormatAmbiguous).toBe(true);
    const blocked = await confirmAll(ines, job);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('DATE_FORMAT_UNCONFIRMED');

    const { body: chosen } = await upload(ines, {
      kind: 'CSV',
      filename: 'eventos.csv',
      content: csv,
      csv: { dateFormat: 'DMY' },
    });
    const ok = await confirmAll(ines, chosen);
    expect(ok.status).toBe(200);
    expect(ok.body.counts.created).toBe(2); // o Workshop sem hora de fim fica de fora
  });

  it('duas confirmações em simultâneo gravam uma só vez (o CSV não tem identificador por linha)', async () => {
    const { body: job } = await upload(ines, {
      kind: 'CSV',
      filename: 'eventos.csv',
      content: fixture('eventos.csv'),
      csv: { dateFormat: 'DMY' },
    });
    // Barreira: as duas transações só começam quando ambos os pedidos já passaram as verificações iniciais,
    // como acontece com dois separadores ou um pedido repetido pela rede.
    const original = prisma.$transaction.bind(prisma) as (...args: unknown[]) => Promise<unknown>;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let entered = 0;
    const spy = vi.spyOn(prisma, '$transaction').mockImplementation((async (...args: unknown[]) => {
      if (++entered === 2) release();
      await gate;
      return original(...args);
    }) as never);
    try {
      const results = await Promise.all([confirmAll(ines, job), confirmAll(ines, job)]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    } finally {
      spy.mockRestore();
    }
    expect(await prisma.scheduleBlock.count()).toBe(2);
  });

  it('anular uma importação apaga só o que ela criou', async () => {
    await request(app)
      .post('/api/schedule-blocks')
      .set('Cookie', ines)
      .send({ title: 'Manual', startAt: '2026-10-20T10:00:00Z', endAt: '2026-10-20T11:00:00Z' });
    const { body: job } = await icsUpload(ines);
    await confirmAll(ines, job);
    const res = await request(app).delete(`/api/imports/${job.id}/data`).set('Cookie', ines);
    expect(res.body.removed).toBe(3);
    expect(await prisma.scheduleBlock.count()).toBe(1);
  });

  it('pré-visualizações expiradas não podem ser confirmadas (410)', async () => {
    const { body: job } = await icsUpload(ines);
    await prisma.importJob.update({ where: { id: job.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await confirmAll(ines, job)).status).toBe(410);
    expect((await request(app).get(`/api/imports/${job.id}`).set('Cookie', ines)).status).toBe(410);
  });
});

describe('isolamento por utilizador', () => {
  it('outro utilizador não vê, confirma, cancela nem anula a importação (404)', async () => {
    const { body: job } = await icsUpload(ines);
    expect((await request(app).get(`/api/imports/${job.id}`).set('Cookie', rui)).status).toBe(404);
    expect((await confirmAll(rui, job)).status).toBe(404);
    expect((await request(app).delete(`/api/imports/${job.id}`).set('Cookie', rui)).status).toBe(404);
    expect((await request(app).delete(`/api/imports/${job.id}/data`).set('Cookie', rui)).status).toBe(404);
    expect((await request(app).get('/api/imports').set('Cookie', rui)).body).toEqual([]);
  });

  it('aulas de um utilizador não aparecem nem podem ser alteradas por outro', async () => {
    const { body: block } = await request(app)
      .post('/api/schedule-blocks')
      .set('Cookie', ines)
      .send({ title: 'Aula', startAt: '2026-10-20T10:00:00Z', endAt: '2026-10-20T11:00:00Z' });
    const range = 'from=2026-10-19T00:00:00Z&to=2026-10-26T00:00:00Z';
    expect((await request(app).get(`/api/schedule-blocks?${range}`).set('Cookie', rui)).body).toEqual([]);
    expect(
      (await request(app).patch(`/api/schedule-blocks/${block.id}`).set('Cookie', rui).send({ title: 'x' })).status,
    ).toBe(404);
    expect((await request(app).delete(`/api/schedule-blocks/${block.id}`).set('Cookie', rui)).status).toBe(404);
  });
});

describe('calendário com aulas (spec §7.5)', () => {
  it('mostra ocorrências da série em hora local, com origem e conflitos', async () => {
    const { body: job } = await icsUpload(ines);
    await confirmAll(ines, job);
    await request(app)
      .post('/api/schedule-blocks')
      .set('Cookie', ines)
      .send({ title: 'Reunião', kind: 'EVENT', startAt: '2026-10-26T10:30:00Z', endAt: '2026-10-26T11:30:00Z' });

    const res = await request(app)
      .get('/api/calendar?from=2026-10-19T00:00:00Z&to=2026-11-10T00:00:00Z')
      .set('Cookie', ines);
    const pw = res.body.blocks.filter((b: { title: string }) => b.title === 'Programação Web (T)');
    expect(pw.map((b: { start: string }) => b.start)).toEqual([
      '2026-10-19T09:00:00.000Z',
      '2026-10-26T10:00:00.000Z',
      // 02/11 é exceção; 09/11 foi substituída pela ocorrência alterada
    ]);
    expect(pw[0]).toMatchObject({ origin: 'IMPORT_ICS', sourceLabel: 'outlook.ics', recurring: true });
    const reuniao = res.body.blocks.find((b: { title: string }) => b.title === 'Reunião');
    expect(reuniao.conflict).toBe(true);
    expect(pw[1].conflict).toBe(true);
    expect(pw[0].conflict).toBe(false);
  });

  it('aulas manuais semanais e cancelamento de uma ocorrência', async () => {
    const { body: block } = await request(app).post('/api/schedule-blocks').set('Cookie', ines).send({
      title: 'BD prática',
      startAt: '2026-10-21T13:30:00Z',
      endAt: '2026-10-21T15:30:00Z',
      repeatWeeklyUntil: '2026-11-11',
    });
    expect(block.recurrenceRule).toMatch(/^FREQ=WEEKLY;UNTIL=/);
    const skip = await request(app)
      .post(`/api/schedule-blocks/${block.id}/skip`)
      .set('Cookie', ines)
      .send({ occurrenceStart: '2026-10-28T14:30:00.000Z' });
    expect(skip.status).toBe(200);
    const occ = await request(app)
      .get('/api/schedule-blocks?from=2026-10-19T00:00:00Z&to=2026-11-30T00:00:00Z')
      .set('Cookie', ines);
    expect(occ.body.map((o: { start: string }) => o.start)).toEqual([
      '2026-10-21T13:30:00.000Z',
      '2026-11-04T14:30:00.000Z',
      '2026-11-11T14:30:00.000Z',
    ]);
  });

  it('a exportação de dados inclui aulas e importações', async () => {
    const { body: job } = await icsUpload(ines);
    await confirmAll(ines, job);
    const res = await request(app).get('/api/me/export').set('Cookie', ines);
    expect(res.body.scheduleBlocks).toHaveLength(3);
    expect(res.body.importJobs).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toMatch(/tokenHash|passwordHash/);
  });
});
