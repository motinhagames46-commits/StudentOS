// Dados de demonstração (secção 10.3). Credenciais da conta de teste:
//   email: demo@studentos.test   palavra-passe: demo-studentos-2026
import bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { semesterFor } from '@studentos/shared';
import { PrismaClient } from '../src/generated/prisma/client.js';
import 'dotenv/config';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const DAY = 24 * 60 * 60 * 1000;
const inDays = (n: number, hour = 23, minute = 59) => {
  const d = new Date(Date.now() + n * DAY);
  d.setHours(hour, minute, 0, 0);
  return d;
};

async function main() {
  await prisma.user.deleteMany({ where: { email: 'demo@studentos.test' } });

  const user = await prisma.user.create({
    data: {
      name: 'Estudante Demo',
      email: 'demo@studentos.test',
      passwordHash: await bcrypt.hash('demo-studentos-2026', 12),
      semesters: { create: { ...semesterFor(new Date()), isActive: true } },
    },
    include: { semesters: true },
  });
  const semesterId = user.semesters[0]!.id;

  const disc = (name: string, code: string, ects: number, color: string) =>
    prisma.discipline.create({ data: { name, code, ects, color, userId: user.id, semesterId } });

  const pw = await disc('Programação Web', 'PW', 6, '#2563EB');
  const bd = await disc('Bases de Dados', 'BD', 6, '#16A34A');
  const es = await disc('Engenharia de Software', 'ES', 5, '#9333EA');
  const mat = await disc('Matemática Aplicada', 'MAT', 4, '#EA580C');
  await disc('Redes de Computadores', 'RC', 5, '#0891B2');

  // Exemplo da secção 4.1 da especificação
  await prisma.assessment.createMany({
    data: [
      { disciplineId: pw.id, name: 'Teste 1', type: 'TEST', weight: 30, score: 12, date: inDays(-30, 10, 0) },
      {
        disciplineId: pw.id,
        name: 'Trabalho prático',
        type: 'PROJECT',
        weight: 30,
        score: 15,
        date: inDays(-10, 23, 59),
      },
      {
        disciplineId: pw.id,
        name: 'Exame',
        type: 'EXAM',
        weight: 40,
        minScore: 8,
        date: inDays(12, 9, 30),
        prepMinutes: 360,
      },
      { disciplineId: bd.id, name: 'Mini-teste', type: 'TEST', weight: 20, score: 16.5, date: inDays(-20, 14, 0) },
      { disciplineId: bd.id, name: 'Projeto', type: 'PROJECT', weight: 40, date: inDays(5, 23, 59), prepMinutes: 240 },
      { disciplineId: bd.id, name: 'Teste final', type: 'TEST', weight: 40, minScore: 7.5, date: inDays(20, 10, 0) },
      { disciplineId: es.id, name: 'Relatório', type: 'ASSIGNMENT', weight: 50, score: 14 },
      { disciplineId: es.id, name: 'Apresentação', type: 'PRESENTATION', weight: 50, score: 17 },
      { disciplineId: mat.id, name: 'Teste 1', type: 'TEST', weight: 50, score: 8.5, date: inDays(-15, 9, 0) },
      { disciplineId: mat.id, name: 'Teste 2', type: 'TEST', weight: 50, date: inDays(3, 9, 0), prepMinutes: 180 },
    ],
  });

  await prisma.task.createMany({
    data: [
      {
        userId: user.id,
        disciplineId: pw.id,
        title: 'Rever capítulo de React hooks',
        dueDate: inDays(1),
        priority: 'MEDIUM',
      },
      {
        userId: user.id,
        disciplineId: bd.id,
        title: 'Modelo ER do projeto',
        dueDate: inDays(3),
        priority: 'HIGH',
        estimatedMinutes: 120,
      },
      {
        userId: user.id,
        disciplineId: mat.id,
        title: 'Exercícios da ficha 4',
        dueDate: inDays(2),
        priority: 'HIGH',
        estimatedMinutes: 90,
      },
      {
        userId: user.id,
        disciplineId: es.id,
        title: 'Preparar retrospetiva do sprint',
        dueDate: inDays(10),
        priority: 'LOW',
      },
      {
        userId: user.id,
        disciplineId: pw.id,
        title: 'Entregar exercício de formulários',
        dueDate: inDays(-1),
        priority: 'HIGH',
      },
      { userId: user.id, title: 'Renovar cartão de estudante', priority: 'LOW' },
      {
        userId: user.id,
        disciplineId: bd.id,
        title: 'Instalar PostgreSQL',
        status: 'DONE',
        completedAt: inDays(-5, 18, 0),
        dueDate: inDays(-4),
      },
    ],
  });

  // Sessões de estudo dos últimos 12 dias (alimentam as estatísticas, RF14)
  const session = (daysAgo: number, hour: number, minutes: number, disciplineId: number | null) => {
    const startedAt = inDays(-daysAgo, hour, 0);
    return { userId: user.id, disciplineId, startedAt, endedAt: new Date(startedAt.getTime() + minutes * 60000) };
  };
  await prisma.studySession.createMany({
    data: [
      session(0, 9, 50, bd.id),
      session(1, 14, 90, pw.id),
      session(1, 21, 25, mat.id),
      session(2, 10, 45, mat.id),
      session(3, 18, 120, bd.id),
      session(4, 16, 35, null),
      session(5, 11, 60, pw.id),
      session(6, 15, 40, es.id),
      session(8, 10, 75, pw.id),
      session(9, 20, 30, mat.id),
      session(11, 14, 55, bd.id),
    ],
  });

  // Disponibilidade de exemplo para o plano de estudo: dias úteis 18:00–21:00 e sábado 10:00–13:00
  await prisma.studyPreferences.create({ data: { userId: user.id } });
  await prisma.availabilityRule.createMany({
    data: [
      ...[1, 2, 3, 4, 5].map((weekday) => ({ userId: user.id, weekday, startMinute: 18 * 60, endMinute: 21 * 60 })),
      { userId: user.id, weekday: 6, startMinute: 10 * 60, endMinute: 13 * 60 },
    ],
  });

  console.log('Seed concluído: demo@studentos.test / demo-studentos-2026');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
