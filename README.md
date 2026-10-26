# StudentOS

Organizador académico pessoal para estudantes de TPSI (IPVC). Reúne disciplinas, tarefas e avaliações com pesos, com o cálculo das médias e o simulador "quanto preciso no exame?". Inclui também horário com importação CSV/ICS, um planeador de estudo determinístico (sem IA) e o modo foco. Quem visita sem sessão vê uma página de entrada com o simulador; depois do registo, um questionário de quatro passos monta a primeira semana de estudo.

**Versão publicada:** <https://studentos-7axk.onrender.com> (plano gratuito: o primeiro acesso após inatividade pode demorar até 1 minuto).

Documentação:

- [`PRODUCT.md`](PRODUCT.md) — produto, público, âmbito e critérios;
- [`AGENTS.md`](AGENTS.md) — instruções para agentes (o `CLAUDE.md` importa-as);
- [`docs/onboarding.md`](docs/onboarding.md) — preparação local, base de dados e problemas conhecidos;
- [`docs/quality.md`](docs/quality.md) — o que cada verificação prova, revisão e segurança;
- [`docs/design.md`](docs/design.md) — interface, tokens e acessibilidade;
- [`docs/setup.md`](docs/setup.md) — ferramentas de agentes (toolkit), versões e evidência;
- [`docs/STUDENTOS_IMPLEMENTATION_SPEC.md`](docs/STUDENTOS_IMPLEMENTATION_SPEC.md) — especificação de implementação;
- [`docs/ESPECIFICACAO-v2.md`](docs/ESPECIFICACAO-v2.md) — especificação funcional;
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — decisões técnicas, planeador e diferenças em relação ao spec;
- [`docs/API.md`](docs/API.md) — endpoints;
- [`DEPLOY.md`](DEPLOY.md) — publicação;
- [`docs/decisoes-pendentes.md`](docs/decisoes-pendentes.md) — decisões do dono do produto e o que ficou adiado;
- [`docs/guiao-teste-colegas.md`](docs/guiao-teste-colegas.md) — guião de 20 minutos para testar com colegas.

## Stack

| Camada        | Tecnologia                                                                                     |
| ------------- | ---------------------------------------------------------------------------------------------- |
| Frontend      | React 19, React Router 8, TanStack Query 5, Tailwind CSS 4, Vite 8                             |
| Backend       | Node.js 24 LTS, Express 5, Zod 4                                                               |
| Base de dados | PostgreSQL 17, Prisma ORM 7 (`@prisma/adapter-pg`)                                             |
| Autenticação  | Sessões no servidor (token opaco em cookie `httpOnly`, guardado só em hash), bcrypt (custo 12) |
| Testes        | Vitest 5, Supertest, Testing Library, Playwright + axe-core (E2E)                              |

## Estrutura

```
packages/shared   motor de cálculo de médias (RN03–RN08) e esquemas Zod, usados pela API e pelo frontend
apps/api          API REST (Express + Prisma); em produção serve também o frontend
apps/web          SPA React
e2e               testes end-to-end (Playwright) contra o build de produção
scripts/db.mjs    PostgreSQL 17 local, sem Docker
```

## Pré-requisitos

- **Node.js 24 LTS:** neste projeto está instalado de forma portátil em `.tools/node`, mas um Node 24 do sistema também serve.
- **PostgreSQL 17:** o `npm run db` arranca uma instância local (`embedded-postgres`), sem Docker. Em alternativa, `docker compose up -d`.

## Arranque rápido

O Node.js 24 está instalado de forma portátil em `.tools/node` (esta pasta não vai para o Git). Em cada terminal novo:

```bash
export PATH="$PWD/.tools/node/bin:$PATH"
```

Primeira vez:

