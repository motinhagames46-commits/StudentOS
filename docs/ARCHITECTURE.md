# Arquitetura do StudentOS

Este documento descreve as decisões técnicas que estão no código e os pontos em que a implementação se afasta do spec ([`STUDENTOS_IMPLEMENTATION_SPEC.md`](STUDENTOS_IMPLEMENTATION_SPEC.md)). Os endpoints estão descritos em [`API.md`](API.md).

## Visão geral

Monorepo com npm workspaces:

```
packages/shared   lógica pura e sem I/O: médias e nota necessária, planeador, fusos horários, esquemas Zod
apps/api          Express 5 + Prisma 7 (PostgreSQL 17); em produção serve também o build do frontend
apps/web          SPA React 19 + React Router + TanStack Query + Tailwind 4
e2e               Playwright + axe-core, contra o build de produção
```

**Fronteiras:**

- Tudo o que é cálculo e precisa de ser determinístico (médias, planeador, conversão de fusos) vive em `packages/shared`, sem acesso à base de dados nem à rede. Por isso testa-se em unidade.
- A API valida cada pedido com os esquemas Zod partilhados, aplica a autorização e persiste os dados.
- O frontend usa os mesmos esquemas para validar os formulários, mas nunca é a única barreira.

## Autenticação e sessões

- **Palavras-passe:** bcrypt com custo 12. Afasta-se do spec, que recomenda Argon2id: o módulo nativo `argon2` não compilava neste ambiente e o `bcryptjs` é JavaScript puro. A troca está isolada em `apps/api/src/lib/auth.ts`.
- **Sessões no servidor:**
  - o token é opaco, com 32 bytes aleatórios, e viaja no cookie `sid` (`HttpOnly`, `SameSite=Lax`, `Secure` em produção);
  - a tabela `UserSession` guarda só o hash SHA-256 do token;
  - a sessão dura 7 dias;
  - o logout é real (a linha é apagada) e cada login gera um token novo;
  - em `/conta` é possível revogar sessões de outros dispositivos;
  - mudar a palavra-passe (`POST /api/me/password`) exige a atual, apaga todas as sessões e abre uma nova neste dispositivo, para que um cookie roubado deixe de servir;
  - eliminar a conta exige o email e a palavra-passe.
- **Limites de pedidos** (`lib/rate-limit.ts`): 300 pedidos a cada 15 minutos por IP; 10 tentativas falhadas a cada 15 minutos nas operações que verificam a palavra-passe (login, registo, mudar a palavra-passe e eliminar a conta). O 429 usa o formato de erro comum. Os limitadores estão desligados nos outros testes e têm testes próprios (`test/rate-limit.test.ts`).
- **Nada no browser:** não há tokens em `localStorage` nem em `sessionStorage`. O único valor guardado no browser é o último preset do modo foco, que é uma preferência de interface.
- **CSRF:** os pedidos que alteram dados têm de ser JSON (415 caso contrário). Com o `SameSite=Lax`, isto basta para uma SPA na mesma origem.

## Autorização e isolamento

- Todas as consultas filtram pelo `userId` da sessão.
- Para recursos aninhados, os helpers `findOwned*` (`lib/ownership.ts`) verificam o proprietário antes de qualquer alteração.
- Um recurso de outro utilizador responde **404**, para não revelar que existe.
- Os testes de isolamento (404) cobrem autenticação, semestres, disciplinas, tarefas, importação, planeador e sessões de estudo.

## Erros e observabilidade

- O middleware `requestId` atribui um id a cada pedido, devolve-o no cabeçalho `X-Request-Id` e inclui-o no corpo dos erros: `{ error: { code, message, requestId, details? } }`.
- Os erros inesperados são registados no servidor com o `requestId` e chegam ao cliente como mensagem genérica, sem stack trace.

## Fuso horário

- A base de dados guarda instantes em UTC.
- O fuso por omissão é `Europe/Lisbon`. Os cálculos locais (janelas de disponibilidade, expansão de aulas semanais e agrupamento por dia) usam `@date-fns/tz` e os helpers de `packages/shared/src/timezone.ts`, que lidam corretamente com as mudanças de hora.
- Um prazo sem hora é guardado às 23:59, hora local.
- «Hoje», «amanhã» e «daqui a N dias» contam-se em **dias civis de Lisboa** com uma só função, `calendarDaysUntil`, usada pela API (explicações do planeador) e pela interface (lista de tarefas). O início do dia no painel também é a meia-noite de Lisboa.
- O servidor de produção corre em UTC, e os testes também (`TZ: 'UTC'` nas configurações do Vitest), para que um cálculo que dependa por engano do fuso do processo falhe localmente.

## Horário (ScheduleBlock) e recorrência

- Cada série guarda a RRULE, as datas de exceção (`exceptionDates`) e o fim (`seriesEndAt`). As ocorrências não são materializadas.
- A expansão é feita em hora local com o iterador do `ical.js` (`lib/recurrence.ts`), para que uma aula às 18:00 continue às 18:00 depois da mudança de hora.
- É possível saltar uma ocorrência isolada (`/skip`) sem destruir a série.

