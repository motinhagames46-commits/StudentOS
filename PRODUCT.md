# StudentOS

Organizador académico pessoal para estudantes do ensino superior português, desenhado para TPSI (CTeSP) do Instituto Politécnico de Viana do Castelo. Especificação funcional completa: [`docs/ESPECIFICACAO-v2.md`](docs/ESPECIFICACAO-v2.md); especificação de implementação: [`docs/STUDENTOS_IMPLEMENTATION_SPEC.md`](docs/STUDENTOS_IMPLEMENTATION_SPEC.md). Este documento resume o produto e aponta para lá; em caso de conflito, a especificação de implementação manda.

## Problema e objetivo

Um estudante acompanha seis a oito unidades curriculares por semestre, cada uma com testes, trabalhos e exames de pesos e notas mínimas diferentes, com a informação espalhada. O StudentOS junta disciplinas, tarefas, avaliações e estudo num só sítio e responde a três perguntas:

1. O que tenho de entregar ou estudar nos próximos dias?
2. Qual é a minha média atual em cada disciplina?
3. Que nota preciso no próximo momento de avaliação para passar, ou para chegar à nota que quero?

O que o distingue de uma lista de tarefas é o motor de médias (escala 0–20, componentes com peso, nota mínima por componente, arredondamento às unidades) e o planeador de estudo determinístico.

## Público e papéis

Estudantes de TPSI do IPVC (o modelo de avaliação serve outros cursos). Personas: estudante do 1.º ano, sobretudo no telemóvel, que não quer falhar prazos; trabalhador-estudante com pouco tempo, que precisa de decidir onde investir esforço. Um só papel: cada utilizador só vê os seus próprios dados.

## Fluxos essenciais

- Criar conta → semestre ativo criado → disciplinas e avaliações com pesos → médias e "quanto preciso no exame".
- Tarefas com prazo e prioridade → painel com próximos 7 dias, em atraso e alertas.
- Importar horário (`.ics`/`.csv`) com pré-visualização editável, duplicados e confirmação.
- Disponibilidade semanal → proposta de plano de estudo → confirmação → modo foco.
- Exportar todos os dados (JSON) e eliminar a conta; transferir disciplinas para outra conta própria.

## MVP e estado

Implementado e publicado (detalhe na tabela §19 do [README](README.md#estado-da-entrega-spec-19)): autenticação com sessões no servidor, semestres, disciplinas, avaliações e médias, tarefas, painel, estatísticas, calendário, alertas, horário e importação, planeador (com ritmo pelos ECTS quando falta o tempo de estudo), modo foco, exportação `.ics`, exportação/eliminação de conta, transferência entre contas.

## Fora de âmbito (nesta versão)

IA generativa (há um conjunto de avaliação em preparação, sem decisão de avançar), notificações por email/push, recuperação de palavra-passe por email, paginação, funcionalidades sociais, app móvel nativa. Moodle e Outlook ficam `NOT_CONFIGURED` até haver autorização do IPVC e registo na Microsoft.

## Requisitos

- Português de Portugal; fuso `Europe/Lisbon`; datas e "hoje/amanhã" em dias civis de Lisboa.
- RGPD: dados na UE (Render Frankfurt, Neon Frankfurt), exportação e eliminação na própria app, [página de privacidade](apps/web/src/pages/PrivacyPage.tsx) fiel ao tratamento real.
- Acessibilidade WCAG 2.2 AA (verificada com axe nos E2E); mobile primeiro.
- Autorização por proprietário no backend em todas as entidades privadas.

## Restrições e decisões técnicas

Projeto académico (cerca de 110 h, custo de alojamento 0 €, planos gratuitos). Stack: React 19 + Vite, Express 5, Prisma 7 + PostgreSQL 17, Zod 4, Vitest, Playwright, npm workspaces, Node 24. O Prisma foi escolhido antes da adoção do toolkit e mantém-se (o toolkit sugere Drizzle apenas para projetos novos). Decisões e diferenças face ao spec: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Suposições e decisões pendentes

- Avançar ou não com o assistente de IA ("Colar ficha da UC"): pendente do utilizador.
- Datas das avaliações chegam durante o semestre; até lá o plano usa o ritmo pelos ECTS.
- CI do GitHub não corre enquanto a faturação da conta estiver bloqueada; a bateria local é a barreira antes de cada push.

## Critérios de aceitação

Os do spec (§6 histórias de utilizador e §19 da especificação de implementação), verificados pelos testes de integração e E2E listados em [`docs/quality.md`](docs/quality.md). Critérios técnicos de preparação do ambiente de agentes ficam em [`docs/setup.md`](docs/setup.md), separados destes.

## Próxima entrega

Decisão do utilizador sobre o assistente de IA; sem ela, os candidatos são os itens adiados registados em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) e no README (datas aproximadas em lote, PWA).

## Manutenção

Atualiza este documento quando mudarem o objetivo, o âmbito, as restrições ou os critérios de aceitação. Decisões técnicas e evidência ficam em `docs/ARCHITECTURE.md` e `docs/setup.md`.
