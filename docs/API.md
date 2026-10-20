# API REST do StudentOS

Referência dos endpoints que existem no código (`apps/api/src/routes`). Os esquemas de validação estão em `packages/shared/src/schemas.ts` e são partilhados com o frontend.

## Convenções

- Base: `/api`. Em produção a API e o frontend partilham a mesma origem.
- **Autenticação:** sessão no servidor, com o cookie `sid` (`HttpOnly`, `SameSite=Lax`, `Secure` em produção). Todas as rotas, exceto `/api/health` e `/api/auth/*`, exigem sessão e respondem 401 `UNAUTHENTICATED` sem ela.
- **Isolamento:** cada pedido é filtrado pelo utilizador da sessão. Um recurso de outro utilizador responde **404**, como se não existisse. O `userId` nunca vem do cliente.
- **Corpo:** os pedidos que alteram dados têm de ser JSON (`Content-Type: application/json`), caso contrário recebem 415. Isto protege contra CSRF com formulários simples. Limites: 100 KB em geral e 2 MB em `/api/imports`. Acima do limite, a resposta é 413 `PAYLOAD_TOO_LARGE`.
- **Limites de pedidos** (por IP): 300 pedidos a cada 15 minutos. Operações que verificam a palavra-passe (login, registo, mudar a palavra-passe e eliminar a conta): 10 tentativas falhadas a cada 15 minutos. Acima do limite, a resposta é 429 `TOO_MANY_REQUESTS`, no formato de erro comum.
- **Datas:** ISO 8601 em UTC na API. A interface usa o fuso `Europe/Lisbon`.
- **Identificador de pedido:** cada resposta traz o cabeçalho `X-Request-Id`, que também vem no corpo dos erros.

### Formato de erro

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Verifica os campos assinalados.",
    "requestId": "f3b1…",
    "details": [{ "path": "title", "message": "O título é obrigatório" }]
  }
}
```

O campo `details` só aparece em erros de validação. Nunca contém stack traces, tokens nem variáveis de ambiente.

## Saúde

| Método | Caminho       | Descrição            |
| ------ | ------------- | -------------------- |
| GET    | `/api/health` | `{ "status": "ok" }` |

## Autenticação e conta

| Método | Caminho                | Descrição                                                                                                                              |
| ------ | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/auth/register`   | Cria a conta e inicia sessão (201).                                                                                                    |
| POST   | `/api/auth/login`      | Inicia sessão. Cria um token novo a cada login (rotação).                                                                              |
| POST   | `/api/auth/logout`     | Revoga a sessão atual.                                                                                                                 |
| POST   | `/api/auth/logout-all` | Revoga todas as sessões da conta.                                                                                                      |
| GET    | `/api/auth/me`         | Utilizador autenticado.                                                                                                                |
| GET    | `/api/me`              | Perfil e semestre ativo.                                                                                                               |
| GET    | `/api/me/sessions`     | Sessões ativas (dispositivos), sem o hash do token.                                                                                    |
| DELETE | `/api/me/sessions/:id` | Revoga uma sessão.                                                                                                                     |
| GET    | `/api/me/export`       | Exportação de todos os dados em JSON (RGPD), sem hashes nem tokens.                                                                    |
| POST   | `/api/me/password`     | Muda a palavra-passe. Corpo: `{ "currentPassword", "newPassword" }`. Termina todas as sessões e abre uma nova neste dispositivo (204). |
| DELETE | `/api/me`              | Elimina a conta e todos os dados. Corpo: `{ "confirmEmail", "password" }`.                                                             |

## Semestres, disciplinas e avaliações

