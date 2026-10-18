import type { ImportItem } from '@studentos/shared';

/** Item produzido por um parser, antes da deteção de duplicados e da escolha da ação. */
export type RawImportItem = Omit<ImportItem, 'key' | 'duplicate' | 'action'>;
