---
title: "StudentOS — Manual de Implementação para Claude Code"
subtitle: "Especificação funcional, arquitetura técnica e plano de execução"
author: "Documento de trabalho do projeto StudentOS"
date: "16 de outubro de 2026"
lang: pt-PT
---

# Índice

1. Mandato para o Claude Code
2. Visão do produto e princípios
3. Utilizadores e percursos principais
4. Âmbito e prioridades
5. Arquitetura e tecnologia
7. Modelo de dados
8. Funcionalidades e experiência de utilização
9. Importação de horários e dados académicos
10. Integração autorizada com Moodle do IPVC
11. Integração com Outlook / Microsoft Graph
12. Motor determinístico de planeamento de estudo
13. Utilização segura de IA generativa
14. Contratos da API REST
15. Segurança, privacidade e proteção de dados
16. Testes e critérios de aceitação
17. Plano de implementação por fases
18. Configuração local e variáveis de ambiente
19. Tratamento de erros e resolução de problemas
20. Definição de concluído e entrega final
21. Prompt operacional para iniciar Claude Code
22. Referências técnicas oficiais

# Como utilizar este manual

> **Objetivo:** servir como fonte principal de requisitos para Claude Code. A ferramenta deve analisar o repositório existente, construir a aplicação de forma incremental e testável e explicar as decisões importantes. Este documento descreve o resultado pretendido; não presume que as integrações externas já estejam autorizadas ou configuradas.

1. Colocar este ficheiro Markdown na raiz do repositório como `STUDENTOS_IMPLEMENTATION_SPEC.md`.
2. Colocar também o ficheiro `CLAUDE.md` fornecido com este documento na raiz do projeto.
3. Abrir o repositório com Claude Code e pedir-lhe que leia ambos os ficheiros antes de editar o código.
4. Permitir que trabalhe por fases. A aplicação só deve avançar para a fase seguinte quando a fase atual compilar, os testes passarem e os critérios de aceitação estiverem demonstrados.

Este manual distingue **requisitos obrigatórios**, **decisões técnicas recomendadas** e **funcionalidades futuras**. Não é permitido tratar uma integração externa como funcional só porque existe um botão ou um ecrã de configuração.

# 1. Mandato para o Claude Code

## 1.1. Papel esperado

Atua como engenheiro de software sénior responsável por construir StudentOS com código legível, arquitetura compreensível, segurança desde o início e explicações adequadas a um estudante de Tecnologias e Programação de Sistemas de Informação.

Não te limites a produzir uma proposta ou a explicar o que o utilizador poderia fazer. Sempre que o repositório e o ambiente permitam, **implementa o passo concreto**, executa os testes e apresenta os resultados reais. Se faltar uma credencial, serviço externo ou aprovação institucional, implementa o contrato, o modo simulado e a documentação, mas identifica claramente o que ainda depende de terceiros.

## 1.2. Protocolo obrigatório antes de alterar ficheiros

1. Inspeciona o repositório completo: estrutura, `package.json`, scripts, ficheiros de configuração, componentes, rotas, estilos, testes, migrações e alterações locais já existentes.
2. Identifica o que já está funcional. Não apagues nem reescrevas o trabalho existente sem necessidade demonstrada.
3. Compara o estado atual com este manual e apresenta um plano curto com a primeira fase, os ficheiros que prevê alterar e os riscos relevantes.
4. Confirma as versões instaladas e consulta a documentação oficial correspondente antes de utilizar APIs ou opções de configuração que possam ter mudado.
5. Implementa a menor unidade vertical que produza um resultado funcional — interface, API, persistência e teste quando aplicável — em vez de criar muitos ficheiros vazios.

## 1.3. Regras de execução

- Trabalha por fases e mantém a aplicação executável no final de cada fase.
- Usa TypeScript em modo estrito e evita `any`; quando uma exceção for inevitável, documenta-a.
- Reutiliza componentes e estilos existentes quando forem adequados.
- Não inventes resultados de testes, dados importados, permissões Moodle, tokens, consentimentos ou sincronizações.
- Não peças ao utilizador para colocar palavras-passe institucionais, tokens ou segredos diretamente no chat. Usa variáveis de ambiente e explica a configuração local segura.
- Não contornes proteções do IPVC, não automatizes scraping do Moodle autenticado e não reutilizes cookies da sessão do browser. Usa apenas APIs e mecanismos autorizados.
- Não exponhas segredos no frontend, em `localStorage`, no Git, em logs, em screenshots ou nas mensagens de erro.
- Não substituas funcionalidades reais por dados fictícios silenciosamente. Os dados de demonstração têm de estar identificados e isolados do modo normal.
- Não adiciones uma dependência só por conveniência sem explicar por que é necessária e confirmar compatibilidade com a stack instalada.
- Quando um serviço externo não estiver configurado, mostra `Não configurado`, `A aguardar autorização` ou `Indisponível`; nunca mostres `Ligado` sem uma verificação bem-sucedida.
- Depois de cada fase, executa lint, verificação de tipos, testes e build relevantes; corrige as falhas introduzidas antes de continuar.
- Se o projeto existente divergir deste manual por uma boa razão técnica, documenta a divergência antes de fazer uma mudança estrutural.

## 1.4. Formato do relatório de cada fase

No fim de cada fase, apresenta:

- funcionalidades implementadas;
- decisões técnicas relevantes e respetiva justificação;
- principais ficheiros criados ou alterados;
- comandos executados e resultado real de lint, tipos, testes e build;
- configuração manual ainda necessária;
- limitações conhecidas e próxima fase proposta.

# 2. Visão do produto e princípios

## 2.1. Objetivo do StudentOS

StudentOS é uma aplicação web que centraliza a organização académica. Deve permitir ao estudante saber o que tem de fazer, quando deve estudar, quanto tempo tem disponível e que atividades merecem prioridade. O sistema deve reduzir trabalho manual através da importação de horários e da sincronização autorizada com calendários e plataformas académicas.

A experiência desejada é: **o estudante importa o horário, regista ou sincroniza os testes e trabalhos, define as suas disponibilidades e o StudentOS propõe um plano semanal realista; à medida que conclui ou falha sessões, o plano adapta-se.**

## 2.2. Princípios essenciais

1. **Dados fiáveis antes de IA:** horários, prazos, conflitos e durações devem ser tratados por código determinístico e testável. A IA pode explicar ou apoiar, mas não pode inventar factos nem ignorar restrições.
2. **Integração autorizada:** cada conector funciona apenas com os métodos e as permissões concedidos pelo serviço de origem.
3. **Importação com confirmação:** qualquer importação de ficheiros mostra uma pré-visualização editável antes de gravar dados.
4. **Controlo do estudante:** é possível corrigir, apagar, exportar e desligar fontes de dados. A aplicação explica o que será lido e porquê.
5. **Privacidade por defeito:** recolher o mínimo necessário; nunca pedir a palavra-passe do Moodle para a guardar no StudentOS.
6. **Explicabilidade:** o utilizador percebe por que razão uma sessão foi marcada para uma determinada disciplina.
7. **Acessibilidade e responsividade:** interfaces funcionais em computador, tablet e telemóvel, navegáveis por teclado e com estados visíveis.
8. **Execução incremental:** primeiro uma aplicação robusta; depois integrações e IA, sem bloquear a base do produto por depender de serviços externos.
9. **Sem falsa automação:** não anunciar importação, sincronização, notificações ou funcionalidades que ainda não estão implementadas.

## 2.3. O que não é objetivo inicial

- Substituir o Moodle, Outlook ou o sistema académico do IPVC.
- Aceder a notas ou conteúdos que o estudante não pode consultar diretamente.
- Alterar notas, submeter trabalhos ou escrever no Moodle.
- Criar um sistema social completo, chat entre estudantes ou aplicação móvel nativa no MVP.
- Fazer a IA decidir sozinha sobre dados académicos, marcar avaliações como realizadas ou apagar sessões.
- Garantir uma nota, aprovação ou resultado académico.

# 3. Utilizadores e percursos principais