| Método       | Caminho                                  | Descrição                                                                                       |
| ------------ | ---------------------------------------- | ----------------------------------------------------------------------------------------------- |
| GET/POST     | `/api/semesters`                         | Listar ou criar semestres.                                                                      |
| PATCH/DELETE | `/api/semesters/:id`                     | Editar (incluindo escolher o semestre ativo) ou eliminar.                                       |
| GET          | `/api/disciplines?semesterId=&archived=` | Por omissão, só as disciplinas ativas. Com `archived=true`, só as arquivadas.                   |
| POST         | `/api/disciplines`                       | Criar. Sem `semesterId`, a disciplina fica no semestre ativo.                                   |
| GET/DELETE   | `/api/disciplines/:id`                   | Consultar ou eliminar. Ao eliminar, as avaliações vão também e as tarefas ficam sem disciplina. |
| PATCH        | `/api/disciplines/:id`                   | Editar. `{ "archived": true }` arquiva e `false` reativa.                                       |
| GET          | `/api/disciplines/:id/grades?target=`    | Médias, estado e nota necessária no exame.                                                      |
| GET/POST     | `/api/disciplines/:id/assessments`       | Listar ou criar avaliações. A soma dos pesos não pode passar de 100 %.                          |
| PATCH/DELETE | `/api/assessments/:id`                   | Editar ou eliminar uma avaliação.                                                               |

## Tarefas

| Método           | Caminho          | Descrição                                                                                                                                                                                                  |
| ---------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET              | `/api/tasks`     | Filtros: `status`, `priority`, `disciplineId`, `from`, `to` e `q`. A pesquisa `q` procura no título e na descrição, sem distinguir acentos nem maiúsculas. Ordenação: `sort=dueDate\|priority\|createdAt`. |
| POST             | `/api/tasks`     | Criar. `estimatedMinutes` é opcional e é usado pelo planeador.                                                                                                                                             |
| GET/PATCH/DELETE | `/api/tasks/:id` | Consultar, editar ou eliminar. Mudar para `DONE` preenche `completedAt`.                                                                                                                                   |

## Painel, estatísticas, calendário e alertas

| Método | Caminho                   | Descrição                                                                                                                     |
| ------ | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/dashboard`          | Próximos 7 dias, tarefas em atraso, avaliações próximas, disciplinas ativas e média global.                                   |
| GET    | `/api/stats?days=`        | De 1 a 90 dias (7 por omissão). Inclui o tempo de foco por disciplina e por dia, já sem as pausas, e o progresso das tarefas. |
| GET    | `/api/calendar?from=&to=` | Prazos, avaliações e blocos do horário. O intervalo vai até 62 dias.                                                          |
| GET    | `/api/alerts`             | Tarefas e avaliações nas próximas 48 horas.                                                                                   |

## Sessões de estudo (modo foco)

| Método | Caminho                          | Descrição                                                                                                                                                            |
| ------ | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/study-sessions?from=&to=`  | Histórico.                                                                                                                                                           |
| POST   | `/api/study-sessions/start`      | Inicia uma sessão. Corpo: `{ disciplineId?, plannedSessionId?, targetMinutes? (5–180), breakMinutes? (0–60) }`. Só pode haver uma sessão em curso de cada vez (409). |
| POST   | `/api/study-sessions/:id/pause`  | Pausa a sessão. O estado fica no servidor (`pausedAt`).                                                                                                              |
| POST   | `/api/study-sessions/:id/resume` | Retoma a sessão e soma a pausa a `pausedSeconds`.                                                                                                                    |
| POST   | `/api/study-sessions/:id/stop`   | Termina a sessão. Uma pausa em curso conta até ao fim. Corpo opcional: `{ notes }`.                                                                                  |

O tempo de foco de uma sessão é `endedAt − startedAt − pausedSeconds`. Ao atingir `targetMinutes`, a interface sugere uma pausa, mas não termina a sessão.

## Horário e importação

