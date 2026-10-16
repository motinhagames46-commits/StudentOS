// Verificações de posse (RN10). Recursos de outro utilizador devolvem 404, como se não existissem.
import { notFound } from './http.js';
import { prisma } from './prisma.js';

export async function findOwnedDiscipline(userId: number, id: number) {
  const discipline = await prisma.discipline.findFirst({ where: { id, userId } });
  if (!discipline) throw notFound('DISCIPLINE_NOT_FOUND', 'Disciplina não encontrada');
  return discipline;
}

export async function findOwnedSemester(userId: number, id: number) {
  const semester = await prisma.semester.findFirst({ where: { id, userId } });
  if (!semester) throw notFound('SEMESTER_NOT_FOUND', 'Semestre não encontrado');
  return semester;
}

export async function findOwnedAssessment(userId: number, id: number) {
  const assessment = await prisma.assessment.findFirst({
    where: { id, discipline: { userId } },
  });
  if (!assessment) throw notFound('ASSESSMENT_NOT_FOUND', 'Avaliação não encontrada');
  return assessment;
}

export async function findOwnedTask(userId: number, id: number) {
  const task = await prisma.task.findFirst({ where: { id, userId } });
  if (!task) throw notFound('TASK_NOT_FOUND', 'Tarefa não encontrada');
  return task;
}

export async function findOwnedStudySession(userId: number, id: number) {
  const session = await prisma.studySession.findFirst({ where: { id, userId } });
  if (!session) throw notFound('STUDY_SESSION_NOT_FOUND', 'Sessão de estudo não encontrada');
  return session;
}