## 3.1. Perfil-alvo

Estudantes do ensino superior, inicialmente com terminologia adequada ao IPVC e ao curso TPSI, mas sem codificar o produto de modo a só funcionar com uma instituição. A língua padrão é português de Portugal (`pt-PT`), a semana começa à segunda-feira, as datas aparecem em formato local e os horários usam o fuso `Europe/Lisbon`.

## 3.2. Percurso A — primeiro acesso

1. O estudante cria uma conta ou inicia sessão.
2. Define preferências simples: dias/horas disponíveis para estudo, duração preferida da sessão, pausas e objetivo académico opcional.
3. Cria disciplinas manualmente ou importa-as através de uma fonte autorizada.
4. Importa um horário ou liga o Outlook/Moodle, quando disponível.
5. Revê as informações detetadas antes de as confirmar.
6. Vê um painel inicial que diferencia claramente dados reais de exemplos de demonstração.

## 3.3. Percurso B — organizar uma semana

1. O estudante vê aulas, eventos, avaliações, tarefas e sessões previstas num calendário.
2. O motor calcula janelas livres, excluindo aulas e eventos ocupados.
3. O motor cria um plano que respeita prioridades, prazos, duração máxima diária e preferências.
4. O estudante pode aceitar, editar, mover, fixar ou rejeitar uma sessão.
5. Se uma sessão for falhada ou uma tarefa concluída, o motor volta a planear apenas o futuro afetado.

## 3.4. Percurso C — sincronizar Moodle/Outlook

1. O estudante escolhe `Ligar` ou `Sincronizar` numa área de integrações.
2. A aplicação explica os dados e permissões pedidos.
3. O utilizador é encaminhado para o serviço oficial de autenticação, quando suportado.
4. O backend valida a resposta e testa o acesso real.
5. A interface mostra o estado, a última sincronização, o resultado e os erros recuperáveis.
6. O utilizador pode atualizar ou desligar a ligação e apagar os dados importados dessa origem, respeitando o histórico que escolher conservar.

# 4. Âmbito e prioridades

As prioridades abaixo são obrigatórias para evitar que a implementação comece pela IA antes de existir uma base fiável.

- **P0 — Fundação**  
  **Área:** repositório, configuração, autenticação, base de dados, validação e layout base.  
  **Resultado exigido:** aplicação inicializável, segura e testável.
- **P1 — MVP académico**  
  **Área:** disciplinas, tarefas, avaliações/notas, dashboard, calendário básico e sessões de estudo.  
  **Resultado exigido:** o utilizador consegue organizar a vida académica sem integrações.
- **P2 — Importação**  
  **Área:** CSV e ICS, pré-visualização, validação e deteção de duplicados.  
  **Resultado exigido:** horário importado com confirmação manual.
- **P3 — Integrações**  
  **Área:** Outlook read-only e adaptador Moodle condicionado pela autorização do IPVC.  
  **Resultado exigido:** estados reais, sincronização auditável e modo simulado.
- **P4 — Planeador**  
  **Área:** disponibilidade, geração de sessões, prioridades e reagendamento.  
  **Resultado exigido:** plano determinístico sem conflitos.
- **P5 — IA**  
  **Área:** explicações, assistência ao planeamento e extração assistida de PDF/imagem.  
  **Resultado exigido:** IA opcional e validada, sem alterar as regras determinísticas.
- **P6 — Qualidade/produção**  
  **Área:** acessibilidade, testes E2E, monitorização, cópias de segurança e deployment.  
  **Resultado exigido:** versão documentada e recuperável.
- **Futuro**  
  **Área:** Google Calendar, colaboração, notificações externas avançadas e aplicação móvel nativa.  
  **Condição:** só após demonstrar valor e estabilidade das fases anteriores.

Não desenvolver todas as fases simultaneamente. Cada prioridade deve ter uma definição de concluído e ser validada antes da seguinte.

# 5. Arquitetura e tecnologia

## 5.1. Stack recomendada

Usar versões estáveis e compatíveis no momento da implementação, registando as versões exatas no lockfile. Não copiar números de versão antigos deste ou de outro documento.

- **Frontend** — **Tecnologia:** React + TypeScript + Vite. **Responsabilidade:** interface de utilizador.
- **Estilos** — **Tecnologia:** Tailwind CSS e componentes acessíveis reutilizáveis. **Responsabilidade:** sistema visual consistente.
- **Rotas frontend** — **Tecnologia:** React Router ou alternativa já adotada no projeto. **Responsabilidade:** navegação entre páginas.
- **Dados frontend** — **Tecnologia:** TanStack Query ou padrão equivalente já instalado. **Responsabilidade:** cache, loading, erros e invalidação.
- **Formulários** — **Tecnologia:** React Hook Form + Zod ou alternativa equivalente. **Responsabilidade:** formulários tipados e validação.
- **Backend** — **Tecnologia:** Node.js LTS + Express + TypeScript. **Responsabilidade:** API REST e regras de negócio.
- **Validação API** — **Tecnologia:** Zod ou biblioteca equivalente. **Responsabilidade:** validar pedidos e respostas externas.
- **Persistência** — **Tecnologia:** PostgreSQL. **Responsabilidade:** dados relacionais e integridade.
- **ORM** — **Tecnologia:** Prisma, usando a versão estável compatível com PostgreSQL. **Responsabilidade:** acesso à base de dados e migrações.
- **Sessões** — **Tecnologia:** sessões do lado do servidor com cookie seguro. **Responsabilidade:** autenticação da aplicação.
- **Testes** — **Tecnologia:** Vitest, Testing Library, Supertest e Playwright. **Responsabilidade:** testes unitários, integração, UI e E2E.
- **Qualidade** — **Tecnologia:** ESLint, Prettier e TypeScript strict. **Responsabilidade:** consistência e prevenção de erros.
- **CI** — **Tecnologia:** GitHub Actions ou mecanismo existente. **Responsabilidade:** verificações automáticas a cada alteração.

Se o repositório já tiver uma stack funcional diferente, não migres sem justificação. Primeiro faz uma avaliação de custo/benefício e propõe a alteração.

## 5.2. Monorepo sugerido

```text
studentos/
├── apps/
│   ├── web/                 # React + TypeScript + Vite
│   └── api/                 # Express + TypeScript
├── packages/
│   └── shared/              # Tipos/contratos partilhados quando útil
├── docs/
│   ├── STUDENTOS_IMPLEMENTATION_SPEC.md
│   ├── ARCHITECTURE.md
│   └── API.md
├── prisma/                  # Se o schema for centralizado na raiz
├── .github/workflows/
├── .env.example
├── .gitignore
├── package.json
├── pnpm-workspace.yaml
├── CLAUDE.md
└── README.md
```

A localização de `prisma/` pode ficar em `apps/api/prisma/` se isso simplificar o deploy. Escolhe uma das opções, documenta-a e não mantenhas esquemas duplicados.

## 5.3. Fronteiras arquiteturais

- A interface nunca fala diretamente com PostgreSQL, Moodle ou Microsoft Graph.
- O backend valida todos os inputs, verifica a sessão e aplica autorização por utilizador.
- O módulo de planeamento não depende diretamente de um fornecedor de IA.
- Os conectores externos convertem dados para um modelo interno normalizado.
- A lógica de domínio não fica presa a componentes React ou a controllers Express.
- A implementação usa variáveis de ambiente para URLs, chaves e segredos.
- O modo de demonstração e o modo de produção têm configurações e dados claramente separados.

## 5.4. Módulos sugeridos no backend

```text
apps/api/src/
├── app.ts
├── server.ts
├── config/
├── middleware/              # sessão, autorização, erros, rate limit
├── modules/
│   ├── auth/
│   ├── users/
│   ├── disciplines/
│   ├── tasks/
│   ├── assessments/
│   ├── calendar/
│   ├── imports/
│   ├── integrations/
│   │   ├── outlook/
│   │   └── moodle/
│   ├── planner/
│   └── ai/
├── services/
├── repositories/            # apenas se acrescentarem valor claro
├── lib/
└── tests/
```

