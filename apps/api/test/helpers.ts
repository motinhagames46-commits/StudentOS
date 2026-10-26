import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

export const PASSWORD = 'uma-palavra-passe-segura';

export async function resetDb() {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "User" RESTART IDENTITY CASCADE');
}

/** Regista um utilizador e devolve o cookie de sessão. */
export async function registerUser(name: string) {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name, email: `${name}@exemplo.pt`, password: PASSWORD, acceptTerms: true });
  if (res.status !== 201) throw new Error(`Registo falhou: ${res.status} ${JSON.stringify(res.body)}`);
  const cookie = res.headers['set-cookie'] as unknown as string[];
  return { cookie, user: res.body.user as { id: number; email: string } };
}

/** Regista um utilizador com uma disciplina. */
export async function createUserAndLogin(name: string) {
  const { cookie, user } = await registerUser(name);
  const res = await request(app)
    .post('/api/disciplines')
    .set('Cookie', cookie)
    .send({ name: 'Programação Web', code: 'PW', ects: 6 });
  return { cookie, user, disciplineId: res.body.id as number };
}
