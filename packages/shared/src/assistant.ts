// Assistente sobre os documentos do estudante: pergunta → excertos mais próximos → resposta com fontes.
// Quando os documentos não chegam, a web (Google Search) só é usada a pedido, e a resposta é marcada como tal.
import { z } from 'zod';

export const assistantAskSchema = z.strictObject({
  question: z
    .string('Escreve a pergunta')
    .trim()
    .min(1, 'Escreve a pergunta')
    .max(1000, 'A pergunta é demasiado longa (máximo 1000 caracteres)'),
  disciplineId: z.number().int().positive().nullable().optional(),
  /** Últimas mensagens da conversa (ficam só no browser; o servidor não as guarda). */
  history: z
    .array(z.strictObject({ role: z.enum(['user', 'assistant']), text: z.string().max(4000) }))
    .max(10)
    .optional(),
  /** «Pensar melhor»: a mesma pergunta com raciocínio alto (mais cuidadosa, mais lenta). */
  deep: z.boolean().optional(),
  /** «Procurar na web»: a pergunta vai para a Pesquisa Google em vez dos documentos (só a pedido). */
  web: z.boolean().optional(),
});

export type AssistantAskInput = z.infer<typeof assistantAskSchema>;

export type AssistantSource =
  | { kind: 'document'; n: number; documentId: number; title: string; excerpt: string }
  | { kind: 'web'; n: number; title: string; url: string };

export interface AssistantAnswer {
  /** `insufficient`: os documentos não chegam; a página oferece «Procurar na web». */
  mode: 'documents' | 'web' | 'insufficient';
  answer: string;
  sources: AssistantSource[];
  /** Sugestões de pesquisa da Google: os termos obrigam a mostrá-las, sem alterar, com a resposta da web. */
  searchSuggestionsHtml: string | null;
}
