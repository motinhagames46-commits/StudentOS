// Tipos da pré-visualização de importação (spec §8.2), partilhados entre a API e a interface.
import type { BlockKind, CsvField, DateFormat } from './schemas.js';

export type ImportTarget = 'block' | 'task';
export type ImportAction = 'create' | 'update' | 'skip';

export interface ImportIssue {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ImportDuplicate {
  /** external = mesmo UID já importado; fingerprint = mesmo título e horário; file = repetido no ficheiro */
  reason: 'external' | 'fingerprint' | 'file';
  existingId: number | null;
  label: string;
}

/** Item normalizado, pronto a rever. Nunca contém valores inventados: campos em falta ficam null com erro. */
export interface ImportItem {
  key: string;
  target: ImportTarget;
  title: string;
  kind: BlockKind;
  startAt: string | null;
  endAt: string | null;
  allDay: boolean;
  timezone: string;
  location: string | null;
  description: string | null;
  recurrenceRule: string | null;
  recurrenceSummary: string | null;
  exceptionDates: string[];
  seriesEndAt: string | null;
  externalId: string | null;
  isBusy: boolean;
  disciplineId: number | null;
  disciplineLabel: string | null;
  issues: ImportIssue[];
  duplicate: ImportDuplicate | null;
  action: ImportAction;
}

export interface CsvPreviewOptions {
  headers: string[];
  mapping: Record<string, CsvField>;
  dateFormat: DateFormat;
  dateFormatAmbiguous: boolean;
  validFrom: string | null;
  validUntil: string | null;
  missingFields: CsvField[];
}

export interface ImportJobView {
  id: string;
  kind: 'ICS' | 'CSV';
  status: 'NEEDS_REVIEW' | 'CONFIRMED' | 'FAILED' | 'EXPIRED';
  originalFilename: string;
  createdAt: string;
  expiresAt: string;
  confirmedAt: string | null;
  items: ImportItem[];
  warnings: string[];
  counts: ImportCounts | null;
  csv: CsvPreviewOptions | null;
}

export interface ImportCounts {
  total?: number;
  ready?: number;
  duplicates?: number;
  errors?: number;
  created?: number;
  updated?: number;
  skipped?: number;
  failed?: number;
  removed?: number;
}