```bash
npm install
cp apps/api/.env.example apps/api/.env
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

| Comando              | O que faz                                                                    |
| -------------------- | ---------------------------------------------------------------------------- |
| `npm run dev`        | Base de dados + API + frontend em modo de desenvolvimento                    |
| `npm test`           | Todos os testes (motor de médias, API com BD de teste, componentes)          |
| `npm run test:e2e`   | Build de produção + testes end-to-end com Playwright (fluxo principal e axe) |
| `npm run typecheck`  | TypeScript em modo `strict` em todos os pacotes                              |
| `npm run lint`       | ESLint                                                                       |
| `npm run build`      | Build de produção (`shared` → `web` → `api`)                                 |
| `npm start`          | Servidor de produção: API em `/api` + frontend, na mesma origem              |
| `npm run db`         | Só a base de dados local (PostgreSQL em `localhost:54329`)                   |
| `npm run db:migrate` | Nova migração após alterar `apps/api/prisma/schema.prisma`                   |
| `npm run db:seed`    | Recria a conta de demonstração com dados de exemplo                          |
| `npm run format`     | Prettier em todo o repositório                                               |

Os testes da API usam a base de dados `studentos_test`, que o `npm run db` cria automaticamente. Com Docker, `docker compose up -d` é uma alternativa ao `npm run db` (usa a mesma porta).

Os testes E2E (`e2e/`) fazem o build, arrancam o `npm start` na porta 4100 com a base de dados `studentos_test` e correm no Chromium: o fluxo principal (registo → disciplina → avaliações do exemplo 4.1 → «Para passar precisas de 8,0» → tarefa concluída) o questionário de boas-vindas, a página de entrada e a verificação axe das páginas principais (falham com violações sérias ou críticas). Se o PostgreSQL local não estiver a correr, o Playwright arranca o `npm run db`. Na primeira vez é preciso descarregar o browser:

```bash
npx playwright install chromium
```

## Estado da entrega (spec §19)

Cada linha só está marcada como **Testado** se tiver testes automáticos que passaram nesta versão (unitários, de integração ou E2E). O estado das linhas pendentes ou não incluídas está descrito com honestidade.

### Implementado e testado

| Funcionalidade                                                                                                                                                                                            | Testes                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Registo, login, logout, terminar todas as sessões, revogar dispositivos (sessões no servidor), mudar a palavra-passe                                                                                      | API + E2E                    |
| Semestres e disciplinas (criar, editar, arquivar ou reativar, eliminar)                                                                                                                                   | API + E2E + axe              |
| Tarefas: filtros, ordenação, pesquisa sem acentos, prioridade e duração estimada                                                                                                                          | API + componente + E2E       |
| Avaliações com pesos, médias e simulador de nota necessária                                                                                                                                               | unitários + componente + E2E |
| Painel, estatísticas, calendário (semana e mês) e alertas a 48 h; aviso «Em risco» nas disciplinas                                                                                                        | unitários + API + E2E + axe  |
| Painel ao estilo Gentelella: barra lateral escura, painéis que se recolhem, linha de estatísticas e «Continuar configuração»                                                                              | componente + E2E + axe       |
| Página de entrada para visitantes, com o simulador a correr só no browser                                                                                                                                 | E2E + axe                    |
| Questionário de boas-vindas (disciplinas e ECTS, avaliações por modelo, horas livres e compromissos fixos, sessões) até ao plano real dos próximos 7 dias, confirmado pelo estudante                      | unitários + E2E + axe        |
| Exportar dados (JSON) e eliminar conta (pede email e palavra-passe)                                                                                                                                       | API + E2E                    |
| Fundação da IA (Gemini): acesso só para contas autorizadas, consentimento registado, verificação real da ligação, respostas JSON validadas                                                                | API + E2E + axe              |
| Faltas por disciplina com limite do regulamento e aviso antes de o ultrapassar                                                                                                                            | unitários + API + E2E        |
| Transferir disciplinas para outra conta (código de uso único, pré-visualização e confirmação)                                                                                                             | API + E2E                    |
| Exportar o plano para o calendário pessoal (`.ics`): sessões planeadas, avaliações e prazos, com lembretes, UID estável e fuso de Lisboa; descarregado com a sessão, sem link público                     | API + E2E                    |
| Horário: aulas manuais e séries semanais com exceções, corretas na mudança de hora                                                                                                                        | API + unitários + E2E        |
| Importação `.ics`/`.csv` com pré-visualização editável, duplicados, datas ambíguas e anulação                                                                                                             | API + E2E                    |
| Planeador determinístico: proposta → confirmação, replaneamento, sessões fixadas, concluídas e falhadas, "o que estudar agora"; avaliações sem tempo de estudo planeadas pelo ritmo dos ECTS (DL 42/2005) | unitários + API + E2E        |
| Modo foco: presets 25/5, 50/10 e personalizado; pausar e retomar no servidor; estatísticas sem pausas; «Começar agora» no painel inicia o foco a partir da sugestão                                       | API + componente + E2E + axe |
| Isolamento entre utilizadores (404), erros com `requestId` e limites de pedidos (429 em JSON)                                                                                                             | API                          |
| Página de privacidade fiel ao tratamento real (alojamento, conservação, direitos na própria app, cópia ao exportar `.ics`)                                                                                | E2E                          |
| Acessibilidade (axe, sem violações sérias nem críticas) nas páginas principais                                                                                                                            | E2E                          |

### Pendente por credenciais ou autorização

| Funcionalidade                        | O que falta                                                                                                                                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Moodle IPVC                           | Autorização formal dos Serviços de Informática para usar a API (Web Services). Até lá, o estado fica `NOT_CONFIGURED` e a alternativa é a importação manual. O contrato do adaptador e um mock de teste já existem. |
| Outlook (Microsoft Graph, só leitura) | Registo de uma aplicação no Entra ID (`Calendars.Read`) e uma chave para cifrar os tokens. O estado fica `NOT_CONFIGURED`; a alternativa é exportar o calendário em `.ics` e importá-lo.                            |
| CI no GitHub Actions                  | O workflow existe, mas não corre enquanto a faturação da conta GitHub estiver bloqueada. Os mesmos comandos correm localmente antes de cada push.                                                                   |

### Não incluído nesta versão

- IA generativa para outras contas (spec §12): só a conta de quem mantém o projeto a pode ativar; nas restantes nenhum dado é enviado a fornecedores externos.
- Notificações por email ou push (os alertas existem só dentro da aplicação).
- Recuperação de palavra-passe por email (não há serviço de envio de email configurado).
- Paginação da API: as listas atuais são pequenas e limitadas por intervalo de datas.

## Deploy

Render (serviço web, Frankfurt) + Neon (PostgreSQL, UE), em plano gratuito. O passo a passo está em [`DEPLOY.md`](DEPLOY.md) e a configuração em [`render.yaml`](render.yaml).

## Notas de segurança

- O ficheiro `apps/api/.env` tem segredos e nunca deve ir para o Git (está no `.gitignore`).
- Todos os recursos são filtrados pelo utilizador da sessão. Um recurso de outro utilizador devolve 404, e há testes para isso (`apps/api/test/tasks.test.ts`).
- A conta do seed é só para desenvolvimento local.
- Abuso e negação de serviço: as inundações de rede param na Cloudflare que o Render põe à frente do serviço; a API tem limites em camadas (por IP, por conta, nas operações caras, na criação de contas e nas tentativas de login) e fecha ligações lentas de propósito. Detalhes em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
- Termos de utilização em `/termos` (sem garantia, cálculos indicativos, utilização aceitável, responsabilidade limitada nos termos da lei, lei portuguesa). Criar conta exige confirmar 16+ anos e aceitar os Termos; a conta guarda a versão aceite e quando. Não substituem aconselhamento jurídico.

## Resolução de problemas

Ver [`docs/onboarding.md#problemas-conhecidos`](docs/onboarding.md#problemas-conhecidos).