Cada módulo deve separar, conforme a sua complexidade, schemas de validação, rotas/controllers, serviços de domínio e acesso à persistência. Evitar controllers gigantes e abstrações sem uso real.

# 6. Modelo de dados

O esquema definitivo deve ser criado por migrações controladas, com chaves estrangeiras, índices e restrições de integridade. A lista seguinte é a referência funcional; ajusta os campos técnicos à versão do Prisma instalada.

## 6.1. Entidades principais

### User

- `id`: identificador interno.
- `email`: único, normalizado e validado.
- `passwordHash`: nullable apenas se existir um método alternativo de autenticação devidamente implementado.
- `displayName`: nome mostrado na interface.
- `timezone`: padrão `Europe/Lisbon`, editável.
- `locale`: padrão `pt-PT`.
- `createdAt`, `updatedAt`, `lastLoginAt`.
- Preferências de notificações e de estudo devem ficar numa entidade de preferências se isso mantiver o modelo mais claro.

### Discipline

- `id`, `userId`, `name`, `code` opcional, `color` opcional, `description` opcional, `createdAt`, `updatedAt`.
- Uma disciplina pertence a um utilizador no modelo privado inicial.
- Se vier do Moodle, guardar `provider` e `externalId` para relacionar sincronizações.

### Task

- `id`, `userId`, `disciplineId` opcional, `title`, `description` opcional.
- `dueAt` opcional; se houver apenas uma data sem hora, guardar essa intenção sem criar uma hora arbitrária.
- `estimatedMinutes`, `priority`, `status`, `completedAt` opcional.
- `origin`: `MANUAL`, `IMPORT`, `MOODLE` ou outro valor controlado.
- `externalId` opcional e `sourceConnectionId` opcional.
- Criar índices para `userId`, `status`, `dueAt` e disciplina conforme as consultas.

### Assessment

- `id`, `userId`, `disciplineId`, `title`, `type`, `scheduledAt` opcional, `weightPercent` opcional, `maxGrade` por defeito 20, `achievedGrade` opcional.
- Validar que notas e pesos estão dentro dos limites aplicáveis.
- Não calcular uma média final até existir informação suficiente e uma regra de cálculo definida.
- A média ponderada só deve considerar avaliações com nota e pesos válidos; indicar os dados em falta e os casos em que o cálculo não é conclusivo.

### ScheduleBlock / AcademicEvent

Representa aulas recorrentes ou eventos concretos. Se for necessário modelar regras de repetição, não expandir séries infinitamente; guardar a regra e gerar ocorrências no intervalo pedido.

Campos conceptuais: `id`, `userId`, `title`, `kind`, `startAt`, `endAt`, `timezone`, `isBusy`, `origin`, `externalId`, `sourceConnectionId`, `recurrenceRule` opcional, `createdAt`, `updatedAt`.

Aulas recorrentes e ocorrências importadas devem ser distinguíveis de eventos isolados para que uma alteração de uma ocorrência não destrua a regra semanal.

### AvailabilityRule

- `id`, `userId`, `weekday`, `startMinute`, `endMinute`, `availableForStudy`, `validFrom` opcional, `validUntil` opcional.
- Guardar limites diários e preferências gerais em `StudyPreferences` quando necessário.
- Validar que a hora de fim é posterior à de início e que as regras não são impossíveis.

### StudyPlan e StudySession

`StudyPlan` regista o período planeado, versão, estado e data de geração. `StudySession` regista o bloco de estudo com `startAt`, `endAt`, `plannedMinutes`, `actualMinutes` opcional, estado, tarefa/avaliação associada e razão da recomendação. Estados sugeridos: `PLANNED`, `IN_PROGRESS`, `COMPLETED`, `MISSED`, `CANCELLED`.

Uma sessão concluída nunca é apagada nem movida pelo mecanismo de reagendamento automático. As sessões editadas/fixadas manualmente devem manter essa preferência na replanificação.

### IntegrationConnection

- `id`, `userId`, `provider` (`OUTLOOK`, `MOODLE`), `status`, `connectedAccountLabel` não sensível.
- `scopesGranted`, `lastSyncAt`, `lastSyncStatus`, `lastErrorCode` sem segredos.
- Tokens e caches devem ser guardados apenas quando necessários e cifrados no servidor. Não expor tokens em endpoints de frontend nem em logs.
- Guardar o método de autenticação e a versão do conector para facilitar migrações.

### ImportJob

- `id`, `userId`, `kind`, `status`, `originalFilename` apenas para apresentação, `createdAt`, `expiresAt`, contagens de itens, erros e avisos.
- Estados: `UPLOADED`, `PARSED`, `NEEDS_REVIEW`, `CONFIRMED`, `FAILED`, `EXPIRED`.
- O ficheiro original deve ter retenção curta e ser eliminado quando deixar de ser necessário. Não guardar bytes indefinidamente por defeito.

### AiPreference / PlanningPreference

Guardar consentimento e preferências relevantes: fornecedor ativo, uso de IA ligado/desligado, duração habitual de sessões, pausas, dias disponíveis, limite diário, nível de detalhe e objetivo de estudo opcional. Não colocar chaves API por utilizador em texto simples.

## 6.2. Regras de integridade

- Todas as entidades privadas têm `userId` direto ou uma relação verificável com um recurso do utilizador.
- Cada query privada filtra o recurso pelo utilizador autenticado; um ID difícil de adivinhar não substitui autorização.
- Impedir duplicados externos com uma restrição composta adequada, por exemplo `(userId, provider, externalId)` quando o ID existe.
- Datas são persistidas de forma inequívoca; no backend usar instantes normalizados e apresentar com o fuso do utilizador.
- Usar transações para operações que criem várias entidades relacionadas.
- Criar migrações repetíveis e seguras; nunca fazer alterações manuais ao schema de produção sem migração controlada.

# 7. Funcionalidades e experiência de utilização

## 7.1. Dashboard

Mostrar, no mínimo:

- boas-vindas e data atual;
- próximas aulas e avaliações;
- tarefas atrasadas, próximas e concluídas;
- plano de estudo de hoje;
- progresso semanal;
- acesso rápido a `Adicionar tarefa`, `Importar horário`, `Ligar calendário` e `Planear semana`.

Não encher o dashboard de gráficos decorativos. Cada cartão precisa de uma ação ou informação útil. Se ainda não houver dados, mostrar um estado vazio com uma ação clara, não números inventados.

## 7.2. Disciplinas

Criar, consultar, editar e arquivar/eliminar disciplinas. Mostrar tarefas, avaliações e progresso relacionados. Antes de apagar uma disciplina com conteúdo associado, explicar as consequências e pedir confirmação; preferir arquivar quando a eliminação pudesse apagar histórico importante.

## 7.3. Tarefas

Operações CRUD, filtros por disciplina/estado/prioridade/prazo, pesquisa, estimativa de duração, conclusão e histórico básico. A aplicação deve distinguir tarefas manuais de tarefas importadas e indicar a fonte. A sincronização nunca deve apagar alterações manuais sem uma política explícita.

## 7.4. Avaliações e simulador de notas

Registar testes, exames, trabalhos avaliados, data e ponderação. Disponibilizar cálculo de médias e simulação da nota necessária em avaliações futuras, mas exibir as premissas utilizadas. Detetar pesos em falta ou soma de pesos inconsistente; não fingir que existe uma média definitiva quando os dados são insuficientes.

## 7.5. Calendário

Vistas semanal, diária e mensal ou uma seleção equivalente simples. Diferenciar visualmente aulas, eventos externos, avaliações, prazos e sessões de estudo. O calendário deve indicar a origem e apresentar conflitos. Usar o fuso `Europe/Lisbon` como valor inicial e respeitar as alterações de fuso horário de cada utilizador.

## 7.6. Modo de foco