## Importação (CSV/ICS)

Fluxo obrigatório do spec §8.2: **ficheiro → validação → pré-visualização editável → confirmação explícita**.

1. `POST /api/imports` analisa o ficheiro em memória (até 1 MB) com `ical.js` ou `csv-parse`. Guarda num `ImportJob` só os itens normalizados, sem o ficheiro, e não grava aulas nem tarefas.
2. Deteção de duplicados, de duas formas:
   - por `externalId` (UID, mais o RECURRENCE-ID nos `.ics`);
   - por impressão digital SHA-256 do título, das datas e da disciplina.
3. Num CSV com datas ambíguas (por exemplo, `03/04/2026`), o utilizador tem de escolher o formato antes de confirmar (409 `DATE_FORMAT_UNCONFIRMED`).
4. `POST /:id/confirm` grava numa transação só os itens marcados e apaga os itens do job (minimização de dados).
5. As pré-visualizações expiram em 24 horas, com limpeza preguiçosa. Uma importação confirmada pode ser anulada (`DELETE /:id/data`).

## Planeador determinístico (spec §11)

`planStudy()` em `packages/shared/src/planner.ts` é uma **função pura**: o mesmo input produz sempre o mesmo plano, e não usa IA.

**Construção do plano:**

1. **Janelas livres:** a disponibilidade semanal, em hora local, menos os blocos ocupados (aulas, eventos e sessões protegidas) e menos o passado. A grelha é de 5 minutos.
2. **Prioridade:** soma ponderada de fatores normalizados em [0, 1], com pesos que somam 1:

   | Fator                | Peso | Cálculo                        |
   | -------------------- | ---- | ------------------------------ |
   | Proximidade do prazo | 0,35 | `1 − dias/14` (sem prazo: 0,1) |
   | Prioridade declarada | 0,20 | alta 1 · média 0,5 · baixa 0,2 |
   | Peso da avaliação    | 0,15 | `peso% / 100`                  |
   | Trabalho restante    | 0,15 | `minutos / 300`                |
   | Sessões falhadas     | 0,10 | `falhadas / 3`                 |
   | Em atraso            | 0,05 | 1 se o prazo já passou         |

3. **Viabilidade:** se a escolha por prioridade puser em risco um prazo próximo, passa à frente o item com o prazo mais cedo (verificação EDF).
4. **Distribuição:**
   - alterna disciplinas quando a prioridade fica a menos de 15 % da melhor;
   - agenda no máximo 2 sessões do mesmo item por dia, exceto perto do prazo;
   - respeita o limite diário;
   - nunca termina uma sessão depois do prazo do item.
5. **O que não cabe** é reportado com um motivo, e o plano nunca inventa disponibilidade. Motivos: `NO_ESTIMATE` (sem estimativa), `NO_SPACE`, `PAST_DEADLINE` e `BEYOND_HORIZON` (o prazo fica fora do horizonte do plano).
6. **Explicações:** cada sessão traz uma explicação legível que só usa números existentes no sistema, como o prazo, o peso e os minutos. O nível calculado chama-se **«Urgência»** (alta ≥ 0,6, média ≥ 0,35, baixa), para não se confundir com a prioridade que o estudante escolhe numa tarefa.
7. **Disciplinas arquivadas** saem do planeador (tarefas e avaliações); as tarefas sem disciplina continuam.

**«O que estudar agora»** (`GET /api/planner/suggestion`): se houver uma sessão planeada a decorrer (ou a começar nos próximos 30 minutos), sugere-a; caso contrário, o item com maior pontuação. A explicação é **sempre recalculada no momento do pedido**, porque o texto guardado no plano fica desatualizado. Os itens sem duração estimada também contam: uma tarefa urgente não desaparece por não ter estimativa; a resposta traz `needsEstimate` e a interface pede a duração.

**Valores por omissão** (`DEFAULT_PLANNER_PREFERENCES`, editáveis em `/preferencias`): sessões de 50 minutos (mínimo 25), pausa de 10 minutos e limite diário de 180 minutos. O horizonte é de 7 dias (máximo 28).

**Ciclo de vida:**

- Cada proposta é um `StudyPlan` em estado `DRAFT` que dura 30 minutos.
- Na confirmação, a proposta é revalidada contra o estado atual da base de dados: 409 `PLAN_STALE` se algo mudou, 410 `PLAN_EXPIRED` se expirou.
- **Sessões protegidas:** concluídas, fixadas e a decorrer. Nunca são alteradas.
- **Sessões substituíveis:** planeadas, não fixadas e no futuro. Ao confirmar, passam a `CANCELLED`, ficando no histórico em vez de serem apagadas.
- Mover uma sessão à mão fixa-a, e o replaneamento respeita-a.

## Modo foco (spec §7.6)

