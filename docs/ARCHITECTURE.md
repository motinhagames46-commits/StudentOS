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
- **Limites de pedidos** (`lib/rate-limit.ts`), em camadas. As inundações de rede param na Cloudflare que o Render põe à frente de todos os serviços; a app trata o abuso na aplicação:
  - por IP, 2000 pedidos a cada 15 minutos em toda a API (trava uma origem a inundar, mas cabe uma turma no mesmo Wi-Fi; `RATE_LIMIT_PER_15_MIN`);
  - por conta (depois do `requireAuth`), 600 pedidos a cada 15 minutos;
  - operações caras (gerar plano, replanear, importar, criar código de transferência, exportar dados e `.ics`), 30 a cada 15 minutos por conta;
  - criação de contas, 20 por hora por IP, contando as que correm bem (`RATE_LIMIT_REGISTER_PER_HOUR`);
  - tentativas falhadas: 10 logins por IP + email (força bruta a uma conta sem bloquear os colegas) e 50 por IP nas operações com palavra-passe ou códigos de transferência.
    O IP vem do `CF-Connecting-IP` (escrito pela Cloudflare; o primeiro valor de `X-Forwarded-For` pode ser inventado) e, sem ele, de `req.ip`. Os contadores ficam em memória de um só processo (uma instância no Render gratuito; com mais, usar Render Key Value). O servidor fecha ligações lentas de propósito (cabeçalhos em 20 s, pedido em 180 s, para um documento de 10 MB caber numa rede móvel fraca). O 429 usa o formato de erro comum; os limitadores estão desligados nos outros testes e têm testes próprios (`test/rate-limit.test.ts`); os testes E2E aumentam os limites por IP, porque todos os pedidos vêm do mesmo IP.
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

**Revisões devidas:** além das tarefas e avaliações, `buildPlannerContext` junta um item `review` quando há perguntas de repetição espaçada devidas até ao fim do dia e o período do plano inclui hoje: prazo às 23:59, prioridade média e 1,5 min por pergunta em blocos de 5 (estimativa fixa; passa a média real das revisões quando houver histórico), com teto de um quarto do limite diário, menos o tempo já reservado hoje em blocos de revisão fixados ou a decorrer (o que já foi revisto deixa de estar devido, por isso não se desconta duas vezes). A confirmação deixa cair o bloco se entretanto já não houver perguntas devidas. As sessões confirmadas ficam com `PlannedSession.isReview` (migração aditiva), aparecem como «Estudar · Revisões» e levam à página das revisões («Rever agora») em vez do temporizador.

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

**Tempo de estudo em falta: ritmo pelos ECTS** (`packages/shared/src/workload.ts`). Uma avaliação sem tempo de estudo indicado (o caso normal no início do semestre: as fichas de UC dão pesos, mas não datas) recebe uma quota calculada — o «valor predefinido documentado» do spec §11.2:

- horas autónomas da UC = ECTS × **25 h** − horas de aula da UC no semestre (DL 42/2005, art. 5.º: 1 ECTS = 25 a 28 h de trabalho; usa-se o limite inferior);
- orçamento da avaliação = horas autónomas × peso da avaliação;
- ritmo diário = orçamento ÷ dias desde o início do semestre até à data da avaliação ou, sem data, até ao fim do semestre;
- quota do período = ritmo × dias do período (a partir de agora) − o que já foi estudado nesse período, sem ultrapassar o orçamento. O ritmo é fixo: semanas sem estudo não se acumulam na semana atual.

A quota nunca é gravada (`prepMinutes` continua a ser só do estudante), o prazo continua a ser a data real ou nenhum (nunca «daqui a N dias» inventado) e a explicação mostra a conta, por exemplo «6 ECTS × 25 h − ~84 h de aulas = 66 h; 25 % → 16 h 30 até 31/01 ≈ 45 min/semana». As aulas sem disciplina associada (a importação nem sempre as liga) repartem-se pela fração de ECTS de cada disciplina, assinaladas com «~». Avaliações do tipo «Outra» (participação, assiduidade) não pedem sessões. Sem ECTS ou sem semestre, a avaliação fica «sem tempo de estudo» com a mensagem do que falta («Falta o ECTS de TDM — indica-o na disciplina»). O que não cabe na disponibilidade é falta de espaço, com aviso e números. Um tempo de estudo indicado pelo estudante tem prioridade e mantém o comportamento anterior.