Temporizador de estudo com presets editáveis, por exemplo 25/5 e 50/10. Permitir iniciar, pausar, terminar e registar a sessão real. Não perder silenciosamente o estado se o utilizador atualizar a página. As sessões do temporizador alimentam estatísticas, mas não alteram notas nem concluem automaticamente a tarefa associada.

## 7.7. Preferências

Permitir definir disponibilidade, pausas, duração preferida, limite de estudo por dia, dias de descanso, objetivos e preferências de integração/IA. Uma preferência não é uma obrigação: o plano deve explicar quando não foi possível cumpri-la.

## 7.8. Estados de interface

Todas as páginas com dados remotos têm estados explícitos de carregamento, vazio, sucesso, erro recuperável e falta de autorização. Mensagens para o utilizador devem ser claras e em português de Portugal; detalhes técnicos completos ficam nos logs do servidor sem segredos.

# 8. Importação de horários e dados académicos

## 8.1. Ordem de implementação

1. CSV com cabeçalhos selecionáveis e pré-visualização.
2. Ficheiros `.ics` (iCalendar), mantendo recorrências e fusos horários sempre que a biblioteca utilizada suportar esse formato corretamente.
3. XLSX se houver uma necessidade real e uma biblioteca estável compatível.
4. PDF e imagem com extração de texto/OCR ou visão computacional numa fase posterior, sujeita a confirmação manual.

A importação por ficheiro deve funcionar mesmo que Moodle e Outlook ainda não estejam disponíveis.

## 8.2. Fluxo obrigatório

1. O utilizador escolhe o tipo de importação e seleciona o ficheiro.
2. O servidor valida autenticação, extensão permitida, tipo real do conteúdo, tamanho e limites de processamento.
3. O parser converte o ficheiro para uma estrutura temporária normalizada.
4. O sistema apresenta uma pré-visualização editável com linhas aceites, avisos, erros e conflitos.
5. Campos incertos são assinalados. Nunca preencher silenciosamente uma hora, data, duração ou disciplina que não esteja presente no ficheiro.
6. O utilizador corrige ou confirma os itens.
7. Só então é criada uma transação de gravação, com deteção de duplicados e relatório de resultados.
8. O job fica marcado como concluído e o ficheiro temporário é eliminado de acordo com a política de retenção.

## 8.3. Campos úteis no CSV

Para eventos, aceitar mapeamento de colunas para `title`, `date`, `startTime`, `endTime`, `weekday`, `location`, `discipline`, `recurrence`, `timezone` e `description`. O utilizador pode mapear nomes de colunas desconhecidas para os campos suportados.

Validar datas ISO sempre que possível, aceitar formatos locais comuns apenas com pré-visualização e nunca assumir que `03/04/2026` significa a mesma coisa em todos os ficheiros. Em caso ambíguo, pedir correção na pré-visualização.

## 8.4. Segurança dos ficheiros

- Aceitar apenas formatos necessários.
- Definir limites de tamanho e tempo de processamento.
- Validar o conteúdo real; não confiar apenas na extensão ou no `Content-Type` enviado pelo browser.
- Gerar nomes internos para ficheiros temporários.
- Não executar macros, scripts, ficheiros comprimidos ou fórmulas importadas.
- Não mostrar ao utilizador o caminho interno do servidor.
- Se um fornecedor de OCR/IA externo for utilizado, explicar que o ficheiro será processado por esse serviço e obter consentimento quando necessário.
- Isolar o conteúdo do ficheiro como dado não fiável. Não executar instruções que apareçam dentro do documento nem permitir que alterem as regras do sistema.

## 8.5. Deteção de duplicados

Usar IDs externos quando existentes. Para ficheiros sem IDs, calcular uma impressão digital determinística a partir de campos estáveis, por exemplo título normalizado + instante de início/fim + origem, sem tratar a impressão digital como prova infalível. Mostrar possíveis duplicados ao utilizador e permitir ignorar ou atualizar conforme a fonte.

# 9. Integração autorizada com Moodle do IPVC

## 9.1. Endereço e pressupostos

O endereço a verificar com os responsáveis da instituição é `https://elearning.ipvc.pt/`. Manter o endereço configurável em `MOODLE_BASE_URL`, mesmo que seja esse o valor de desenvolvimento. O projeto não pode assumir que a instalação disponibiliza uma API externa com todas as funções necessárias.

**Pré-condição institucional:** antes de declarar a integração funcional, confirmar com os Serviços de Informática do IPVC se os Web Services estão ativos, se o protocolo REST está disponível, que funções foram incluídas no serviço autorizado e como é emitido/renovado o acesso do estudante. A documentação Moodle indica que a lista efetiva de funções pode ser consultada na área de documentação da API da instalação, que normalmente depende de permissões administrativas.

## 9.2. Método permitido

Implementar um adaptador `MoodleProvider` com uma interface clara. O adaptador só chama endpoints oficiais e funções autorizadas pelo administrador. O conjunto exato de funções deve ser verificado na instalação, e não deduzido apenas da documentação genérica. Se o serviço não estiver configurado, o adaptador responde com um estado controlado, como `NOT_CONFIGURED`.

Funções candidatas a investigar, sem pressupor disponibilidade, incluem a consulta de informação do serviço, cursos do utilizador, calendário e atividades/entregas. Validar os nomes e capacidades na documentação da instalação antes de usar cada função.

## 9.3. Requisitos de autenticação e autorização

- Preferir um fluxo oficial, autorizado e individual por estudante, se suportado pelo IPVC.
- Não pedir nem guardar a palavra-passe institucional do Moodle.
- Não usar cookies copiados do browser, scraping autenticado, endpoints privados não documentados ou métodos que contornem permissões.
- Não pedir ao estudante para gerar tokens através de menus administrativos a que não tem direito.
- Caso o IPVC só autorize um serviço institucional limitado, cumprir exatamente o âmbito concedido e explicar que dados são partilhados.
- Guardar credenciais/tokens apenas no backend, cifrados e com acesso mínimo. Nunca devolver um token ao frontend depois da configuração.
- Se a credencial expirar ou for revogada, indicar que é necessário reconectar; não continuar a declarar a ligação ativa.

## 9.4. Dados iniciais a sincronizar

Prioridade de leitura:

1. informação básica do utilizador necessária para confirmar a ligação;
2. disciplinas/cursos em que está inscrito, se permitido;
3. atividades avaliáveis e prazos, se permitido;
4. eventos de calendário, se expostos pelo serviço autorizado;
5. conteúdos/documentos apenas numa fase posterior e apenas quando necessário e autorizado.

Não ler ou armazenar mensagens, fóruns, notas detalhadas, ficheiros ou dados de terceiros sem necessidade clara e autorização apropriada.

## 9.5. Estrutura recomendada do adaptador

```ts
export type IntegrationStatus =
  | "NOT_CONFIGURED"
  | "PENDING_AUTHORIZATION"
  | "CONNECTED"
  | "SYNCING"
  | "ERROR"
  | "REAUTH_REQUIRED";

export interface MoodleProvider {
  checkConnection(): Promise<{ ok: boolean; capabilities: string[] }>;
  getCourses(): Promise<NormalizedDiscipline[]>;
  getActivities(range: DateRange): Promise<NormalizedAcademicTask[]>;
  getCalendarEvents(range: DateRange): Promise<NormalizedCalendarEvent[]>;
}
```

Os nomes dos tipos e dos métodos podem ser ajustados ao código real, mas o princípio deve ser mantido: a aplicação depende de um contrato interno estável, não de chamadas Moodle dispersas por várias páginas.

## 9.6. Modo de desenvolvimento e falha segura

Criar um `MockMoodleProvider` apenas para testes e demonstrações. O mock deve ser identificável no código e na interface de administração. Não pode declarar sincronização real. O modo real deve exigir `MOODLE_BASE_URL` validado e as credenciais/configuração autorizadas. Quando não houver acesso institucional, continuar com importação CSV/ICS e permitir ao utilizador criar dados manualmente.

## 9.7. Sincronização e conflitos

