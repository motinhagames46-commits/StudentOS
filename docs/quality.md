# Qualidade

## Comandos

| Comando                              | O que prova                                                                                                                                                                                  | Quando                                                             |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `npm run typecheck`                  | TypeScript `strict` em todos os pacotes e nos E2E (gera o cliente Prisma)                                                                                                                    | sempre                                                             |
| `npm run lint`                       | ESLint (recomendado + typescript-eslint + react-hooks) e as regras do toolkit (`quality/*`)                                                                                                  | sempre                                                             |
| `npm run lint:typed`                 | Promessas esquecidas e mal usadas, com informação de tipos (`eslint.typed.config.js`)                                                                                                        | antes de cada push; ~4 s, ~1,3 GB de memória (medido a 2026-10-24) |
| `npm run lint:rules`                 | Auto-teste das regras copiadas do toolkit (`eslint-rules/`, RuleTester do ESLint)                                                                                                            | quando as regras ou o ESLint mudarem                               |
| `npm test`                           | Vitest: `packages/shared` (unitários), `apps/api` (integração com PostgreSQL real em `studentos_test`), `apps/web` (componentes, Testing Library)                                            | sempre; precisa de `npm run db`                                    |
| `npm run build`                      | Build de produção (`shared` → `web` → `api`)                                                                                                                                                 | sempre                                                             |
| `npm run check`                      | Os seis acima em sequência; **não publica**. Os testes da API aplicam migrações e esvaziam tabelas só na BD local `*_test` — `apps/api/test/test-db-guard.ts` recusa outro destino (testado) | antes de cada commit/push                                          |
| `npm run test:e2e`                   | Build + Playwright (Chromium) contra `npm start` na porta 4100 com `studentos_test`, incluindo axe                                                                                           | percursos críticos e antes de push                                 |
| `npm audit` / `npm audit --omit=dev` | Avisos de segurança das dependências (completas e de produção)                                                                                                                               | antes de push; a CI falha com nível alto                           |

Testes isolados: `npm test -w @studentos/api -- test/planner.test.ts`. Os testes da API usam a BD `studentos_test` e correm em série (`fileParallelism: false`) com o processo em UTC (como o Render).

## Regras de base

- TypeScript `strict`; Zod nos limites (pedidos, ambiente); autorização por proprietário no backend (404 para recursos de outros).
- Ficheiros até **350 linhas** (`quality/max-lines`, em **aviso**): 6 ficheiros legados acima do limite a 2026-10-24 — `ImportPage.tsx` (626), `planner.ts` (485), `PlanPage.tsx` (460), `WeekView.tsx` (376), `queries.ts` (374), `schemas.ts` (353). Plano: dividir por responsabilidade quando se mexer neles (prompt 09 do toolkit), sem reformatar o resto; passar a erro quando a contagem chegar a 0.
- Sem `console.*` direto (`quality/no-direct-console`, em **erro**, 0 violações) fora de `apps/api/src/middleware/errors.ts` (erros inesperados com `requestId`) e `apps/api/src/server.ts` (arranque). Testes isentos.
- `quality/no-direct-data-access` **não se aplica**: a web é um pacote separado sem acesso ao Prisma; na API o acesso a dados é feito nas rotas e em `lib/`, por desenho.
- Lint com tipos: `no-floating-promises` e `no-misused-promises` em **erro** na API, no `shared` e nos E2E (0 violações) e em **aviso** na web — 44 casos legados (37 `no-misused-promises`, sobretudo `onSubmit={async …}`; 7 `no-floating-promises`). Plano: corrigir por ecrã quando for tocado (envolver em `void`/handlers síncronos) e passar a web a erro com 0.
- Prettier: `npx prettier --check apps packages e2e`. Fora do formato desde antes desta configuração: `.claude/launch.json`, `DEPLOY.md`, `docs/STUDENTOS_IMPLEMENTATION_SPEC.md`, `render.yaml`. Conteúdo de terceiros (`.claude/skills`, `eslint-rules`) está no `.prettierignore` e não se reformata.

## Estratégia de testes

- Regras de domínio (médias, planeador, ritmo pelos ECTS, fusos) em unitários puros no `shared`.
- API: integração com BD real, incluindo isolamento entre utilizadores, erros com `requestId`, limites de pedidos e casos de regressão escritos a falhar antes da correção.
- Web: componentes críticos com Testing Library.
- E2E: percursos críticos (registo → médias, planeador, importação, conta/transferência) e axe (sem violações sérias/críticas). Não há testes de carga nem cobertura medida.
- Capacidades adotadas sem execução própria aqui: `supabase-postgres-best-practices` (usar com BD descartável; `EXPLAIN ANALYZE` executa a consulta), `web-design-guidelines` (revisão de UI), `differential-review` (diffs sensíveis).

## Revisão depois de implementar ou corrigir

Escolhe o âmbito pelo risco do diff real (autorização, dados, migrações, segurança pedem revisão independente). Revê o código alterado e os chamadores, contratos e testes ligados. O revisor só lê; as correções voltam a quem escreveu. Termina quando os achados relevantes estão resolvidos ou decididos, as verificações afetadas passam e os riscos residuais ficam registados. Mais rondas só com evidência nova, risco por resolver ou pedido explícito; uma contagem pedida pelo utilizador não recomeça depois de correções.

## Revisão de segurança

Prompt reutilizável em [`docs/prompts/security-review.md`](prompts/security-review.md) (toolkit, revisão `790a895`): modo repositório (base) ou diff (base/head/comparação explícitos), só leitura, relatório redigido **fora do repositório** (por exemplo `~/security-reviews/studentos/`, 0600). Em diffs sensíveis, usa também `differential-review`. Fronteiras a seguir: sessões e cookies, autorização por proprietário, importações (CSV/ICS), transferência entre contas, exportações (.ics, JSON). Nunca testar contra a produção (Render/Neon). "Sem achados" não significa "seguro".

## Avaliação do harness

Modo: **adaptação nativa** do método inspirado no Harness2 (prompt 15 do toolkit, revisão `790a895`), sem o CLI oficial. Invocação: «Lê o `docs/prompts/15-harness-improvement.md` do Vibe Coding Toolkit (revisão registada em `docs/setup.md`) e executa o bloco Prompt para este projeto.» Casos de fumo (guia 07 / prompt 14) em cópias descartáveis da fixture do toolkit, fora do projeto, com o validador do toolkit fora do âmbito de escrita do agente. Resultados e casos por correr: [`docs/setup.md`](setup.md#memória-e-harness). Volta a correr os casos relevantes depois de mudar instruções, memória, skills ou orquestração; uma passagem é um teste de fumo, não fiabilidade.

## Dependências e entrega

`npm audit` a 2026-10-24: 0 vulnerabilidades depois de `npm audit fix` (body-parser 2.0.0–2.3.0 → 2.4.0, alta, negação de serviço; fast-uri → 3.1.9, moderada). Lint e build verdes não significam audit limpo. As verificações são comandos explícitos: sem hooks Git, bloqueios de push ou exigências de branch. A CI (`.github/workflows/ci.yml`) corre os mesmos comandos, mas está parada pela faturação da conta; a bateria local é a barreira antes de cada push (que publica no Render).