**Valores por omissão** (`DEFAULT_PLANNER_PREFERENCES`, editáveis em `/preferencias`): sessões de 50 minutos (mínimo 25), pausa de 10 minutos e limite diário de 180 minutos. O horizonte é de 7 dias (máximo 28).

**Ciclo de vida:**

- Cada proposta é um `StudyPlan` em estado `DRAFT` que dura 30 minutos.
- Na confirmação, a proposta é revalidada contra o estado atual da base de dados: 409 `PLAN_STALE` se algo mudou, 410 `PLAN_EXPIRED` se expirou. As sessões que entretanto começaram ficam de fora, em vez de anularem a proposta. A transação começa por reclamar a proposta (`DRAFT` → `CONFIRMED`), para dois pedidos simultâneos não criarem as sessões duas vezes; no questionário, uma proposta que já não vale mostra «Gerar de novo».
- **Sessões protegidas:** concluídas, fixadas e a decorrer. Nunca são alteradas.
- **Sessões substituíveis:** planeadas, não fixadas e no futuro. Ao confirmar, passam a `CANCELLED`, ficando no histórico em vez de serem apagadas.
- Mover uma sessão à mão fixa-a, e o replaneamento respeita-a.

## Modo foco (spec §7.6)

- A `StudySession` regista o tempo real de estudo, com disciplina e sessão planeada opcionais.
- Presets 25/5, 50/10 e personalizado (5–180 minutos de foco, 0–60 de pausa), guardados em `targetMinutes` e `breakMinutes`.
- **Pausar e retomar no servidor:** `pausedAt` marca a pausa em curso e `pausedSeconds` acumula as anteriores. Por isso o estado sobrevive a uma atualização da página ou a uma mudança de dispositivo.
- O tempo de foco é a duração total menos as pausas. As estatísticas descontam as pausas em proporção, quando a sessão atravessa o limite do intervalo pedido.
- Ao atingir o objetivo, a interface sugere a pausa mas não termina a sessão. Isto é intencional: o utilizador decide quando parar.
- **«Começar agora»** no painel aceita a sugestão «O que estudar agora» (spec §11.7): uma sessão planeada inicia o foco ligado a ela (`plannedSessionId`, como «Começar foco» no plano); uma tarefa ou avaliação inicia o foco com a sua disciplina. Depois abre `/sessoes`. Se já houver uma sessão em curso, o 409 da regra «uma de cada vez» mostra-se com um link para essa sessão.

## Exportação para calendário (.ics)

`GET /api/me/calendar.ics` gera um ficheiro iCalendar (RFC 5545) com as sessões planeadas que ainda não acabaram (sem as retiradas), as avaliações com data e os prazos das tarefas por fazer, de hoje em diante. O botão «Exportar para o meu calendário» está na página Calendário.

- **Só descarga, sem subscrição:** o ficheiro exige a sessão e não existe URL pública com token. Um link de subscrição seria uma credencial ao portador para dados pessoais, que fica guardada em serviços de terceiros e não pode ser revogada sem uma tabela nova. O preço é que o ficheiro é uma cópia do momento: a interface di-lo.
- **Não fica guardado:** é gerado a pedido, com `Cache-Control: no-store`. A página de privacidade explica que o serviço onde for importado passa a ter uma cópia.
- **Gerador próprio** (`lib/ics-export.ts`) em vez do `ical.js`: controla o escape de TEXT, a dobra das linhas a 75 octetos sem partir caracteres UTF-8, o CRLF e o `VTIMEZONE` de Lisboa. O `ical.js` é usado nos testes como leitor independente.
- **Fuso:** as sessões levam `DTSTART;TZID=Europe/Lisbon` e o ficheiro inclui o `VTIMEZONE` com as regras da UE. Os testes leem o ficheiro com o `ical.js` e confirmam o mesmo instante antes e depois das duas mudanças de hora.
- **Dia inteiro** para avaliações e prazos: os formulários só pedem a data e a hora guardada (09:00 ou 23:59) é técnica. O dia é o dia civil de Lisboa.
- **Lembretes:** 30 minutos antes de cada sessão; na véspera às 09:00 nas avaliações e prazos.
- **UID estável** (`planned-session-<id>@studentos`, `assessment-<id>@studentos`, `task-<id>@studentos`): ao importar de novo, os calendários que respeitam o UID atualizam o evento em vez de o duplicar.