- Mostrar data/hora da última tentativa e do último sucesso.
- Distinguir erros de rede, autenticação, permissões, limite de pedidos e dados inválidos.
- Fazer pedidos com timeout, tratar paginação e respeitar os limites do servidor.
- Deduplicar pelos IDs da origem sempre que existam.
- Definir a política de conflito: dados importados podem ser atualizados pela fonte original, mas campos alterados manualmente pelo estudante não devem ser substituídos sem regra explícita.
- Registar contagens: itens novos, atualizados, ignorados e falhados.
- Nunca apagar em massa os dados locais só porque uma sincronização devolveu uma resposta incompleta.

# 10. Integração com Outlook / Microsoft Graph

## 10.1. Objetivo inicial

A primeira versão do conector Outlook é **read-only**: importar eventos do calendário e usar esses eventos como blocos ocupados no planeador. Criar ou alterar eventos na conta do estudante é uma funcionalidade posterior, separada e opcional.

## 10.2. Registo e autenticação

- Registar uma aplicação no Microsoft Entra apenas quando o programador tiver acesso ao tenant necessário.
- Usar uma biblioteca Microsoft suportada para autenticação; evitar construir manualmente o protocolo OAuth a partir de pedidos HTTP de baixo nível.
- Para uma aplicação web com backend, usar o fluxo de código de autorização apropriado e aplicar `state`, validação de redirecionamento e as proteções exigidas pela biblioteca/protocolo. Se for SPA, seguir as instruções específicas para Authorization Code + PKCE e não utilizar segredos de cliente no browser.
- O `redirect URI` deve corresponder exatamente ao valor registado.
- A autenticação institucional pode estar sujeita a consentimento do utilizador, aprovação do administrador ou política do tenant.

## 10.3. Permissões mínimas

Começar pela permissão delegada menos privilegiada que satisfaça a função pretendida, considerando `Calendars.ReadBasic` para ler os campos básicos ou `Calendars.Read` se a aplicação precisar de mais dados. Não pedir `Calendars.ReadWrite` na primeira versão. Só adicionar escrita no Outlook se existir um caso de uso real, consentimento explícito e fluxo testado.

A aplicação deve explicar a razão de cada permissão no ecrã de ligação. O consentimento para ler o calendário não significa consentimento para escrever nele.

## 10.4. Sincronização

- Obter eventos por intervalo temporal explícito, começando com um horizonte configurável (por exemplo, 90 dias antes e 180 dias depois).
- Tratar eventos recorrentes, exceções, eventos cancelados, paginação, fusos horários e alterações de horário de verão.
- Guardar o ID externo e a data de atualização para evitar duplicados.
- Quando suportado pelo endpoint escolhido, usar o mecanismo de delta da Microsoft Graph para sincronizar alterações de forma incremental, preservando e validando o estado de sincronização devolvido pela API.
- Uma primeira sincronização completa e as seguintes sincronizações incrementais devem ser testadas separadamente.
- Tratar `429` e `Retry-After`, falhas temporárias e necessidade de reconexão sem entrar em ciclos de pedidos.

## 10.5. Segurança dos tokens

- Tokens apenas no backend; nunca no HTML, JavaScript enviado ao cliente, `localStorage`, `sessionStorage` ou logs.
- Segredos e material criptográfico em variáveis de ambiente no desenvolvimento e num gestor de segredos adequado em produção.
- Cifrar tokens persistidos com uma chave separada da base de dados e documentar rotação/recuperação.
- Limitar os tokens à conta do próprio utilizador e às permissões concedidas.
- Na desconexão, eliminar ou invalidar o token cache da aplicação e atualizar o estado da ligação. Não prometer revogação instantânea do lado Microsoft se a API não a garantir.

## 10.6. Critérios de interface

O cartão Outlook apresenta um dos seguintes estados: `Não ligado`, `A ligar`, `Ligado`, `A sincronizar`, `Autorização necessária` ou `Erro`. Exibe última sincronização, intervalo consultado, contagem de eventos e ação `Sincronizar agora`. Um ecrã de configuração ausente não pode ser confundido com uma integração real.

# 11. Motor determinístico de planeamento de estudo

## 11.1. Regra principal

O planeador tem de funcionar sem IA e produzir sempre um resultado coerente a partir dos dados locais. **A IA nunca decide se um horário está livre, se existe um conflito ou se uma tarefa já foi concluída.** Essas são regras determinísticas do backend.

## 11.2. Entradas do planeador

- aulas e eventos ocupados;
- janelas de disponibilidade do utilizador;
- tarefas por concluir, prazos e estimativas de duração;
- avaliações futuras, importância/ponderação conhecida e tempo estimado de preparação;
- dificuldade percebida e confiança/preparação do estudante, quando fornecidas;
- sessões concluídas, falhadas, fixadas ou movidas manualmente;
- preferências: duração mínima/máxima, pausas, limite diário e dias disponíveis;
- horizonte temporal solicitado para o plano.

Se um campo não existir, usar um valor predefinido documentado ou pedir ao utilizador para o indicar. Não inventar que o estudante tem uma avaliação num determinado dia.

> **Nota de implementação (outubro de 2026).** Valor predefinido documentado para o tempo de preparação em falta: ritmo pelos ECTS (DL 42/2005, 25 h por ECTS, descontadas as aulas, repartido pelo peso da avaliação até à sua data ou ao fim do semestre). Nunca é gravado nem cria datas; sem ECTS, o plano diz o que falta. Fórmula e decisões em `docs/ARCHITECTURE.md`.

## 11.3. Restrições obrigatórias

O algoritmo não pode:

1. colocar estudo em cima de aulas ou de outros eventos ocupados;
2. criar sessões no passado;
3. colocar duas sessões sobrepostas;
4. exceder o limite diário ou as janelas de disponibilidade sem assinalar uma exceção solicitada pelo utilizador;
5. mover sessões concluídas;
6. alterar silenciosamente sessões fixadas manualmente;
7. ignorar duração estimada de uma tarefa ou avaliações próximas;
8. distribuir sessões infinitas quando não há espaço disponível.

Quando não existir espaço suficiente, gerar um aviso explícito e apresentar escolhas: reduzir a duração, aumentar disponibilidade, escolher prioridades ou aceitar uma tarefa sem sessão planeada.

## 11.4. Priorização

Implementar um cálculo determinístico de prioridade, testado e explicado, com pesos ajustáveis. Considerar:

- proximidade do prazo/avaliação;
- prioridade declarada pelo estudante;
- importância ou ponderação da avaliação, quando conhecida;
- duração de trabalho ainda estimada;
- dificuldade e grau de preparação declarados;
- atraso e sessões anteriormente falhadas.

Normalizar fatores para escalas comparáveis e limitar a influência de qualquer fator para evitar uma única avaliação dominar todo o plano. Guardar no resultado uma explicação legível, por exemplo: `prioridade alta porque o teste é daqui a 3 dias e ainda faltam cerca de 120 minutos de preparação`. Só usar números que existam no sistema.

Não fixar uma fórmula arbitrária dentro de componentes React. Definir os pesos num módulo de domínio, documentar valores iniciais e criar testes de casos-limite.

## 11.5. Construção das sessões

- Criar blocos de estudo com duração limitada e configurável (por exemplo, 25, 50 ou 75 minutos).
- Respeitar pausas configuradas entre sessões e janelas livres.
- Distribuir trabalho longo por várias sessões quando apropriado.
- Reservar margem para imprevistos quando configurado.
- Não concentrar automaticamente todo o estudo na véspera de uma avaliação se houver disponibilidade anterior.
- Distribuir disciplinas ao longo da semana quando os restantes critérios forem comparáveis.
- Evitar que a aplicação apresente a mesma sessão em duplicado.
- Registar a versão do plano, a data de geração e as regras que foram aplicadas.

## 11.6. Interface do plano

A página `Plano de estudo` deve mostrar uma vista semanal e uma lista de sessões. O estudante pode aceitar, editar, mover, fixar ou retirar uma sessão. Cada sessão indica a tarefa/disciplina associada, duração, razão da recomendação e estado.

