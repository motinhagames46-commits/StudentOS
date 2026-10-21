// «Colar ficha da UC»: texto de uma ficha de unidade curricular → proposta de avaliações, ou falha.
// O parser determinístico e, só se o resultado o justificar, um serviço de IA externo são implementações
// deste contrato. A medição está em scripts/eval-fichas e o conjunto em test/fixtures/fichas-uc.
import type { AssessmentType } from '@studentos/shared';

/** Avaliação proposta a partir da ficha. As fichas não têm datas, por isso nunca se propõe uma. */
export interface ProposedAssessment {
  name: string;
  type: AssessmentType;
  /** Peso global na nota final, em %. As avaliações de uma proposta somam 100. */
  weight: number;
  /** Nota mínima desse elemento, só quando a ficha a indica. */
  minScore: number | null;
}

export type FichaExtraction =
  | {
      ok: true;
      /** Avaliação no período letivo: é a proposta que o estudante revê e confirma. */
      assessments: ProposedAssessment[];
      /** Regime das épocas de exame, quando a ficha o descreve. */
      examRegime: ProposedAssessment[] | null;
      /** Ambiguidades e regras que o StudentOS não guarda, para mostrar ao estudante. */
      notes: string[];
    }
  | {
      ok: false;
      reason: 'SEM_PROGRAMA' | 'NAO_RECONHECIDA' | 'AMBIGUA' | 'NAO_IMPLEMENTADO';
      message: string;
    };

export interface FichaExtractor {
  readonly name: string;
  extract(text: string): Promise<FichaExtraction>;
}
