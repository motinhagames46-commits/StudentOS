# Preparação local

## Pré-requisitos

- **Node.js 24** e npm 11. Neste projeto está instalado de forma portátil em `.tools/node` (fora do Git); um Node 24 do sistema também serve. Em cada terminal novo: `export PATH="$PWD/.tools/node/bin:$PATH"`.
- **PostgreSQL 17**: `npm run db` arranca uma instância local (`embedded-postgres`, porta 54329), sem Docker. Alternativa: `docker compose up -d`.
- Browser do Playwright para os E2E: `npx playwright install chromium` (uma vez).

## Primeira execução

```bash
npm install
cp apps/api/.env.example apps/api/.env   # só DATABASE_URL e PORT; sem segredos reais
npm run db                               # noutro terminal
npm run db:migrate                       # cria as tabelas
npm run db:seed                          # conta de demonstração local
npm run dev                              # BD + API :4000 + web :5173
```

Conta de demonstração do seed (só local): `demo@studentos.test` / `demo-studentos-2026`.

## Base de dados

- Local: bases `studentos` (desenvolvimento) e `studentos_test` (testes, criada pelo `npm run db`).
- Nova migração: altera `apps/api/prisma/schema.prisma`, gera o SQL com `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script > prisma/migrations/<UTC>_<nome>/migration.sql` (em `apps/api`; o `migrate dev` não funciona sem terminal interativo), **revê o SQL** (só aditivo), aplica com `npx prisma migrate deploy` e corre `npx prisma generate`.
- Produção: as migrações correm no arranque do Render (`npm run db:deploy`). Nunca uses a base de produção para testes; o `DATABASE_URL` de produção vive só nas variáveis do Render.

## Verificar

- `npm run check` — tipos, lint (normal e com tipos), auto-teste das regras locais, testes e build. Precisa da BD local para os testes da API.
- `npm run test:e2e` — build de produção + Playwright + axe na porta 4100 com `studentos_test`.

## Agentes

Lê [`AGENTS.md`](../AGENTS.md); o [`CLAUDE.md`](../CLAUDE.md) importa as mesmas instruções. Ferramentas, plugins, skills e o seu estado: [`setup.md`](setup.md).

## Problemas conhecidos

| Sintoma                                 | Causa verificada e solução                                                             |
| --------------------------------------- | -------------------------------------------------------------------------------------- |
| `ECONNREFUSED 127.0.0.1:54329`          | A BD local não está a correr: `npm run db` noutro terminal.                            |
| `npm: command not found`                | Falta o Node no PATH: `export PATH="$PWD/.tools/node/bin:$PATH"`.                      |
| Erros do Prisma depois de um `git pull` | Há migrações novas por aplicar: `npm run db:deploy -w @studentos/api`.                 |
| `test:e2e` falha a abrir o browser      | `npx playwright install chromium`.                                                     |
| A versão publicada demora a responder   | Plano gratuito do Render: o primeiro pedido acorda o serviço (até 1 minuto).           |
| "Demasiadas tentativas" no login        | Limite de 10 tentativas falhadas a cada 15 minutos; reinicia a API em desenvolvimento. |