A ação `Gerar plano` cria uma versão de rascunho/preview. Antes de substituir sessões futuras existentes, mostrar as alterações previstas. Sessões passadas, concluídas ou fixadas ficam protegidas. A ação `Replanear` só altera o futuro afetado e mostra um resumo das mudanças.

## 11.7. Sugestão “O que devo estudar agora?”

Devolver uma recomendação a partir de tarefas pendentes, disponibilidade atual, prioridades e plano existente. Se o sistema não tiver informação suficiente, diz o que falta — por exemplo, estimar a duração de uma tarefa — e não inventa uma sessão. O estudante pode aceitar a recomendação para a transformar numa sessão.

## 11.8. Replaneamento após progresso

Quando o estudante conclui uma tarefa, falha uma sessão ou altera um prazo:

1. atualizar a fonte de verdade;
2. identificar sessões futuras potencialmente afetadas;
3. preservar sessões concluídas e fixadas;
4. recalcular os espaços livres e prioridades;
5. apresentar uma proposta de alteração;
6. guardar apenas após confirmação, salvo se o utilizador ativar explicitamente o auto-replaneamento com regras documentadas.

# 12. Utilização segura de IA generativa

## 12.1. Tarefas apropriadas para a IA

- Explicar por que o plano coloca uma sessão num determinado dia.
- Converter uma preferência escrita em linguagem natural numa proposta de disponibilidade, apresentada ao utilizador para confirmação.
- Ajudar a decompor uma tarefa grande em subtarefas sugeridas.
- Resumir conteúdos académicos carregados pelo próprio estudante, quando esta função for implementada e autorizada.
- Ajudar a extrair campos de horários em PDFs/imagens numa fase posterior, indicando os campos incertos.
- Produzir sugestões de estratégias de estudo com base em dados fornecidos, sem prometer resultados.

## 12.2. Tarefas que não devem depender da IA

- Verificar se existe conflito de calendário.
- Decidir se a autorização externa é válida.
- Definir a identidade do utilizador.
- Aplicar permissões de acesso.
- Criar ou apagar dados sem validação e confirmação do utilizador.
- Calcular médias e ponderações numéricas.
- Interpretar o conteúdo de um documento como instruções para alterar o comportamento do sistema.

## 12.3. Arquitetura do módulo AI

Criar uma interface interna `AiProvider` para que o motor de negócio não dependa de um fornecedor específico. Configurar chaves e modelo apenas no servidor. Em testes, usar um provider falso determinístico. Validar entradas e saídas com schema (por exemplo, Zod). Se a resposta for inválida, indisponível ou exceder o tempo permitido, recorrer a uma explicação determinística ou mostrar um erro recuperável.

## 12.4. Consentimento e privacidade

- IA desligada por defeito até o utilizador ativar a funcionalidade e compreender o que será processado.
- Enviar apenas os dados mínimos necessários; omitir identificadores, emails, nomes de professores e conteúdo irrelevante.
- Não enviar tokens, palavras-passe, sessões ou dados de outros utilizadores.
- Definir limites de pedidos e custos.
- Não guardar prompts/respostas completos em logs por defeito. Registar metadados técnicos minimizados, como duração, estado e identificador da funcionalidade.
- Documentar o fornecedor, tipos de dados transmitidos, retenção configurável e método para desligar a função.
- Conteúdos de ficheiros são dados não fiáveis. Instruções incluídas neles não podem sobrepor-se às regras do sistema ou autorizar ações externas.

## 12.5. Confirmação humana

Toda a saída que possa alterar horário, tarefas ou sessões deve ser apresentada como proposta estruturada. O backend valida as restrições e o utilizador confirma antes da gravação. Uma saída de linguagem natural não é suficiente para executar alterações.

# 13. Contratos da API REST

Os caminhos seguintes são uma referência. Adapta-os ao router existente se já houver convenções, mantendo consistência e documentação.

### Autenticação

- `POST /api/auth/register` — criar conta com validação.
- `POST /api/auth/login` — iniciar sessão.
- `POST /api/auth/logout` — invalidar sessão.
- `GET /api/auth/me` — obter o utilizador autenticado.

### Disciplinas, tarefas e avaliações

- `GET/POST /api/disciplines` — listar/criar disciplinas próprias.
- `GET/PATCH/DELETE /api/disciplines/:id` — consultar, editar ou arquivar a disciplina própria.
- `GET/POST /api/tasks` — listar/criar tarefas próprias.
- `GET/PATCH/DELETE /api/tasks/:id` — consultar, editar, concluir ou eliminar tarefa própria.
- `GET/POST /api/assessments` — listar/criar avaliações próprias.
- `GET/PATCH/DELETE /api/assessments/:id` — consultar, editar ou eliminar avaliação própria.
- `GET /api/calendar?from=&to=` — obter eventos num intervalo.

### Importação e preferências

- `POST /api/imports` — validar e processar ficheiro para pré-visualização.
- `GET /api/imports/:id` — consultar pré-visualização e avisos do job próprio.
- `POST /api/imports/:id/confirm` — confirmar e gravar importação validada.
- `DELETE /api/imports/:id` — abortar ou eliminar job e ficheiros temporários.
- `GET/PUT /api/preferences/study` — consultar ou atualizar preferências de estudo.

### Planeador e sessões

- `POST /api/planner/preview` — gerar proposta sem gravar as alterações finais.
- `POST /api/planner/confirm` — confirmar proposta de plano.
- `POST /api/planner/replan` — propor alterações ao plano futuro.
- `POST /api/study-sessions/:id/complete` — registar conclusão e duração real.
- `POST /api/study-sessions/:id/miss` — marcar sessão falhada e propor replaneamento.

### Integrações externas e IA

- `GET /api/integrations` — consultar estado das ligações próprias.
- `GET /api/integrations/outlook/start` — iniciar o fluxo autorizado de ligação.
- `GET /api/integrations/outlook/callback` — processar callback Microsoft validado.
- `POST /api/integrations/outlook/sync` — sincronizar o intervalo permitido.
- `DELETE /api/integrations/outlook` — desligar e eliminar tokens locais.
- `GET /api/integrations/moodle/status` — consultar configuração/estado Moodle.
- `POST /api/integrations/moodle/sync` — sincronizar dados Moodle autorizados.
- `DELETE /api/integrations/moodle` — desligar e eliminar tokens locais.
- `POST /api/ai/study-assistance` — obter sugestão validada, se a IA estiver ativa.

## 13.1. Convenções para todos os endpoints

- Validar body, parâmetros e query string no backend.
- Exigir sessão/autorização em rotas privadas.
- Filtrar sempre por `userId` e nunca confiar num `userId` enviado pelo frontend.
- Usar códigos HTTP adequados, mensagens de erro previsíveis e identificador de pedido.
- Implementar paginação onde possa existir uma lista extensa.
- Evitar devolver campos internos como hashes, tokens, segredos, conteúdo de prompt ou dados de outros utilizadores.
- Documentar os endpoints com OpenAPI/Swagger ou uma referência equivalente gerada a partir dos contratos reais.

## 13.2. Formato de erro

