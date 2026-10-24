# StudentOS — instruções para agentes

Organizador académico pessoal para estudantes (TPSI, IPVC). Produto e âmbito: [`PRODUCT.md`](PRODUCT.md). Especificação de implementação (referência funcional e técnica principal): [`docs/STUDENTOS_IMPLEMENTATION_SPEC.md`](docs/STUDENTOS_IMPLEMENTATION_SPEC.md) — lê integralmente antes de editar código de produto.

## Stack e ambiente

- Monorepo npm workspaces: `packages/shared` (lógica pura, esquemas Zod), `apps/api` (Express 5 + Prisma 7 + PostgreSQL), `apps/web` (React 19 + Vite + TanStack Query + Tailwind 4), `e2e` (Playwright + axe).
- Node.js 24 portátil em `.tools/node` (fora do Git). Em cada terminal: `export PATH="$PWD/.tools/node/bin:$PATH"`.
- PostgreSQL local sem Docker: `npm run db` (porta 54329; bases `studentos` e `studentos_test`).
- Produção: Render (deploy automático a cada push para `main`, migrações no arranque) + Neon. **Cada push publica.**

## Comandos canónicos (confirmados no `package.json`)

| Para                                   | Comando                                                                     |
| -------------------------------------- | --------------------------------------------------------------------------- |
| Instalar                               | `npm install`                                                               |
| Desenvolver (BD + API + web)           | `npm run dev`                                                               |
| Tipos                                  | `npm run typecheck`                                                         |
| Lint                                   | `npm run lint`                                                              |
| Lint com tipos (async)                 | `npm run lint:typed`                                                        |
| Regras locais (auto-teste)             | `npm run lint:rules`                                                        |
| Testes (unitários + API + componentes) | `npm test` (precisa da BD local)                                            |
| E2E + axe                              | `npm run test:e2e` (faz build)                                              |
| Build                                  | `npm run build`                                                             |
| Verificação combinada                  | `npm run check` (tipos, lint, regras, testes, build; não publica nem migra) |
| Nova migração                          | `npm run db:migrate` (ver [onboarding](docs/onboarding.md#base-de-dados))   |

## Regras inegociáveis

- Não inventes resultados de execução, permissões, sincronizações ou dados.
- Não marques Outlook/Moodle como ligados sem uma verificação real bem-sucedida.
- Para Moodle, utiliza apenas APIs e funções formalmente autorizadas pelo IPVC. Não faças scraping autenticado, não reutilizes cookies do browser e não contornes permissões. Se faltar autorização, entrega o adapter contract, mock testável, estado `NOT_CONFIGURED` e importação manual.
- Outlook deve começar em modo de leitura com permissões mínimas. Qualquer escrita futura requer permissão própria e ação explícita do utilizador.
- Tokens, segredos e credenciais nunca vão para o frontend, `localStorage`, Git, logs ou respostas da API.
- Não envies ficheiros/documentos para um fornecedor de IA sem uma funcionalidade explicitamente ativada e consentimento adequado.
- O planeador de estudo tem de ser determinístico e testável sem IA. Nunca agenda sobre eventos ocupados nem modifica sessões concluídas/fixadas.
- Cada importação deve ter validação, pré-visualização editável, deteção de duplicados e confirmação explícita antes de gravar.
- Todas as entidades privadas devem ter autorização por proprietário verificada no backend.
- Usa português de Portugal na interface e `Europe/Lisbon` por defeito.
- Não guardes palavras-passe em texto simples nem tokens de autenticação em `localStorage` ou `sessionStorage`.
- Não inventes os comandos de scripts: confirma o `package.json`.
- Migrações só aditivas (a produção tem dados reais). Push/publicação só com autorização explícita.

## Protocolo de trabalho

1. Inspeciona estrutura, scripts, dependências, rotas, schema, migrações, testes e alterações locais. Distingue observação, suposição, decisão e evidência.
2. Escolhe a menor unidade funcional seguinte e define critérios de aceitação e comandos antes de implementar.
3. Implementa de ponta a ponta; sem ficheiros vazios, pseudocódigo como funcionalidade ou reescritas não justificadas. Correções: reproduz primeiro (teste a falhar) e prova a regressão.
4. Corre typecheck, lint, testes e build relevantes (`npm run check`; `npm run test:e2e` para percursos críticos). Corrige regressões antes de avançar.
5. Atualiza o documento responsável na mesma alteração (tabela abaixo).
6. Reporta: implementado, ficheiros alterados, comandos e resultados reais, configuração pendente e limitações. Se um comando falhar, explica e corrige ou assinala o bloqueio sem afirmar que passou.

Qualidade: TypeScript strict sem `any` não documentado; validação no frontend **e** no backend (fonte de verdade); estados de loading, vazio, sucesso e erro; testes unitários para regras de domínio, integração para API/persistência e E2E para percursos críticos; nunca simular integrações com dados de demonstração.

## Continuidade

- Responde a perguntas de estado e continua o trabalho autorizado; para se o utilizador pedir pausa ou mudar o objetivo.
- Um bloqueio para só o que depende dele. Não repitas a mesma tentativa sem nova evidência.
- Trabalho que atravessa sessões: nota de retoma curta (objetivo, estado verificado, pendente, próxima ação) na memória do cliente ([setup](docs/setup.md#memória-e-harness)); ao retomar, confirma Git, ficheiros e processos antes de confiar nela.

## Delegação e revisão

- Delega só quando isolamento de contexto, especialização ou paralelismo independente compensam. Cada tarefa: objetivo, contexto mínimo, ficheiros permitidos, recursos mutáveis, critérios e verificações. Um escritor por ficheiro; o coordenador é dono de lockfile, configuração partilhada, Git e integração. A BD de teste e as portas 4000/4100/5173 são recursos partilhados: serializa.
- Modelos: o mais leve que cumpra os critérios (inventários, pesquisas) e capacidade maior para segurança, autorização, dados, migrações e revisão crítica. Revisores só leem.
- Revisão proporcional ao risco do diff real, independente quando disponível; termina com achados resolvidos ou decididos, verificações verdes e riscos residuais registados. Ver [quality](docs/quality.md#revisão-depois-de-implementar-ou-corrigir).
- Sem bloqueios de push em `main`, exigências de branch/worktree nem hooks `pre-commit`/`pre-push`.

## Ferramentas e estilo

Estado, versões e evidência de cada uma: [`docs/setup.md`](docs/setup.md). Uma ferramenta instalada não autoriza publicar, enviar mensagens nem mudar contas.

- **Superpowers** (plugin do projeto): usa as skills relevantes à escala do pedido; instruções explícitas e execução já autorizada prevalecem sobre aprovações repetidas.
- **Ponytail** (plugin do projeto) em intensidade `full` ao programar: a menor solução completa, reutilizando o que existe; segurança, validação, acessibilidade e requisitos pedidos ficam intactos. `stop ponytail` desliga.
- **Caveman** (plugin do projeto): conversa concisa em português de Portugal, sem perder clareza; código, documentação e commits em linguagem normal. `stop caveman` desliga.
- **Context7** (MCP em `.mcp.json`): documentação atual de bibliotecas (Prisma 7, React 19, Express 5, ESLint 10…). Resolve o identificador e pergunta um conceito de cada vez; nunca envies segredos, código privado nem dados pessoais. Sem Context7, usa a documentação oficial e regista a limitação.
- **RTK** (hook global do Claude Code): reescreve comandos suportados para saída compacta; não prefixes à mão quando o hook está ativo. Para a saída original (diagnóstico, resultados exatos a reportar) usa `rtk proxy <comando>`.
- **Graphify** (CLI): perguntas estruturais com `graphify explain "<símbolo>"` ou `graphify path "A" "B"` sobre `graphify-out/graph.json` (só código, sem ligações semânticas). Regenera com `GRAPHIFY_NO_AUTO_REFRESH=1 graphify extract . --code-only --no-cluster`; confirma no código antes de afirmar uma relação.
- **Skills locais** (`.claude/skills/`, `skills-lock.json`): `vercel-react-best-practices` e `vercel-composition-patterns` (React; ignora o que for específico de Next.js — a web é Vite), `web-design-guidelines` (revisão de UI e acessibilidade), `supabase-postgres-best-practices` (antes de schema, SQL, índices, migrações; mantém Prisma e Neon), `differential-review` (diffs sensíveis de segurança, com intervalo definido), `find-skills` (só quando falta uma capacidade concreta).
- **Revisão de segurança**: [`docs/prompts/security-review.md`](docs/prompts/security-review.md), só leitura e relatório privado por defeito.
- **Browser**: o browser integrado do cliente e o Playwright; testa contra o ambiente local com dados de teste, nunca contra produção com contas reais.
- **Modelos**: mantém o cliente, o modelo principal e a autenticação; sem proxies nem APIs pagas.

## Mapa de documentos

| Documento                                      | Responsável por                                                  |
| ---------------------------------------------- | ---------------------------------------------------------------- |
| [`PRODUCT.md`](PRODUCT.md)                     | problema, público, MVP, fora de âmbito, aceitação                |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | estrutura, fronteiras, dados, decisões e diferenças face ao spec |
| [`docs/API.md`](docs/API.md)                   | endpoints reais                                                  |
| [`docs/design.md`](docs/design.md)             | interface, tokens e acessibilidade                               |
| [`docs/onboarding.md`](docs/onboarding.md)     | preparação local, BD, problemas conhecidos                       |
| [`docs/quality.md`](docs/quality.md)           | o que cada verificação prova; revisão e segurança                |
| [`docs/setup.md`](docs/setup.md)               | ferramentas de agentes, versões, evidência e pendentes           |
| [`DEPLOY.md`](DEPLOY.md)                       | publicação (Render + Neon)                                       |
