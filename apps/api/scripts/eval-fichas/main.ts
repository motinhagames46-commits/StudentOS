// Mede um extrator «ficha da UC → avaliações» contra o conjunto de avaliação (test/fixtures/fichas-uc).
// Uso: npm run eval:fichas [-- --extrator=vazio] [-- --retidas]
// Por omissão corre só as fichas de afinação. As retidas são para a medição final: correr com --retidas
// durante o desenvolvimento estraga a medição (o extrator passaria a ser afinado contra elas).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import type { FichaExtractor } from '../../src/lib/fichas-uc/extractor.js';
import { checkThreshold, scoreCase, tally, type CaseScore, type Dataset, type DatasetCase } from './score.js';

const fixtures = new URL('../../test/fixtures/fichas-uc/', import.meta.url);
const cache = new URL('.cache/', fixtures);

/** Linha de base: não reconhece nada. Mostra o ponto de partida antes de haver parser ou IA. */
const extratorVazio: FichaExtractor = {
  name: 'vazio',
  extract: async () => ({ ok: false, reason: 'NAO_IMPLEMENTADO', message: 'Extrator vazio (linha de base)' }),
};

const extractors: Record<string, FichaExtractor> = { vazio: extratorVazio };

const args = process.argv.slice(2);
const includeHeldOut = args.includes('--retidas');
const extractorName = args.find((a) => a.startsWith('--extrator='))?.split('=')[1] ?? 'vazio';
const extractor = extractors[extractorName];
if (!extractor) {
  console.error(`Extrator desconhecido: ${extractorName}. Disponíveis: ${Object.keys(extractors).join(', ')}`);
  process.exit(1);
}

const pct = (hit: number, total: number) => (total === 0 ? '—' : `${Math.round((hit / total) * 100)} %`);
const outcomeLabel = { certo: 'certo', errado: 'ERRADO', recusado: 'recusado' } as const;

for (const file of readdirSync(fixtures).filter((f) => f.endsWith('.json'))) {
  const dataset = JSON.parse(readFileSync(new URL(file, fixtures), 'utf8')) as Dataset;
  const cases = dataset.cases.filter((c) => includeHeldOut || c.split === 'afinacao');
  const missing = cases.filter((c) => !existsSync(new URL(`${c.id}.txt`, cache)));
  if (missing.length > 0) {
    console.error(`Faltam os textos de ${missing.length} ficha(s). Corre primeiro: node scripts/fetch-fichas-uc.mjs`);
    process.exit(1);
  }

  const rows: { case: DatasetCase; score: CaseScore }[] = [];
  for (const c of cases) {
    const text = readFileSync(new URL(`${c.id}.txt`, cache), 'utf8');
    rows.push({ case: c, score: scoreCase(c.expected?.assessments ?? null, await extractor.extract(text)) });
  }

  console.log(`\n${file} · extrator «${extractor.name}» · ${includeHeldOut ? 'afinação + retidas' : 'só afinação'}\n`);
  console.log(
    ['Caso'.padEnd(46), 'Divisão'.padEnd(9), 'Dific.'.padEnd(9), 'Resultado'.padEnd(10), 'Pesos', 'Mín.', 'Tipos'].join(
      ' ',
    ),
  );
  for (const { case: c, score: s } of rows) {
    const field = (hit: number) => `${hit}/${s.expected}`.padEnd(5);
    console.log(
      [
        c.id.padEnd(46),
        c.split.padEnd(9),
        c.difficulty.padEnd(9),
        outcomeLabel[s.outcome].padEnd(10),
        field(s.weights),
        field(s.minScores),
        field(s.types),
        s.dates > 0 ? `· ${s.dates} data(s) inventada(s)` : '',
      ].join(' '),
    );
  }

  for (const split of ['afinacao', 'retida'] as const) {
    const t = tally(rows.filter((r) => r.case.split === split).map((r) => r.score));
    if (t.cases === 0) continue;
    console.log(
      `\n${split === 'afinacao' ? 'Afinação' : 'Retidas'}: ${t.certo}/${t.cases} certos · ${t.errado} errados · ${t.recusado} recusados` +
        ` · pesos ${pct(t.weights, t.expected)} · mínimos ${pct(t.minScores, t.expected)} · tipos ${pct(t.types, t.expected)}`,
    );
  }

  if (includeHeldOut) {
    const verdict = checkThreshold(dataset.evaluation.threshold, rows);
    console.log(`\nLimiar (fixado a priori): ${verdict.passes ? 'PASSA' : 'NÃO PASSA'}`);
    for (const reason of verdict.reasons) console.log(`  - ${reason}`);
  } else {
    console.log('\nAs retidas não foram corridas. Usa --retidas só na medição final.');
  }
}