## Transferir disciplinas entre contas

Para um estudante passar os dados para outra conta sua (por exemplo, outro email) sem acesso direto à base de dados: a conta de origem gera um código de uso único (8 caracteres sem 0/O e 1/I, válido 30 minutos, guardado só em SHA-256 na tabela `DisciplineTransfer`); a conta de destino, com sessão iniciada, vê a pré-visualização e confirma. A transferência corre numa transação: as disciplinas mudam de `userId` (as avaliações acompanham), e também as tarefas, aulas, sessões planeadas e sessões de estudo ligadas a elas; as ligações a importações e propostas da conta de origem são cortadas. O semestre é emparelhado pelo nome ou criado com as mesmas datas. Uma disciplina com a mesma sigla no mesmo semestre bloqueia a transferência (sem gastar o código); itens importados que já existam no destino não são duplicados.

## Integrações (Moodle e Outlook)

- O contrato está em `apps/api/src/integrations/types.ts`:
  - `MoodleProvider` e `CalendarProvider`;
  - estados `NOT_CONFIGURED`, `PENDING_AUTHORIZATION`, `CONNECTED`, `SYNCING`, `ERROR` e `REAUTH_REQUIRED`.
- **Moodle (IPVC):** só por API ou funções formalmente autorizadas pelos Serviços de Informática, sem scraping nem cookies do browser. Sem essa autorização, o fornecedor real fica `NOT_CONFIGURED`. O `MockMoodleProvider` só existe com `NODE_ENV=test`, para testar o contrato. A alternativa disponível é a importação manual (CSV/ICS).
- **Outlook (Microsoft Graph):** não está implementado. Exige o registo de uma aplicação no Entra ID com `Calendars.Read` (só leitura) e uma chave para cifrar os tokens no servidor.
- `GET /api/integrations` nunca devolve `CONNECTED` sem uma verificação real bem-sucedida.

## IA generativa (spec §12)

Opcional e só para a conta de quem mantém o StudentOS (decisão do dono, 2026-10-26). O planeador e todos os cálculos continuam a funcionar sem IA; nas outras contas nada é enviado a fornecedores externos. Roteiro e decisões em [`decisoes-pendentes.md`](decisoes-pendentes.md) e no plano aprovado (documentos → assistente → quizzes com FSRS → finanças).