Adotar uma estrutura comum como:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Verifica os campos assinalados.",
    "requestId": "id-de-pedido",
    "details": []
  }
}
```

O exemplo é um contrato indicativo. Em produção, `details` nunca deve conter tokens, variáveis de ambiente ou stack traces. Em desenvolvimento, detalhes adicionais podem ser registados no terminal de forma segura.

# 14. Segurança, privacidade e proteção de dados

## 14.1. Autenticação da aplicação

- Usar uma biblioteca de sessão mantida e sessões no servidor, se compatível com a arquitetura.
- Cookies de sessão com `HttpOnly`, `Secure` em HTTPS, `SameSite=Lax` ou `Strict` conforme o fluxo, `Path=/` e expiração no servidor.
- Rodar o identificador de sessão após login e alterações de privilégio.
- Implementar logout real que invalide a sessão no servidor.
- Usar hashing de palavras-passe com Argon2id ou alternativa atual e adequada; nunca encriptar palavras-passe para as poder recuperar.
- Proteger rotas de autenticação com rate limiting e erros que não revelem desnecessariamente se um email está registado.
- Se for necessário suportar autenticação externa, documentar o mecanismo em vez de improvisar uma mistura de sessões e JWT.

Não guardar tokens de autenticação, refresh tokens ou sessão em `localStorage`/`sessionStorage`.

## 14.2. Autorização e isolamento

Testar explicitamente que o utilizador A não consegue ver, editar, apagar, exportar ou sincronizar recursos do utilizador B, mesmo mudando IDs nos pedidos HTTP. O controlo deve ser feito no servidor para cada operação.

## 14.3. Proteções do backend

- HTTPS em produção.
- Helmet ou cabeçalhos equivalentes adequados ao frontend existente.
- CORS restrito à origem autorizada; não usar `*` com credenciais.
- Proteção CSRF se o mecanismo de sessão/cookies e a arquitetura a exigirem; `SameSite` é defesa adicional, não substituto universal.
- Rate limiting, timeouts e limites de tamanho em pedidos e ficheiros.
- Queries ORM parametrizadas e validação de input.
- Tratamento centralizado de erros sem stack traces públicos.
- Dependências atualizadas, lockfile versionado e auditoria de vulnerabilidades no CI quando viável.
- Logs estruturados sem tokens, palavras-passe, dados académicos desnecessários ou conteúdo privado de ficheiros.

## 14.4. Segredos e encriptação

- `.env` fica ignorado pelo Git; apenas `.env.example` com nomes e valores de demonstração é versionado.
- A chave de encriptação de tokens deve ser independente da base de dados.
- Não reutilizar `SESSION_SECRET` como chave de encriptação de tokens.
- Produção deve usar um gestor de segredos sempre que possível.
- Criar instruções de rotação e resposta a compromissos; não mostrar valores de segredos durante o troubleshooting.

## 14.5. Privacidade e controlo do utilizador

Implementar, em função do estágio do produto:

- página de privacidade e explicação da origem de cada dado;
- opção para desligar Moodle, Outlook e IA separadamente;
- exportação de dados do utilizador;
- eliminação da conta e dados associados com confirmação clara;
- política de retenção para importações temporárias, logs e tokens;
- consentimento explícito antes de enviar conteúdo de ficheiros a um fornecedor de IA externo.

Antes de lançar publicamente, rever as obrigações aplicáveis em matéria de RGPD com a instituição ou apoio competente. Este documento não substitui aconselhamento jurídico nem a aprovação institucional.

# 15. Testes e critérios de aceitação

## 15.1. Testes unitários

Testar pelo menos:

- cálculos de médias e notas necessárias;
- validação de datas, intervalos e fuso horário;
- motor de prioridades e geração de sessões;
- prevenção de sobreposições e respeito por indisponibilidades;
- cálculo de duplicados/importações;
- normalização de eventos externos;
- validação de respostas de IA e comportamento quando a IA falha.

## 15.2. Testes de integração

- registo/login/logout e expiração da sessão;
- CRUD com verificação de propriedade dos registos;
- migrações e transações da base de dados;
- upload e pré-visualização de CSV/ICS;
- falhas Moodle simuladas: sem configuração, token inválido, permissão insuficiente, timeout e resposta inesperada;
- falhas Outlook simuladas: consentimento cancelado, token expirado, erro 429, paginação e sincronização incremental;
- desconexão e eliminação de credenciais locais.

Os testes externos não devem depender de contas institucionais reais em CI. Usar fixtures e providers simulados com contratos semelhantes aos reais.

## 15.3. Testes end-to-end

Cenário obrigatório de utilizador:

1. criar conta e iniciar sessão;
2. criar duas disciplinas;
3. criar tarefa e avaliação;
4. importar um `.ics` ou CSV com pré-visualização;
5. confirmar o horário e verificar que o calendário o mostra;
6. definir disponibilidade;
7. gerar uma proposta de plano;
8. confirmar que não existem conflitos;
9. concluir uma sessão;
10. simular falha de uma sessão e validar a proposta de replaneamento;
11. desligar uma integração simulada e confirmar que o estado é atualizado.

## 15.4. Critérios globais de aceitação

- `typecheck`, lint, suite de testes e build terminam com sucesso.
- Não há rotas privadas sem autenticação/autorizações necessárias.
- Um utilizador não acede a recursos de outro utilizador.
- A importação permite rever, corrigir e cancelar antes de gravar.
- O motor de planeamento respeita todos os bloqueios e reporta falta de espaço.
- Uma integração só é indicada como ativa depois de uma chamada de verificação bem-sucedida.
- O modo simulado está claramente indicado e nunca se faz passar por uma sincronização real.
- A aplicação permanece utilizável quando Moodle, Outlook ou IA estão indisponíveis.
- O README permite a outro programador executar o projeto localmente sem conhecimento oral prévio.

# 16. Plano de implementação por fases

## Fase 0 — Auditoria e plano

**Objetivo:** conhecer o estado real do repositório e propor a sequência de alterações.

Tarefas:
- mapear páginas, componentes, rotas, scripts, dependências e dados fictícios existentes;
- identificar riscos e dívida técnica;
- verificar o que já existe face ao presente manual;
- escrever um plano faseado e atualizar README sem apagar trabalho.

**Concluída quando:** existe um relatório fiel e a primeira tarefa concreta está definida. Não apresentar funcionalidades existentes como implementadas sem verificação.

## Fase 1 — Base do projeto

- configurar workspaces e comandos de desenvolvimento, se necessário;
- configurar TypeScript strict, lint, formatter e `.env.example`;
- preparar API, frontend, health check e ligação local à base de dados;
- configurar logs e tratamento centralizado de erros;
- configurar pipeline CI mínimo.

**Concluída quando:** frontend e backend arrancam, a base de dados é acessível e `typecheck`, lint e build passam.

## Fase 2 — Autenticação e dados centrais

- sessão segura, login, registo e logout;
- migrações iniciais;
- CRUD de disciplinas, tarefas e avaliações;
- validação server-side e testes de isolamento por utilizador;
- UI ligada à API com estados de loading/erro/vazio.

**Concluída quando:** um utilizador consegue criar, consultar, editar e eliminar/arquivar os seus dados e os testes comprovam isolamento.

## Fase 3 — Dashboard, calendário e foco

- calendário interno;
- dashboard alimentado por dados reais;
- estados de tarefa e sessão;
- temporizador de foco e estatísticas simples;
- cálculo de médias testado.

**Concluída quando:** o dashboard não depende de amostras fixas e os fluxos principais funcionam em desktop e mobile.

## Fase 4 — Importação de CSV e ICS

- upload seguro;
- parser com limites e validação;
- pré-visualização editável;
- deteção de duplicados e confirmação transacional;
- expiração e limpeza de ficheiros temporários.

**Concluída quando:** um ficheiro válido é importado, um ficheiro malformado mostra erros recuperáveis, os duplicados são tratados e cancelar não grava dados.

## Fase 5 — Integrações externas

### Outlook

- configurar app registration e fluxo de autenticação suportado;
- implementar permissões mínimas de leitura;
- importar calendário e sincronizar de forma incremental quando viável;
- testar cancelamento, revogação e expiração.

### Moodle

- verificar com o IPVC se os Web Services REST estão disponíveis e autorizados;
- documentar funções permitidas e o modo de autenticação suportado;
- implementar provider real apenas com base nas capacidades confirmadas;
- manter provider simulado e importação manual se faltar autorização.

**Concluída quando:** o estado de ligação reflete testes reais; se faltarem credenciais ou aprovação, essa dependência fica documentada e o produto continua utilizável.

## Fase 6 — Motor determinístico de estudo

- modelar disponibilidade e restrições;
- implementar cálculo de prioridade explicável;
- gerar propostas de sessões sem conflitos;
- permitir editar/fixar sessões;
- replanear após progresso com preview das alterações;
- criar conjunto abrangente de testes de calendário e casos extremos.

**Concluída quando:** todos os testes do planeador passam e a geração de plano funciona mesmo com a IA desativada.

## Fase 7 — IA assistiva

- definir interface de provider e variáveis de ambiente;
- consentimento e opção para desligar IA;
- schemas de entrada/saída e validação;
- explicações, decomposição de tarefas e assistência opcional;
- fallback determinístico e controlo de custos;
- testes de respostas inválidas, indisponibilidade e conteúdo malicioso em documentos.

**Concluída quando:** nenhuma saída inválida da IA quebra o planeador nem altera dados sem confirmação.

## Fase 8 — Preparação de lançamento

- rever segurança, privacidade, acessibilidade e mensagens de erro;
- testes E2E e pipeline CI;
- backups e procedimento de migração;
- configuração de produção sem segredos no repositório;
- documentação de deployment, monitorização e rollback.

**Concluída quando:** existe uma versão demonstrável, documentada e recuperável, com limitações conhecidas explicitadas.

# 17. Configuração local e variáveis de ambiente

## 17.1. Ficheiro `.env.example`

O Claude Code deve ajustar os nomes à implementação final, mantendo todos os segredos fora do Git. Exemplo conceptual:

```dotenv
NODE_ENV=development
APP_URL=http://localhost:5173
API_PORT=3000
WEB_ORIGIN=http://localhost:5173
DATABASE_URL=postgresql://studentos:studentos@localhost:5432/studentos
SESSION_SECRET=replace-with-a-long-random-development-secret

