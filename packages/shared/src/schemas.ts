// Esquemas de validação partilhados entre o frontend e a API (secção 11 e 12.3 da especificação).
import { z } from 'zod';

export const assessmentTypes = ['TEST', 'EXAM', 'PROJECT', 'ASSIGNMENT', 'PRESENTATION', 'OTHER'] as const;
export const taskPriorities = ['LOW', 'MEDIUM', 'HIGH'] as const;
export const taskStatuses = ['TODO', 'DONE'] as const;

export type AssessmentType = (typeof assessmentTypes)[number];
export type TaskPriority = (typeof taskPriorities)[number];
export type TaskStatus = (typeof taskStatuses)[number];

export const MIN_PASSWORD_LENGTH = 12;

const grade = z.number('Indica um número').min(0, 'A nota mínima é 0').max(20, 'A nota máxima é 20');
const isoDate = z.iso.datetime({ error: 'Data inválida' });
const positiveId = z.number().int().positive();

export const emailSchema = z.string('Indica o email').trim().toLowerCase().pipe(z.email('Email inválido').max(254));

export const registerSchema = z.strictObject({
  name: z.string('Indica o nome').trim().min(2, 'O nome deve ter pelo menos 2 caracteres').max(80),
  email: emailSchema,
  password: z
    .string('Indica a palavra-passe')
    .min(MIN_PASSWORD_LENGTH, `A palavra-passe deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres`)
    .max(200, 'A palavra-passe é demasiado longa'),
});

export const loginSchema = z.strictObject({
  email: emailSchema,
  password: z.string('Indica a palavra-passe').min(1, 'Indica a palavra-passe').max(200),
});

export const deleteAccountSchema = z.strictObject({ confirmEmail: emailSchema });

export const semesterCreateSchema = z
  .strictObject({
    label: z.string('Indica o nome do semestre').trim().min(1, 'Indica o nome do semestre').max(60),
    startDate: isoDate,
    endDate: isoDate,
    isActive: z.boolean().optional(),
  })
  .refine((d) => d.endDate > d.startDate, {
    message: 'A data de fim tem de ser posterior à de início',
    path: ['endDate'],
  });

export const semesterUpdateSchema = z.strictObject({
  label: z.string().trim().min(1).max(60).optional(),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  isActive: z.boolean().optional(),
});

export const disciplineCreateSchema = z.strictObject({
  name: z.string('Indica o nome').trim().min(1, 'Indica o nome').max(100),
  code: z.string('Indica a sigla').trim().min(1, 'Indica a sigla').max(12, 'Máximo 12 caracteres').toUpperCase(),
  ects: z.number().int('Os ECTS são um número inteiro').min(1).max(60).nullable().optional(),
  passingGrade: grade.optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida')
    .nullable()
    .optional(),
  semesterId: positiveId.nullable().optional(),
});
export const disciplineUpdateSchema = disciplineCreateSchema.partial();

export const assessmentCreateSchema = z.strictObject({
  name: z.string('Indica o nome').trim().min(1, 'Indica o nome').max(100),
  type: z.enum(assessmentTypes).optional(),
  weight: z.number('Indica o peso').gt(0, 'O peso tem de ser maior que 0').max(100, 'O peso não pode exceder 100%'),
  date: isoDate.nullable().optional(),
  score: grade.nullable().optional(),
  minScore: grade.nullable().optional(),
});
export const assessmentUpdateSchema = assessmentCreateSchema.partial();

export const taskCreateSchema = z.strictObject({
  title: z.string('Indica o título').trim().min(1, 'Indica o título').max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  dueDate: isoDate.nullable().optional(),
  priority: z.enum(taskPriorities).optional(),
  disciplineId: positiveId.nullable().optional(),
});
export const taskUpdateSchema = taskCreateSchema.partial().extend({
  status: z.enum(taskStatuses).optional(),
});

export const taskQuerySchema = z.object({
  status: z.enum(taskStatuses).optional(),
  disciplineId: z.coerce.number().int().positive().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  sort: z.enum(['dueDate', 'priority', 'createdAt']).optional(),
});

// RF13 / RN11 — sessões de estudo
export const studySessionStartSchema = z.strictObject({
  disciplineId: positiveId.nullable().optional(),
});

export const studySessionStopSchema = z.strictObject({
  notes: z.string().trim().max(1000, 'Máximo 1000 caracteres').nullable().optional(),
});

export const studySessionQuerySchema = z
  .object({
    from: isoDate.optional(),
    to: isoDate.optional(),
  })
  .refine((q) => !q.from || !q.to || q.to >= q.from, {
    message: 'A data de fim tem de ser posterior à de início',
    path: ['to'],
  });

// Aulas e eventos (spec §6.1 ScheduleBlock)
export const blockKinds = ['CLASS', 'EVENT', 'OTHER'] as const;
export type BlockKind = (typeof blockKinds)[number];