- **Acesso:** três condições, verificadas no servidor (`ai/access.ts`, `middleware/ai.ts`): email da sessão em `AI_ALLOWED_EMAILS`, `GEMINI_API_KEY` configurada e consentimento dado na página Integrações (data e versão em `User.aiConsentAt`/`aiConsentVersion`). Estados: `NOT_ALLOWED`, `NOT_CONFIGURED`, `NEEDS_CONSENT`, `ENABLED`. Uma conta fora da lista só vê `NOT_ALLOWED`.
- **Raciocínio:** os pedidos ao Gemini levam `thinkingLevel: "high"` (decisão do dono: qualidade antes da rapidez) e um tempo limite de 5 min. Há duas exceções com `"low"`, onde não há nada para raciocinar e o raciocínio só atrasava ([guia de raciocínio do Gemini](https://ai.google.dev/gemini-api/docs/thinking)). A primeira é a verificação de ligação. A segunda é a transcrição dos documentos: a leitura faz duas chamadas em paralelo, a transcrição com `"low"` e as datas e avaliações com `"high"`, e demora o mesmo que a mais lenta, não a soma. A leitura corre em segundo plano.
- **Fornecedor:** contrato `AiProvider` (`ai/provider.ts`) com uma implementação Gemini por `fetch` à API REST (`ai/gemini.ts`, sem SDK). A chave vai no cabeçalho `x-goog-api-key`, nunca no URL, em logs ou em respostas. Respostas estruturadas: esquema Zod → `z.toJSONSchema()` → `responseJsonSchema`, e a resposta é validada com o mesmo Zod. Erros do fornecedor viram erros da app (`AI_UNAVAILABLE`, `AI_RATE_LIMITED`, `AI_BLOCKED`, `AI_INVALID_RESPONSE`). Os testes usam um fornecedor falso.
- **Dados:** `StudyDocument`/`DocumentChunk` (texto; vetores de 768 dimensões normalizados, em `Float[]`), `DocumentFile` (ficheiros originais em bytea), `StudyCard`/`CardReview`/`Quiz` (estado FSRS), `FinanceCategory`/`FinanceTransaction`/`SavingsGoal`/`FinanceInsight` (cêntimos inteiros). Tudo por utilizador, com eliminação em cascata e na exportação (os vetores não, são derivados; dos ficheiros só os dados de cada um, não o conteúdo). A transferência de disciplinas não leva estes dados: ficam na conta de origem, sem a disciplina.
- **Documentos (passo 2):** `routes/documents.ts` e `ai/documents.ts`. A leitura corre em segundo plano: o `POST` responde 202 com o documento `PROCESSING` e a página atualiza-se a cada 3 s até `READY` ou `FAILED` (com o motivo em português). Uma leitura parada há mais de 15 min (servidor reiniciado ou adormecido a meio) passa a `FAILED` na leitura seguinte da lista. Fotografias (reduzidas a 2000 px e convertidas para JPEG no browser, `lib/files.ts`) ou PDF seguem em base64 para o Gemini, que devolve título, transcrição e propostas (avaliações e prazos com data, ou avaliações com peso, como nas fichas da UC). O esquema enviado é permissivo e cada proposta é validada no servidor (data real, hora, peso, nota mínima); o que não serve é descartado. Os ficheiros originais ficam em `DocumentFile` (bytea, apagados com o documento, até 300 MB por conta, 413 `DOCUMENT_STORAGE_FULL`), para a IA os voltar a ler; ficam também o texto, excertos de até 1500 caracteres com vetores (servem só para escolher os documentos certos) e as propostas por rever (`StudyDocument.proposals`, esvaziado ao confirmar). A confirmação segue o padrão da importação: pré-visualização editável, duplicados, validação no browser e no servidor, uma transação e reclamação atómica contra a dupla confirmação. A medição da ficha da UC usa o mesmo pedido: `npm run eval:fichas -- --extrator=gemini` (precisa da chave).
- **Assistente (passo 3):** `routes/assistant.ts` e `ai/assistant.ts`. Os excertos mais próximos escolhem até 3 documentos; a IA recebe os ficheiros originais desses documentos (`ai/document-parts.ts`, até 12 MB por pedido; sem ficheiro guardado, o texto) e cita o documento. Cada ficheiro vai uma vez para a Files API do Gemini e o endereço (válido 48 h, ligado a uma impressão da chave) fica em `DocumentFile`; as perguntas seguintes mandam só o endereço. Assim o conteúdo não sai do Neon em cada pergunta (o plano gratuito tem 5 GB de tráfego por mês e suspende a base de dados quando acaba). Se a Files API falhar, o ficheiro vai no próprio pedido. A pergunta (com a anterior, para seguimentos) vira um vetor; a busca exata em SQL (`unnest` dos dois vetores, produto interno) devolve os 6 excertos mais próximos da conta, só do mesmo modelo de vetores e, se pedido, da disciplina. O Gemini responde só com esses excertos, em JSON validado (`sufficient`, `answer`, `citations`); as fontes são os excertos citados ou marcados `[n]` que existem, e as marcas sem excerto saem do texto. Sem resposta suficiente ou sem fontes válidas, só a pergunta (sem a conversa) segue para o Gemini com a ferramenta `google_search`; a resposta vem marcada «Fonte web», com as fontes `https` e as sugestões de pesquisa da Google. Os termos obrigam a mostrá-las sem alterar nem emoldurar: ficam num shadow DOM (o CSS delas não toca na página), e as ligações abrem noutro separador por um handler, sem mexer no HTML. A conversa vive só no estado da página: não fica no servidor nem no `localStorage`. O consentimento tem versão (`AI_CONSENT_VERSION`): se o texto muda, a IA volta a `NEEDS_CONSENT` até a pessoa aceitar outra vez.
- **Quizzes e revisões (passo 4):** `ai/quiz.ts`, `lib/fsrs.ts` e `routes/quizzes.ts`. O quiz parte dos ficheiros originais (um documento, ou os 5 mais recentes de uma disciplina), para perguntar também sobre imagens, figuras e tabelas. O Gemini cria as perguntas em JSON validado (escolha múltipla com 2–6 opções e a certa dentro; resposta curta com critérios); as soluções só saem do servidor depois de corrigido. A escolha múltipla é corrigida pelo código; a resposta curta, no quiz, pela IA, de uma vez para todas (em branco é errada sem perguntar). Corrigir um quiz é a primeira revisão: cada pergunta passa a `StudyCard` com o estado do `ts-fsrs` (FSRS-6, MIT, fuzz desligado, portanto determinístico) e um `CardReview`. Nas revisões diárias não há IA: a escolha múltipla é corrigida no browser e a resposta curta é autoavaliada (errei, difícil, bem, fácil). Retenção pedida 0,90; 0,95 quando a disciplina tem uma avaliação nos 7 dias seguintes.
- **Finanças (passo 5):** `routes/finances.ts` e `ai/finance.ts`. Movimentos em cêntimos inteiros, data sem hora (`@db.Date`) e categoria criada pelo nome à primeira utilização; resumo do mês e dos 6 meses calculado no servidor. As dicas partem de `aggregateFinances` (função pura e testada): médias por mês dos últimos 3 meses completos com movimentos, despesas por categoria, taxa de poupança e objetivos só com valores e meses até ao prazo. Nada de notas, datas exatas ou nomes de objetivos; o ecrã mostra exatamente o que foi enviado. O pedido à IA limita-se a poupança e boas práticas: proíbe investimentos, créditos e marcas.
- **Pesquisa semântica:** busca exata no PostgreSQL (produto interno de vetores normalizados), sem extensão: funciona na BD local embutida e no Neon. Passa a pgvector + HNSW se o volume crescer (a BD local não tem a extensão).
- **Termos do Gemini:** no EEE os termos de dados dos serviços pagos aplicam-se também ao uso gratuito; oferecer a IA a outros utilizadores no EEE exigiria um projeto Google com faturação ([termos](https://ai.google.dev/gemini-api/terms)).

## Testes

| Camada            | Ferramenta                                    | O que cobre                                                                                                                                                                                                                                                                                          |
| ----------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared` | Vitest                                        | Médias e nota necessária; planeador (sobreposições, limite diário, prazos, determinismo, mudança de hora).                                                                                                                                                                                           |
| `apps/api`        | Vitest + Supertest, com a BD `studentos_test` | Autenticação e sessões, palavra-passe, limites de pedidos, isolamento (404), validação, importação, recorrência, planeador e sugestão, painel (fuso), modo foco e estatísticas, exportação `.ics` (formato, isolamento e fuso), IA e documentos (fornecedor falso).                                  |
| `apps/web`        | Vitest + Testing Library                      | Componentes críticos (simulador de notas, lista de tarefas, foco iniciado por «Começar agora», painel recolhível, carregamento das páginas) e regras do questionário de boas-vindas.                                                                                                                 |
| `e2e`             | Playwright + axe-core                         | Fluxo principal, questionário de boas-vindas até ao plano confirmado, página de entrada e cache, fluxo do planeador (spec §15.3), «Começar agora», exportação `.ics`, conta (mudar palavra-passe, eliminar), privacidade, alinhamento do calendário semanal e acessibilidade das páginas principais. |

## Frontend: entrada, boas-vindas e carregamento

- **Raiz `/`:** sem sessão, o `RequireAuth` mostra a página de entrada (`LandingPage`); as outras rotas privadas continuam a redirecionar para `/login`. Com sessão, `/` é o painel. O simulador da página de entrada usa o motor de `packages/shared` no browser: nenhum pedido além de `GET /api/me`.
- **Boas-vindas (`/boas-vindas`):** o registo navega para lá (dentro do `RequireAuth`, fora do `AppLayout`). Quatro passos que podem ser saltados e que gravam logo pelos endpoints existentes: `PATCH /api/semesters/:id` (datas), `POST /api/disciplines`, `POST /api/disciplines/:id/assessments` (modelos de pesos que somam 100 %) e `PUT /api/preferences/study` (janelas por dia × período); os compromissos fixos opcionais (trabalho, treino) viram `POST /api/schedule-blocks` semanais, `OTHER` e ocupados, até ao fim do semestre. O fim pede `POST /api/planner/preview` com 7 dias e só grava com `POST /api/planner/:id/confirm`. Não há estado do questionário no servidor nem no `localStorage`.
- **Versão nova:** um separador aberto antes de um deploy continua com o código antigo (e mostrava, por exemplo, «Documento lido» num documento ainda a ser lido). A API manda em cada resposta `X-App-Version` com o commit a correr (`RENDER_GIT_COMMIT`, que o Render define na build e em execução) e a web compara-o com o da sua build (`lib/appVersion.ts`); se forem diferentes, aparece «Há uma versão nova do StudentOS — Recarregar». Fora do Render não há versão e o aviso não aparece.
- **Carregamento:** as páginas da app são `React.lazy` (`lib/lazyPage.ts`), com uma recarga única se um ficheiro antigo deixar de existir depois de uma publicação. O Express serve `/assets/*` com `Cache-Control: immutable` de um ano (404 quando falta) e o `index.html` com `no-cache`. Nada disto evita o arranque a frio do Render gratuito, porque o próprio HTML vem do servidor. Para o tornar visível: qualquer pedido à API com mais de 3 s mostra «A ligar ao servidor…» (`lib/serverWake.ts`, `ServerWakeBanner`), e voltar a um separador escondido há 10+ minutos pede `/api/health` para acordar o servidor antes do primeiro clique.

## Deploy

- **Alojamento:** Render (serviço web) com Neon (PostgreSQL), ambos na UE. Ver [`../DEPLOY.md`](../DEPLOY.md).
- **Migrações:** são sempre aditivas e correm no arranque (`prisma migrate deploy`). Se uma migração falhar, o processo termina antes de servir pedidos e o deploy fica marcado como falhado.

## Diferenças em relação ao spec

| Spec                                                        | Implementação                                                                                              | Motivo                                                                                                                                               |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Argon2id                                                    | bcrypt com custo 12                                                                                        | O módulo nativo não compilava; `bcryptjs` é JavaScript puro.                                                                                         |
| `POST /api/study-sessions/:id/complete` e `/miss`           | `/api/planned-sessions/:id/complete` e `/miss`                                                             | `/api/study-sessions` regista o tempo real de foco; as sessões planeadas são outra entidade.                                                         |
| `POST /api/planner/confirm`                                 | `POST /api/planner/:id/confirm`                                                                            | Cada proposta tem identificador e é revalidada antes de ser aplicada.                                                                                |
| `GET/POST /api/assessments`                                 | `GET/POST /api/disciplines/:id/assessments` e `PATCH/DELETE /api/assessments/:id`                          | Uma avaliação pertence sempre a uma disciplina.                                                                                                      |
| Prazo com hora opcional                                     | Um prazo sem hora fica às 23:59, hora local                                                                | Assim, uma tarefa "para hoje" não aparece em atraso logo de manhã.                                                                                   |
| Rotas Outlook e Moodle                                      | Só `GET /api/integrations` (`NOT_CONFIGURED`)                                                              | Faltam credenciais da Microsoft e autorização do IPVC.                                                                                               |
| `POST /api/ai/study-assistance`                             | Não incluído                                                                                               | O spec põe a IA na prioridade 7.                                                                                                                     |
| Atalho «Ligar calendário» no painel (§7.1)                  | Atalho «Definir disponibilidade»                                                                           | As integrações ainda não estão disponíveis; um atalho para uma página «indisponível» engana. A disponibilidade é o que o planeador precisa primeiro. |
| Visual minimalista (§13)                                    | Interface clara com Liquid Glass só na navegação (2026-10-30; substitui o estilo Gentelella de 2026-10-25) | Pedido do dono do produto. Contrastes AA; ver [`design.md`](design.md). Conversa com o docente pendente.                                             |
| Prioridade no plano (§11.4)                                 | Nível chamado «Urgência»                                                                                   | Evita dois significados para «prioridade» no mesmo ecrã.                                                                                             |
| Aceitar a sugestão «para a transformar numa sessão» (§11.7) | «Começar agora» inicia uma sessão de foco (`StudySession`), ligada à sessão planeada quando existe         | Quem aceita a sugestão quer estudar já; uma sessão planeada nova teria de passar pela proposta e confirmação do planeador.                           |
