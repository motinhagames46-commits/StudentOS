# StudentOS

Organizador académico pessoal para estudantes de TPSI (IPVC): disciplinas, tarefas, avaliações com pesos, cálculo de médias e simulador de "quanto preciso no exame?".

**Versão publicada:** <https://studentos-7axk.onrender.com> (plano gratuito: o primeiro acesso após inatividade pode demorar até 1 minuto).

A especificação completa está em [`StudentOS-Especificacao-v2.md`](StudentOS-Especificacao-v2.md).

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 19, React Router 8, TanStack Query 5, Tailwind CSS 4, Vite 8 |
| Backend | Node.js 24 LTS, Express 5, Zod 4 |
| Base de dados | PostgreSQL 17, Prisma ORM 7 (`@prisma/adapter-pg`) |
| Autenticação | JWT em cookie `httpOnly`, bcrypt (custo 12) |
| Testes | Vitest 5, Supertest, Testing Library, Playwright + axe-core (E2E) |

## Estrutura

```
packages/shared   motor de cálculo de médias (RN03–RN08) e esquemas Zod, usados pela API e pelo frontend
apps/api          API REST (Express + Prisma); em produção serve também o frontend
apps/web          SPA React
e2e               testes end-to-end (Playwright) contra o build de produção
scripts/db.mjs    PostgreSQL 17 local, sem Docker
```

## Arranque rápido

O Node.js 24 está instalado de forma portátil em `.tools/node` (esta pasta não vai para o Git). Em cada terminal novo:

```bash
export PATH="$PWD/.tools/node/bin:$PATH"
```

Primeira vez:

```bash
npm install
cp apps/api/.env.example apps/api/.env   # depois gera um JWT_SECRET (ver o comentário no ficheiro)
npm run db                                # num terminal à parte: PostgreSQL em localhost:54329
npm run db:migrate                        # cria as tabelas
npm run db:seed                           # dados de demonstração
```

Desenvolvimento (base de dados, API em `:4000` e frontend em `:5173`, tudo junto):

```bash
npm run dev
```

Abre <http://localhost:5173>. Conta de demonstração do seed: `demo@studentos.test` / `demo-studentos-2026`.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Base de dados + API + frontend em modo de desenvolvimento |
| `npm test` | Todos os testes (motor de médias, API com BD de teste, componentes) |
| `npm run test:e2e` | Build de produção + testes end-to-end com Playwright (fluxo principal e axe) |
| `npm run typecheck` | TypeScript em modo `strict` em todos os pacotes |
| `npm run lint` | ESLint |
| `npm run build` | Build de produção (`shared` → `web` → `api`) |
| `npm start` | Servidor de produção: API em `/api` + frontend, na mesma origem |
| `npm run db:migrate` | Nova migração após alterar `apps/api/prisma/schema.prisma` |

Os testes da API usam a base de dados `studentos_test`, que o `npm run db` cria automaticamente. Com Docker, `docker compose up -d` é uma alternativa ao `npm run db` (usa a mesma porta).

Os testes E2E (`e2e/`) fazem o build, arrancam o `npm start` na porta 4100 com a base de dados `studentos_test` e correm no Chromium: o fluxo principal (registo → disciplina → avaliações do exemplo 4.1 → «Para passar precisas de 8,0» → tarefa concluída) e a verificação axe do painel, das tarefas e do detalhe da disciplina (falham com violações sérias ou críticas). Se o PostgreSQL local não estiver a correr, o Playwright arranca o `npm run db`. Na primeira vez é preciso descarregar o browser:

```bash
npx playwright install chromium
```

## Estado do MVP

| Requisito | Estado |
|---|---|
| RF01–RF02 Registo, login, logout, terminar todas as sessões | ✅ |
| RF03 Semestres (criar, editar, eliminar e escolher o ativo na página Disciplinas) | ✅ |
| RF04 Disciplinas | ✅ |
| RF05–RF06 Tarefas, filtros e ordenação | ✅ |
| RF07–RF09 Avaliações, médias e simulador de nota necessária | ✅ |
| RF10 Painel inicial | ✅ |
| RF11–RF12 Exportar dados e eliminar conta | ✅ |
| RF13 Sessões de estudo: temporizador, disciplina opcional e histórico (Should) | ✅ |
| RF14 Estatísticas (estudo por disciplina e por dia, progresso das tarefas) | ✅ |
| RF15 Calendário mensal de prazos e avaliações | ✅ |
| RF17 Alertas na aplicação (próximas 48 h) | ✅ |
| Testes E2E (Playwright): fluxo principal e acessibilidade com axe | ✅ |

## Deploy

Render (serviço web, Frankfurt) + Neon (PostgreSQL, UE), em plano gratuito. O passo a passo está em [`DEPLOY.md`](DEPLOY.md) e a configuração em [`render.yaml`](render.yaml).

## Notas de segurança

- O ficheiro `apps/api/.env` tem segredos e nunca deve ir para o Git (está no `.gitignore`).
- Todos os recursos são filtrados pelo utilizador da sessão. Um recurso de outro utilizador devolve 404, e há testes para isso (`apps/api/test/tasks.test.ts`).
- A conta do seed é só para desenvolvimento local.