export const scheduleBlockCreateSchema = z
  .strictObject({
    title: z.string('Indica o título').trim().min(1, 'Indica o título').max(200),
    kind: z.enum(blockKinds).optional(),
    location: z.string().trim().max(200).nullable().optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    startAt: isoDate,
    endAt: isoDate,
    isBusy: z.boolean().optional(),
    disciplineId: positiveId.nullable().optional(),
    /** Repetir semanalmente até esta data (inclusive), em hora local. */
    repeatWeeklyUntil: z.iso.date({ error: 'Data inválida' }).nullable().optional(),
  })
  .refine((b) => b.endAt > b.startAt, { message: 'O fim tem de ser depois do início', path: ['endAt'] })
  .refine((b) => !b.repeatWeeklyUntil || b.repeatWeeklyUntil >= b.startAt.slice(0, 10), {
    message: 'A repetição tem de terminar depois do início',
    path: ['repeatWeeklyUntil'],
  });

export const scheduleBlockUpdateSchema = z.strictObject({
  title: z.string().trim().min(1).max(200).optional(),
  kind: z.enum(blockKinds).optional(),
  location: z.string().trim().max(200).nullable().optional(),
  isBusy: z.boolean().optional(),
  disciplineId: positiveId.nullable().optional(),
});

export const skipOccurrenceSchema = z.strictObject({ occurrenceStart: isoDate });

// Importação (spec §8): o ficheiro é enviado como texto, validado e convertido em pré-visualização.
export const MAX_IMPORT_BYTES = 1_000_000;
export const importKinds = ['ICS', 'CSV'] as const;
export const csvFields = [
  'title',
  'date',
  'startTime',
  'endTime',
  'weekday',
  'location',
  'discipline',
  'recurrence',
  'description',
  'ignore',
] as const;
export type CsvField = (typeof csvFields)[number];
export const dateFormats = ['DMY', 'MDY', 'YMD'] as const;
export type DateFormat = (typeof dateFormats)[number];

export const importCreateSchema = z.strictObject({
  kind: z.enum(importKinds),
  filename: z.string().trim().min(1).max(255),
  content: z.string().min(1, 'O ficheiro está vazio').max(MAX_IMPORT_BYTES, 'O ficheiro excede 1 MB'),
  csv: z
    .strictObject({
      mapping: z.record(z.string().max(200), z.enum(csvFields)).optional(),
      dateFormat: z.enum(dateFormats).optional(),
      validFrom: z.iso.date().optional(),
      validUntil: z.iso.date().optional(),
    })
    .optional(),
});

export const importItemEditSchema = z.strictObject({
  key: z.string().max(20),
  action: z.enum(['create', 'update', 'skip']),
  target: z.enum(['block', 'task']).optional(),
  title: z.string().trim().min(1, 'Indica o título').max(200).optional(),
  kind: z.enum(blockKinds).optional(),
  startAt: isoDate.optional(),
  endAt: isoDate.optional(),
  location: z.string().trim().max(200).nullable().optional(),
  disciplineId: positiveId.nullable().optional(),
  isBusy: z.boolean().optional(),
});

export const importConfirmSchema = z.strictObject({
  items: z.array(importItemEditSchema).max(2000),
});

export type ScheduleBlockCreateInput = z.infer<typeof scheduleBlockCreateSchema>;
export type ScheduleBlockUpdateInput = z.infer<typeof scheduleBlockUpdateSchema>;
export type ImportCreateInput = z.infer<typeof importCreateSchema>;
export type ImportItemEdit = z.infer<typeof importItemEditSchema>;

// RF14 — estatísticas dos últimos N dias
export const statsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).optional(),
});

// RF15 — calendário: intervalo obrigatório, no máximo 62 dias (um mês com margem)
const MAX_CALENDAR_SPAN = 62 * 24 * 60 * 60 * 1000;
export const calendarQuerySchema = z
  .object({ from: isoDate, to: isoDate })
  .refine((q) => q.to > q.from, { message: 'A data de fim tem de ser posterior à de início', path: ['to'] })
  .refine((q) => new Date(q.to).getTime() - new Date(q.from).getTime() <= MAX_CALENDAR_SPAN, {
    message: 'O intervalo não pode exceder 62 dias',
    path: ['to'],
  });

export const gradesQuerySchema = z.object({
  target: z.coerce.number().min(0).max(20).optional(),
});

export const idParamSchema = z.coerce.number().int().positive();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type DisciplineCreateInput = z.infer<typeof disciplineCreateSchema>;
export type DisciplineUpdateInput = z.infer<typeof disciplineUpdateSchema>;
export type AssessmentCreateInput = z.infer<typeof assessmentCreateSchema>;
export type AssessmentUpdateInput = z.infer<typeof assessmentUpdateSchema>;
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;
export type TaskQuery = z.infer<typeof taskQuerySchema>;
export type SemesterCreateInput = z.infer<typeof semesterCreateSchema>;
export type SemesterUpdateInput = z.infer<typeof semesterUpdateSchema>;
export type StudySessionStartInput = z.infer<typeof studySessionStartSchema>;
export type StudySessionStopInput = z.infer<typeof studySessionStopSchema>;
export type StudySessionQuery = z.infer<typeof studySessionQuerySchema>;
export type StatsQuery = z.infer<typeof statsQuerySchema>;
export type CalendarQuery = z.infer<typeof calendarQuerySchema>;
