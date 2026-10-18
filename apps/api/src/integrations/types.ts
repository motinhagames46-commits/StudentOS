// Contratos internos das integrações externas (spec §9.5, §10). A aplicação depende destes tipos,
// nunca de chamadas Moodle/Graph dispersas. Nesta versão não há fornecedor real configurado.

export type IntegrationStatus =
  'NOT_CONFIGURED' | 'PENDING_AUTHORIZATION' | 'CONNECTED' | 'SYNCING' | 'ERROR' | 'REAUTH_REQUIRED';

export interface DateRange {
  from: Date;
  to: Date;
}

export interface NormalizedDiscipline {
  externalId: string;
  name: string;
  code: string | null;
}

export interface NormalizedAcademicTask {
  externalId: string;
  title: string;
  dueAt: Date | null;
  courseExternalId: string | null;
}

export interface NormalizedCalendarEvent {
  externalId: string;
  title: string;
  startAt: Date;
  endAt: Date;
  isBusy: boolean;
  location: string | null;
}

export interface ConnectionCheck {
  ok: boolean;
  status: IntegrationStatus;
  capabilities: string[];
}

export interface MoodleProvider {
  readonly kind: 'not-configured' | 'mock' | 'real';
  checkConnection(): Promise<ConnectionCheck>;
  getCourses(): Promise<NormalizedDiscipline[]>;
  getActivities(range: DateRange): Promise<NormalizedAcademicTask[]>;
  getCalendarEvents(range: DateRange): Promise<NormalizedCalendarEvent[]>;
}

export interface CalendarProvider {
  readonly kind: 'not-configured' | 'mock' | 'real';
  checkConnection(): Promise<ConnectionCheck>;
  getEvents(range: DateRange): Promise<NormalizedCalendarEvent[]>;
}

export class IntegrationNotConfiguredError extends Error {
  constructor(provider: string) {
    super(`${provider}: integração não configurada`);
  }
}