| Método       | Caminho                          | Descrição                                                                                                                                           |
| ------------ | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET          | `/api/schedule-blocks?from=&to=` | Ocorrências no intervalo. As séries guardam a RRULE e são expandidas em hora local.                                                                 |
| POST         | `/api/schedule-blocks`           | Cria um bloco manual, único ou semanal.                                                                                                             |
| PATCH/DELETE | `/api/schedule-blocks/:id`       | Editar ou eliminar a série.                                                                                                                         |
| POST         | `/api/schedule-blocks/:id/skip`  | Cancela só uma ocorrência (`{ occurrenceStart }`).                                                                                                  |
| POST         | `/api/imports`                   | Analisa um ficheiro `.ics` ou `.csv` (até 1 MB) e devolve a pré-visualização. **Não grava dados académicos.**                                       |
| GET          | `/api/imports`                   | Histórico recente.                                                                                                                                  |
| GET          | `/api/imports/:id`               | Pré-visualização, com avisos e duplicados. Expira ao fim de 24 horas (410).                                                                         |
| POST         | `/api/imports/:id/confirm`       | Grava numa transação só os itens confirmados ou editados. Num CSV com datas ambíguas, é preciso escolher o formato (409 `DATE_FORMAT_UNCONFIRMED`). |
| DELETE       | `/api/imports/:id`               | Cancela uma pré-visualização.                                                                                                                       |
| DELETE       | `/api/imports/:id/data`          | Anula uma importação confirmada, apagando o que ela criou.                                                                                          |

## Planeador de estudo

| Método  | Caminho                              | Descrição                                                                                                                                                                                                              |
| ------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET/PUT | `/api/preferences/study`             | Duração das sessões, pausa, limite diário e disponibilidade semanal.                                                                                                                                                   |
| POST    | `/api/planner/preview`               | Gera uma proposta (`{ from?, days? (1–28) }`) sem alterar as sessões existentes. A proposta expira em 30 minutos.                                                                                                      |
| POST    | `/api/planner/replan`                | Nova proposta a partir de agora. Mantém as sessões concluídas, fixadas e a decorrer.                                                                                                                                   |
| POST    | `/api/planner/:id/confirm`           | Aplica a proposta depois de a revalidar. Se o estado mudou, responde 409 `PLAN_STALE`; se expirou, 410 `PLAN_EXPIRED`.                                                                                                 |
| DELETE  | `/api/planner/:id`                   | Descarta a proposta.                                                                                                                                                                                                   |
| GET     | `/api/planner/sessions?from=&to=`    | Sessões planeadas, sem as canceladas, e a proposta pendente.                                                                                                                                                           |
| GET     | `/api/planner/suggestion`            | "O que devo estudar agora?" A explicação é recalculada no momento do pedido e começa por «Urgência alta/média/baixa». Inclui itens sem duração estimada: nesse caso `needsEstimate: true` e a mensagem pede a duração. |
| PATCH   | `/api/planned-sessions/:id`          | Mover a sessão (fica fixada) ou fixá-la e desafixá-la.                                                                                                                                                                 |
| POST    | `/api/planned-sessions/:id/complete` | Concluir a sessão, com `actualMinutes` opcional. Não conclui a tarefa associada.                                                                                                                                       |
| POST    | `/api/planned-sessions/:id/miss`     | Marcar como falhada. Uma sessão que ainda não começou responde 409 `NOT_STARTED`.                                                                                                                                      |
| DELETE  | `/api/planned-sessions/:id`          | Retirar do plano.                                                                                                                                                                                                      |

> **Diferença em relação ao spec §13:** o spec sugere `/api/study-sessions/:id/complete` e `/miss`. Aqui, `/api/study-sessions` regista o tempo real de foco e as sessões **planeadas** ficam em `/api/planned-sessions`. A confirmação do plano é `/api/planner/:id/confirm`, porque cada proposta tem identificador próprio.

## Integrações

| Método | Caminho             | Descrição                                                                                                                               |
| ------ | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/integrations` | Estado do Moodle e do Outlook. Nesta versão os dois estão `NOT_CONFIGURED`, e a API nunca devolve `CONNECTED` sem uma verificação real. |

As rotas OAuth do Outlook e de sincronização do Moodle (spec §13) **não estão implementadas**. Dependem de credenciais da Microsoft e de autorização formal do IPVC (ver `docs/ARCHITECTURE.md`).