# Microsoft Entra / Microsoft Graph — opcionais até haver configuração
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_TENANT_ID=organizations
MICROSOFT_REDIRECT_URI=http://localhost:3000/api/integrations/outlook/callback

# Moodle IPVC — base URL configurável; API depende de autorização
MOODLE_BASE_URL=https://elearning.ipvc.pt
MOODLE_INTEGRATION_MODE=mock

# Chave separada para cifrar tokens persistidos, se forem necessários
TOKEN_ENCRYPTION_KEY=

# IA — opcional e desligada quando não estiver configurada
AI_ENABLED=false
AI_PROVIDER=
AI_API_KEY=
AI_MODEL=
```

Nunca preencher `.env.example` com tokens reais. `SESSION_SECRET` e `TOKEN_ENCRYPTION_KEY` devem ser gerados e geridos separadamente. Em produção, a configuração de segredos deve estar num sistema próprio do fornecedor de alojamento.

## 17.2. Comandos e documentação

O README final deve indicar, de acordo com os scripts que realmente existem:

- pré-requisitos e versões;
- instalação das dependências;
- criação da base de dados;
- migrações e seed de demonstração opcional;
- execução de frontend e backend;
- testes, lint, typecheck e build;
- configuração opcional do Outlook;
- limites atuais da integração Moodle;
- configuração da IA e como a desligar;
- resolução de problemas frequentes.

Não inventar comandos: verificar os scripts em `package.json` e atualizar o README quando estes mudarem.

# 18. Tratamento de erros e resolução de problemas

- **Base de dados indisponível:** o health check indica falha sem revelar credenciais; a interface mostra indisponibilidade.
- **Sessão expirada:** pedir novo login sem perder silenciosamente alterações não guardadas.
- **Ficheiro inválido:** explicar o formato esperado e não gravar dados.
- **Datas ambíguas:** assinalar para correção manual antes de importar.
- **Duplicados:** mostrar possíveis correspondências e permitir decidir.
- **Moodle sem autorização:** indicar a dependência dos Serviços de Informática e manter importação manual.
- **Moodle/Outlook sem rede:** registar falha, preservar dados existentes e permitir nova tentativa.
- **Token revogado/expirado:** atualizar o estado para reconexão necessária e eliminar os dados secretos inválidos de acordo com a política.
- **Sem janelas de estudo:** explicar o conflito e oferecer opções sem inventar disponibilidade.
- **Resposta IA inválida:** validar, descartar a saída, aplicar fallback seguro e registar apenas metadados técnicos.
- **Migração falhada:** parar o deployment, não marcar a release como bem-sucedida e seguir o procedimento de recuperação.

Cada erro deve ter: mensagem clara, código interno estável, detalhe seguro nos logs e teste automatizado para a causa principal.

# 19. Definição de concluído e entrega final

Uma funcionalidade só está concluída quando:

- está implementada de ponta a ponta, não apenas desenhada;
- tem validação no frontend e no backend onde aplicável;
- aplica autenticação e autorização;
- gere estados de carregamento, vazio, sucesso e falha;
- tem testes proporcionais ao risco;
- tem instruções de configuração e comportamento documentadas;
- não depende silenciosamente de dados fictícios;
- passa typecheck, lint, testes e build relevantes;
- tem limitações externas explicitadas.

Na entrega final, Claude Code deve incluir uma tabela com **implementado**, **testado**, **pendente por credenciais/autorização**, e **não incluído nesta versão**. Se algum teste não tiver sido executado, dizê-lo explicitamente.

## 19.1. Prioridade quando houver conflito entre tarefas

1. Segurança, privacidade e integridade dos dados.
2. Aplicação executável e testes estáveis.
3. Funcionalidades principais do MVP.
4. Importação e calendário.
5. Integrações autorizadas.
6. Planeador determinístico.
7. IA assistiva.
8. Polimento e funcionalidades futuras.

Não sacrificar segurança ou correção para acrescentar mais funcionalidades rapidamente.

# 20. Prompt operacional para iniciar Claude Code

Usa o texto seguinte quando abrires o projeto no Claude Code:

> Lê integralmente `CLAUDE.md` e `docs/STUDENTOS_IMPLEMENTATION_SPEC.md`. Primeiro inspeciona o repositório e identifica o estado real da implementação sem apagar trabalho existente. Compara o código com os requisitos. Depois implementa a próxima fase incompleta deste manual, por incrementos pequenos e funcionais. Executa typecheck, lint, testes e build relevantes, corrige as falhas causadas pelas tuas alterações e atualiza a documentação. Não marques integrações externas como funcionais sem uma verificação real. Para Moodle, não contornes a configuração nem as permissões do IPVC: implementa o adaptador e o modo simulado se a API não estiver autorizada. Para Outlook, mantém as permissões mínimas e o modo de leitura inicial. O planeador tem de funcionar sem IA e respeitar conflitos, disponibilidades e sessões fixadas/concluídas. No fim, apresenta o relatório da fase segundo as instruções de `CLAUDE.md`.

# 21. Referências técnicas oficiais

Consultar as páginas oficiais atualizadas durante a implementação. A documentação pode mudar; confirmar sempre as instruções aplicáveis à versão e ao tipo de aplicação utilizados.

1. **Moodle Developer Resources — External Services:** https://moodledev.io/docs/5.0/apis/subsystems/external
2. **Moodle Developer Resources — File handling:** https://moodledev.io/docs/5.0/apis/subsystems/external/files
3. **Microsoft identity platform — OAuth 2.0 authorization code flow:** https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
4. **Microsoft Graph — List calendarView:** https://learn.microsoft.com/en-us/graph/api/calendar-list-calendarview?view=graph-rest-1.0
5. **Microsoft Graph — Event delta query:** https://learn.microsoft.com/en-us/graph/api/event-delta?view=graph-rest-1.0
6. **OWASP — Session Management Cheat Sheet:** https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
7. **OWASP — File Upload Cheat Sheet:** https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
8. **OWASP — Input Validation Cheat Sheet:** https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html
9. **React:** https://react.dev/learn
10. **Vite:** https://vite.dev/guide/
11. **Prisma ORM:** https://www.prisma.io/docs
12. **Node.js releases:** https://nodejs.org/en/about/previous-releases
13. **Regulamento Geral sobre a Proteção de Dados (RGPD):** https://eur-lex.europa.eu/eli/reg/2016/679/oj

---

**Fim do manual.** Este documento deve evoluir com o código: quando uma decisão mudar, atualizar o manual e registar a razão. O conteúdo só deve ser considerado implementado depois de existir código executável, testes e prova verificável do comportamento.