- A `StudySession` regista o tempo real de estudo, com disciplina e sessão planeada opcionais.
- Presets 25/5, 50/10 e personalizado (5–180 minutos de foco, 0–60 de pausa), guardados em `targetMinutes` e `breakMinutes`.
- **Pausar e retomar no servidor:** `pausedAt` marca a pausa em curso e `pausedSeconds` acumula as anteriores. Por isso o estado sobrevive a uma atualização da página ou a uma mudança de dispositivo.
- O tempo de foco é a duração total menos as pausas. As estatísticas descontam as pausas em proporção, quando a sessão atravessa o limite do intervalo pedido.
- Ao atingir o objetivo, a interface sugere a pausa mas não termina a sessão. Isto é intencional: o utilizador decide quando parar.

## Integrações (Moodle e Outlook)

- O contrato está em `apps/api/src/integrations/types.ts`:
  - `MoodleProvider` e `CalendarProvider`;
  - estados `NOT_CONFIGURED`, `PENDING_AUTHORIZATION`, `CONNECTED`, `SYNCING`, `ERROR` e `REAUTH_REQUIRED`.
- **Moodle (IPVC):** só por API ou funções formalmente autorizadas pelos Serviços de Informática, sem scraping nem cookies do browser. Sem essa autorização, o fornecedor real fica `NOT_CONFIGURED`. O `MockMoodleProvider` só existe com `NODE_ENV=test`, para testar o contrato. A alternativa disponível é a importação manual (CSV/ICS).
- **Outlook (Microsoft Graph):** não está implementado. Exige o registo de uma aplicação no Entra ID com `Calendars.Read` (só leitura) e uma chave para cifrar os tokens no servidor.
- `GET /api/integrations` nunca devolve `CONNECTED` sem uma verificação real bem-sucedida.

## IA generativa (spec §12)

Não incluída nesta versão: o planeador e todos os cálculos funcionam sem IA. Nenhum ficheiro nem dado do utilizador é enviado a fornecedores externos.

## Testes

| Camada            | Ferramenta                                    | O que cobre                                                                                                                                                                      |
| ----------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared` | Vitest                                        | Médias e nota necessária; planeador (sobreposições, limite diário, prazos, determinismo, mudança de hora).                                                                       |
| `apps/api`        | Vitest + Supertest, com a BD `studentos_test` | Autenticação e sessões, palavra-passe, limites de pedidos, isolamento (404), validação, importação, recorrência, planeador e sugestão, painel (fuso), modo foco e estatísticas.  |
| `apps/web`        | Vitest + Testing Library                      | Componentes críticos (simulador de notas, lista de tarefas).                                                                                                                     |
| `e2e`             | Playwright + axe-core                         | Fluxo principal, fluxo do planeador (spec §15.3), conta (mudar palavra-passe, eliminar), privacidade, alinhamento do calendário semanal e acessibilidade das páginas principais. |

## Deploy

- **Alojamento:** Render (serviço web) com Neon (PostgreSQL), ambos na UE. Ver [`../DEPLOY.md`](../DEPLOY.md).
- **Migrações:** são sempre aditivas e correm no arranque (`prisma migrate deploy`). Se uma migração falhar, o processo termina antes de servir pedidos e o deploy fica marcado como falhado.

## Diferenças em relação ao spec

| Spec                                              | Implementação                                                                     | Motivo                                                                                                                                               |
| ------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Argon2id                                          | bcrypt com custo 12                                                               | O módulo nativo não compilava; `bcryptjs` é JavaScript puro.                                                                                         |
| `POST /api/study-sessions/:id/complete` e `/miss` | `/api/planned-sessions/:id/complete` e `/miss`                                    | `/api/study-sessions` regista o tempo real de foco; as sessões planeadas são outra entidade.                                                         |
| `POST /api/planner/confirm`                       | `POST /api/planner/:id/confirm`                                                   | Cada proposta tem identificador e é revalidada antes de ser aplicada.                                                                                |
| `GET/POST /api/assessments`                       | `GET/POST /api/disciplines/:id/assessments` e `PATCH/DELETE /api/assessments/:id` | Uma avaliação pertence sempre a uma disciplina.                                                                                                      |
| Prazo com hora opcional                           | Um prazo sem hora fica às 23:59, hora local                                       | Assim, uma tarefa "para hoje" não aparece em atraso logo de manhã.                                                                                   |
| Rotas Outlook e Moodle                            | Só `GET /api/integrations` (`NOT_CONFIGURED`)                                     | Faltam credenciais da Microsoft e autorização do IPVC.                                                                                               |
| `POST /api/ai/study-assistance`                   | Não incluído                                                                      | O spec põe a IA na prioridade 7.                                                                                                                     |
| Atalho «Ligar calendário» no painel (§7.1)        | Atalho «Definir disponibilidade»                                                  | As integrações ainda não estão disponíveis; um atalho para uma página «indisponível» engana. A disponibilidade é o que o planeador precisa primeiro. |
| Prioridade no plano (§11.4)                       | Nível chamado «Urgência»                                                          | Evita dois significados para «prioridade» no mesmo ecrã.                                                                                             |
