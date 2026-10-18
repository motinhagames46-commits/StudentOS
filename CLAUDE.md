# CLAUDE.md — StudentOS

## Fonte de requisitos
Antes de editar código, lê integralmente `STUDENTOS_IMPLEMENTATION_SPEC.md`. Esse documento é a referência funcional e técnica principal. Se o repositório já contiver trabalho, inspeciona-o primeiro e preserva o que está funcional.

## Missão
Implementa StudentOS como uma aplicação académica de qualidade, com React + TypeScript no frontend, Node.js + Express + TypeScript no backend e PostgreSQL/Prisma na persistência, salvo se a auditoria revelar uma razão concreta para manter uma stack existente diferente.

## Protocolo obrigatório
1. Inspeciona estrutura, scripts, dependências, componentes, rotas, schema, migrações, testes e alterações locais.
2. Resume a fase atual e escolhe a menor unidade funcional seguinte.
3. Implementa de ponta a ponta quando possível; evita ficheiros vazios, pseudocódigo apresentado como funcionalidade ou grandes reescritas não justificadas.
4. Executa typecheck, lint, testes e build relevantes. Corrige regressões antes de avançar.
5. Atualiza README e documentação afetados.
6. No fim, reporta implementado, ficheiros alterados, comandos e resultados reais, configuração pendente e limitações.

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

## Critérios de qualidade
- TypeScript strict; evita `any` e documenta exceções.
- Valida inputs no frontend e no backend; backend é a fonte de verdade.
- Estados de loading, empty, success and error nas operações assíncronas.
- Testes unitários para regras de domínio, integração para API/persistência e E2E para percursos críticos.
- Mantém o projeto executável depois de cada incremento.
- Não confies em dados de demonstração para simular integração real.

## Ordem recomendada
1. Auditoria do repositório.
2. Fundação/configuração.
3. Autenticação, disciplinas, tarefas, avaliações.
4. Dashboard, calendário e foco.
5. Importação CSV/ICS com preview.
6. Outlook autorizado e Moodle conforme configuração institucional.
7. Motor determinístico de planeamento.
8. IA assistiva, opcional e com validação.
9. Hardening, documentação e preparação de deployment.

## Relatório por fase
Termina cada fase indicando: funcionalidades implementadas; decisões; ficheiros alterados; testes executados e resultado real; variáveis/autorizações ainda necessárias; limitações; próxima fase. Se um comando falhar, explica e corrige ou assinala o bloqueio sem afirmar que passou.
