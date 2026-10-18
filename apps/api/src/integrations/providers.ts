// Fornecedores Moodle/Outlook. Sem autorização institucional não existe fornecedor real:
// o estado é NOT_CONFIGURED e a alternativa é a importação de .ics (spec §9.6, CLAUDE.md).
import {
  IntegrationNotConfiguredError,
  type CalendarProvider,
  type ConnectionCheck,
  type DateRange,
  type MoodleProvider,
  type NormalizedAcademicTask,
  type NormalizedCalendarEvent,
  type NormalizedDiscipline,
} from './types.js';

const notConfigured: ConnectionCheck = { ok: false, status: 'NOT_CONFIGURED', capabilities: [] };

export class NotConfiguredMoodleProvider implements MoodleProvider {
  readonly kind = 'not-configured' as const;
  async checkConnection() {
    return notConfigured;
  }
  async getCourses(): Promise<NormalizedDiscipline[]> {
    throw new IntegrationNotConfiguredError('Moodle');
  }
  async getActivities(): Promise<NormalizedAcademicTask[]> {
    throw new IntegrationNotConfiguredError('Moodle');
  }
  async getCalendarEvents(): Promise<NormalizedCalendarEvent[]> {
    throw new IntegrationNotConfiguredError('Moodle');
  }
}

export class NotConfiguredCalendarProvider implements CalendarProvider {
  readonly kind = 'not-configured' as const;
  async checkConnection() {
    return notConfigured;
  }
  async getEvents(): Promise<NormalizedCalendarEvent[]> {
    throw new IntegrationNotConfiguredError('Outlook');
  }
}

/**
 * Fornecedor SIMULADO, apenas para testes automáticos do contrato. Nunca é usado fora de
 * NODE_ENV=test e nunca reporta CONNECTED: o estado simulado é sempre identificado como tal.
 */
export class MockMoodleProvider implements MoodleProvider {
  readonly kind = 'mock' as const;
  constructor(
    private readonly data: {
      courses: NormalizedDiscipline[];
      activities: NormalizedAcademicTask[];
      events: NormalizedCalendarEvent[];
    },
  ) {}
  async checkConnection(): Promise<ConnectionCheck> {
    return { ok: true, status: 'NOT_CONFIGURED', capabilities: ['mock:courses', 'mock:activities', 'mock:calendar'] };
  }
  async getCourses() {
    return this.data.courses;
  }
  async getActivities(range: DateRange) {
    return this.data.activities.filter((a) => !a.dueAt || (a.dueAt >= range.from && a.dueAt < range.to));
  }
  async getCalendarEvents(range: DateRange) {
    return this.data.events.filter((e) => e.startAt < range.to && e.endAt > range.from);
  }
}

export interface IntegrationEnv {
  NODE_ENV: string;
  MOODLE_INTEGRATION_MODE?: string;
}

/** Só devolve o mock em testes; em desenvolvimento e produção, sem fornecedor real, é NOT_CONFIGURED. */
export function createMoodleProvider(
  env: IntegrationEnv,
  mockData?: ConstructorParameters<typeof MockMoodleProvider>[0],
): MoodleProvider {
  if (env.MOODLE_INTEGRATION_MODE === 'mock' && env.NODE_ENV === 'test' && mockData) {
    return new MockMoodleProvider(mockData);
  }
  return new NotConfiguredMoodleProvider();
}

export function createOutlookProvider(): CalendarProvider {
  return new NotConfiguredCalendarProvider();
}
