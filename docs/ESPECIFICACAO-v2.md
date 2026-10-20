# StudentOS — Documento de Especificação Técnica

| Campo               | Valor                                                   |
| ------------------- | ------------------------------------------------------- |
| Projeto             | StudentOS — organizador académico pessoal               |
| Curso / Instituição | TPSI — Instituto Politécnico de Viana do Castelo (IPVC) |
| Unidade curricular  | _[preencher]_                                           |
| Docente             | _[preencher]_                                           |
| Autor(es)           | _[preencher — nome, n.º de aluno]_                      |
| Versão              | 2.0                                                     |
| Data                | 16/10/2026                                              |
| Estado              | Proposta para validação pelo docente                    |

> **Declaração de uso de ferramentas de IA.** _[Adaptar às regras da UC.]_ Este documento foi elaborado com apoio de ferramentas de IA generativa para pesquisa e revisão. Todas as decisões, regras e estimativas foram revistas, validadas e são assumidas pelo(s) autor(es).

---

## Índice

1. [Introdução](#1-introdução)
2. [Utilizadores e personas](#2-utilizadores-e-personas)
3. [Glossário](#3-glossário)
4. [Regras de negócio](#4-regras-de-negócio)
5. [Requisitos funcionais](#5-requisitos-funcionais)
6. [Histórias de utilizador e critérios de aceitação](#6-histórias-de-utilizador-e-critérios-de-aceitação)
7. [Requisitos não funcionais](#7-requisitos-não-funcionais)
8. [Arquitetura](#8-arquitetura)
9. [Stack tecnológica e justificação](#9-stack-tecnológica-e-justificação)
10. [Modelo de dados](#10-modelo-de-dados)
11. [API REST](#11-api-rest)
12. [Segurança e proteção de dados](#12-segurança-e-proteção-de-dados)
13. [Interface e experiência de utilização](#13-interface-e-experiência-de-utilização)
14. [Estratégia de testes](#14-estratégia-de-testes)
15. [CI/CD e alojamento](#15-cicd-e-alojamento)
16. [Planeamento](#16-planeamento)
17. [Riscos](#17-riscos)
18. [Questões em aberto](#18-questões-em-aberto)
19. [Referências](#19-referências)

- [Anexo A — Configuração do ambiente de desenvolvimento](#anexo-a--configuração-do-ambiente-de-desenvolvimento)
- [Anexo B — Resolução de problemas comuns](#anexo-b--resolução-de-problemas-comuns)
- [Anexo C — Alterações em relação à versão 1](#anexo-c--alterações-em-relação-à-versão-1)

---

## 1. Introdução

### 1.1 Problema

Um estudante de TPSI acompanha seis a oito unidades curriculares por semestre. Cada uma tem a sua própria combinação de testes, trabalhos e exames, com pesos e notas mínimas diferentes. Esta informação está espalhada pelo Moodle, por PDFs das fichas das UC, por calendários pessoais e por notas soltas. Na prática, o estudante não consegue responder com rapidez a três perguntas:

1. **O que tenho de entregar ou estudar nos próximos dias?**
2. **Qual é a minha média atual em cada disciplina?**
3. **Que nota preciso no próximo momento de avaliação para passar, ou para chegar à nota que quero?**

### 1.2 Objetivo

O StudentOS é uma aplicação web pessoal que junta disciplinas, tarefas, avaliações e sessões de estudo num único sítio. Responde às três perguntas acima. O que distingue o StudentOS de uma lista de tarefas genérica é o **motor de cálculo de médias**, que segue as regras de avaliação do ensino superior português: escala de 0 a 20, componentes com peso, nota mínima por componente e média ponderada por ECTS.

### 1.3 Âmbito

**Incluído (MVP):** contas de utilizador, disciplinas, tarefas, avaliações, cálculo de médias, simulador de "nota necessária", painel inicial e exportação/eliminação de conta.

**Excluído:** integração com sistemas do IPVC (Moodle, ON), funcionalidades sociais ou partilha entre utilizadores, aplicação móvel nativa e integração bidirecional com o Google Calendar. A secção 5 indica o que fica para versões futuras.

### 1.4 Restrições

- Projeto académico com **[1 / N] autor(es)** e cerca de **110 horas** de trabalho (secção 16).
- Orçamento de alojamento: **0 €**. Usam-se apenas planos gratuitos.
- Dados pessoais de estudantes: aplica-se o **RGPD** (secção 12.4).

---

## 2. Utilizadores e personas

O público-alvo são os estudantes de TPSI do IPVC. O modelo de avaliação é genérico, por isso a aplicação também serve outros cursos do ensino superior português.

| Persona                                 | Contexto                                                                                | Necessidade principal                                                      |
| --------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Inês, 1.º ano**                       | Primeiro semestre e ainda não conhece o ritmo de avaliações. Usa sobretudo o telemóvel. | Ver todos os prazos num só sítio e não falhar entregas.                    |
| **Rui, 2.º ano, trabalhador-estudante** | Pouco tempo disponível, precisa de escolher onde investir esforço.                      | Saber que nota precisa no exame de cada UC para decidir onde estudar mais. |

---

## 3. Glossário

| Termo                  | Definição                                                                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Disciplina**         | Unidade curricular (UC) frequentada pelo estudante num semestre. Tem nome, sigla, ECTS e nota mínima de aprovação.                                   |
| **Semestre**           | Período letivo (ex.: "2026/27 — 1.º semestre"). Agrupa disciplinas e permite manter histórico.                                                       |
| **Avaliação**          | Componente de avaliação de uma disciplina (teste, trabalho, exame, etc.), com peso em percentagem e, opcionalmente, data, nota obtida e nota mínima. |
| **Avaliação pendente** | Avaliação que ainda não tem nota registada.                                                                                                          |
| **Tarefa**             | Trabalho a fazer pelo estudante, com prazo e prioridade, opcionalmente associado a uma disciplina.                                                   |
| **Sessão de estudo**   | Período de estudo com início e fim, opcionalmente associado a uma disciplina.                                                                        |
| **ECTS**               | Créditos europeus de uma UC. Usados para ponderar a média global.                                                                                    |

---

## 4. Regras de negócio

> Estas regras definem o núcleo do produto. Antes de serem implementadas, **têm de ser confirmadas** com o regulamento de avaliação do IPVC e com as fichas das UC. Ver a questão Q3.

| ID       | Regra                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **RN01** | Todas as notas usam a escala de **0 a 20** com, no máximo, duas casas decimais.                                                                                                                                                                                                                                                                                                                                                                                                |
| **RN02** | Cada avaliação tem um peso `p` com 0 < p ≤ 100 (percentagem).                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **RN03** | A soma dos pesos das avaliações de uma disciplina **não pode exceder 100%**. Se for inferior a 100%, a interface mostra o aviso "Configuração de avaliação incompleta" e a média final não é apresentada como definitiva.                                                                                                                                                                                                                                                      |
| **RN04** | **Média atual**: média ponderada só das avaliações que já têm nota: `Σ(nᵢ·pᵢ) / Σ(pᵢ)`. Se nenhuma avaliação tiver nota, a média atual fica "—".                                                                                                                                                                                                                                                                                                                               |
| **RN05** | **Média final**: só é calculada quando todas as avaliações têm nota e a soma dos pesos é 100%: `Σ(nᵢ·pᵢ) / 100`. É arredondada às unidades (≥ x,5 arredonda para cima).                                                                                                                                                                                                                                                                                                        |
| **RN06** | **Aprovação**: a disciplina fica aprovada se a média final arredondada for ≥ à nota mínima de aprovação da disciplina (por omissão, 10) **e** todas as avaliações com nota mínima a cumprirem.                                                                                                                                                                                                                                                                                 |
| **RN07** | **Nota necessária** para atingir a nota-alvo `A` (por omissão, a nota mínima de aprovação), com `C = Σ(nᵢ·pᵢ)` das avaliações com nota e `P` = soma dos pesos pendentes: `x = ((A − 0,5)·100 − C) / P`. É a nota uniforme necessária em todas as avaliações pendentes. O resultado final é `max(x, maior nota mínima pendente)`. Se o valor for > 20, mostra-se "Não é possível atingir A". Se for ≤ 0, mostra-se "Já garantido" (desde que as notas mínimas sejam cumpridas). |
| **RN08** | **Média global** do estudante: média das notas finais **das disciplinas aprovadas**, ponderada pelos ECTS: `Σ(Fⱼ·ECTSⱼ) / Σ(ECTSⱼ)`. Disciplinas sem ECTS definidos contam com peso 1, e essa situação é assinalada na interface.                                                                                                                                                                                                                                              |
| **RN09** | Uma tarefa está **em atraso** quando o prazo já passou e o estado não é "concluída".                                                                                                                                                                                                                                                                                                                                                                                           |
| **RN10** | Cada utilizador só vê e altera os **seus** dados. Isto inclui as referências: uma tarefa só pode ser associada a uma disciplina do próprio utilizador.                                                                                                                                                                                                                                                                                                                         |
| **RN11** | Uma sessão de estudo em curso não tem fim. Cada utilizador só pode ter **uma** sessão em curso de cada vez.                                                                                                                                                                                                                                                                                                                                                                    |
| **RN12** | Eliminar uma disciplina elimina também as suas avaliações. As tarefas associadas ficam sem disciplina e não são eliminadas.                                                                                                                                                                                                                                                                                                                                                    |

### 4.1 Exemplo de cálculo (validação das RN04–RN07)

Disciplina **Programação Web** (6 ECTS, aprovação ≥ 10):

| Avaliação        | Peso | Nota       | Nota mínima |
| ---------------- | ---- | ---------- | ----------- |
| Teste 1          | 30%  | 12,0       | —           |
| Trabalho prático | 30%  | 15,0       | —           |
| Exame            | 40%  | _pendente_ | 8,0         |

- `C = 12×30 + 15×30 = 810` e `P = 40`.
- **Média atual (RN04):** 810 / 60 = **13,50**.
- **Nota necessária para passar (A = 10):** x = (9,5×100 − 810) / 40 = **3,50**. Como o exame tem nota mínima de 8, a nota necessária é **8,0**.
- **Nota necessária para ter 14 (A = 14):** x = (13,5×100 − 810) / 40 = **13,50**.
- **Nota necessária para ter 20:** x = (19,5×100 − 810) / 40 = 28,5, que é > 20. Resultado: **"Não é possível atingir 20"**.

> Estes exemplos servem diretamente como **casos de teste unitários** do motor de cálculo (secção 14).

---

## 5. Requisitos funcionais

Prioridades segundo o método MoSCoW. **O MVP corresponde exatamente aos requisitos "Must".**

| ID   | Requisito                                                                                                         | Prioridade  |
| ---- | ----------------------------------------------------------------------------------------------------------------- | ----------- |
| RF01 | Registo com nome, email e palavra-passe.                                                                          | Must        |
| RF02 | Início e fim de sessão (login/logout).                                                                            | Must        |
| RF03 | CRUD de semestres. Um semestre está marcado como ativo.                                                           | Must        |
| RF04 | CRUD de disciplinas (nome, sigla, ECTS, nota mínima de aprovação, cor).                                           | Must        |
| RF05 | CRUD de tarefas (título, descrição, prazo, prioridade, disciplina opcional) e marcar como concluída.              | Must        |
| RF06 | Listagem de tarefas com filtros (estado, disciplina, intervalo de prazos) e ordenação por prazo ou prioridade.    | Must        |
| RF07 | CRUD de avaliações de uma disciplina (nome, tipo, peso, data opcional, nota opcional, nota mínima opcional).      | Must        |
| RF08 | Cálculo da média atual, da média final e do estado de aprovação de cada disciplina (RN04–RN06).                   | Must        |
| RF09 | Simulador de "nota necessária" por disciplina, com nota-alvo configurável (RN07).                                 | Must        |
| RF10 | Painel inicial: tarefas dos próximos 7 dias, tarefas em atraso, próximas avaliações e média atual por disciplina. | Must        |
| RF11 | Exportar todos os dados da conta em JSON.                                                                         | Must (RGPD) |
| RF12 | Eliminar a conta e todos os dados associados.                                                                     | Must (RGPD) |
| RF13 | Sessões de estudo: iniciar, terminar e listar, com disciplina opcional (RN11).                                    | Should      |
| RF14 | Estatísticas: horas de estudo por disciplina e progresso das tarefas (gráficos simples).                          | Should      |
| RF15 | Vista de calendário mensal com prazos de tarefas e datas de avaliações.                                           | Should      |
| RF16 | Média global ponderada por ECTS (RN08).                                                                           | Should      |
| RF17 | Alertas na aplicação para prazos nas próximas 48 h.                                                               | Should      |
| RF18 | Exportação CSV de tarefas e avaliações.                                                                           | Could       |
| RF19 | Modo escuro.                                                                                                      | Could       |
| RF20 | Subscrição de calendário (feed `.ics` só de leitura) para usar no Google ou Apple Calendar.                       | Could       |
| RF21 | Instalação como PWA.                                                                                              | Could       |
| RF22 | Notificações por email.                                                                                           | Won't (v1)  |
| RF23 | Integração bidirecional com o Google Calendar, aplicação móvel nativa, chat ou feed do curso.                     | Won't (v1)  |

---

## 6. Histórias de utilizador e critérios de aceitação

**HU01 — Registar uma conta (RF01)**
_Como estudante, quero criar uma conta para guardar os meus dados académicos._

- **Dado** um email ainda não registado e uma palavra-passe com pelo menos 12 caracteres, **quando** submeto o formulário, **então** a conta é criada e fico com sessão iniciada.
- **Dado** um email já registado, **quando** submeto o formulário, **então** vejo "Este email já está registado" e nenhuma conta é criada.
- **Dado** uma palavra-passe com menos de 12 caracteres, **quando** submeto o formulário, **então** vejo o erro junto ao campo e o pedido não chega à base de dados.

**HU02 — Registar avaliações de uma disciplina (RF07)**
_Como estudante, quero registar as componentes de avaliação de uma UC para acompanhar a minha nota._

- **Dado** uma disciplina com avaliações que somam 70%, **quando** tento adicionar uma avaliação de 40%, **então** vejo "A soma dos pesos não pode exceder 100% (atual: 70%)" e a avaliação não é guardada.
- **Dado** uma avaliação sem nota, **quando** a guardo, **então** aparece como "pendente" e não conta para a média atual.

**HU03 — Saber que nota preciso (RF09)**
_Como estudante, quero saber que nota preciso no exame para passar ou para chegar à nota que quero._

- **Dado** o exemplo da secção 4.1, **quando** abro a disciplina, **então** vejo "Para passar precisas de 8,0 no Exame (nota mínima)".
- **Dado** o mesmo exemplo e a nota-alvo 14, **então** vejo "Precisas de 13,5 no Exame".
- **Dado** a nota-alvo 20, **então** vejo "Não é possível atingir 20".

**HU04 — Ver o que está para breve (RF10)**
_Como estudante, quero ver ao entrar o que tenho para fazer nos próximos dias._

- **Dado** tarefas com prazo hoje, daqui a 5 dias e daqui a 10 dias, **quando** abro o painel, **então** vejo só as duas primeiras em "Próximos 7 dias", ordenadas por prazo.
- **Dado** uma tarefa não concluída com prazo ontem, **então** aparece em "Em atraso", destacada.

**HU05 — Isolamento de dados (RN10)**

- **Dado** que o utilizador A tem a disciplina 7, **quando** o utilizador B faz `GET /api/disciplines/7` ou `POST /api/tasks` com `disciplineId: 7`, **então** recebe `404 Not Found` e nada é criado.

**HU06 — Eliminar a conta (RF12)**

- **Dado** um utilizador com sessão iniciada, **quando** confirma a eliminação escrevendo o seu email **e a palavra-passe**, **então** todos os seus dados são apagados, a sessão termina e o login com essas credenciais passa a falhar. Sem a palavra-passe correta (por exemplo, com um cookie roubado), a conta não é eliminada.

---

## 7. Requisitos não funcionais

| ID    | Categoria         | Requisito (mensurável)                                                                                                                                                           |
| ----- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RNF01 | Segurança         | Palavras-passe guardadas com Argon2id (ou bcrypt com custo ≥ 12). Nunca aparecem em texto nem em logs.                                                                           |
| RNF02 | Segurança         | Todos os endpoints, exceto registo e login, exigem autenticação. 100% dos endpoints de recursos têm teste de isolamento (HU05).                                                  |
| RNF03 | Desempenho        | Endpoints de listagem respondem em < 300 ms (p95) com 500 tarefas por utilizador, medido localmente.                                                                             |
| RNF04 | Usabilidade       | Os fluxos "criar tarefa" e "registar nota" fazem-se em ≤ 3 interações a partir do painel.                                                                                        |
| RNF05 | Acessibilidade    | Conformidade com WCAG 2.2 nível AA: contraste ≥ 4,5:1, navegação total por teclado, foco visível, `label` em todos os campos. Verificação com Lighthouse/axe com pontuação ≥ 90. |
| RNF06 | Responsividade    | A interface funciona a partir de 360 px de largura, sem scroll horizontal.                                                                                                       |
| RNF07 | Compatibilidade   | As duas últimas versões do Chrome, Firefox, Safari e Edge.                                                                                                                       |
| RNF08 | Manutenibilidade  | TypeScript em modo `strict`. ESLint e Prettier sem erros no CI. Cobertura de testes ≥ 80% no motor de cálculo e nos serviços do backend.                                         |
| RNF09 | Proteção de dados | Dados alojados na UE. Exportação e eliminação de conta disponíveis (RF11, RF12).                                                                                                 |
| RNF10 | Idioma            | Interface em português europeu. Datas no formato `dd/mm/aaaa` e fuso horário `Europe/Lisbon`.                                                                                    |

---

## 8. Arquitetura

### 8.1 Visão geral

Monólito modular com **uma única origem em produção**: o servidor Express serve a API em `/api` e os ficheiros estáticos do frontend. Esta escolha:

- elimina a configuração de CORS em produção;
- permite usar cookies `httpOnly` próprios (_first-party_) para a autenticação;
- reduz o deploy a um único serviço.

Em desenvolvimento, o Vite faz _proxy_ de `/api` para o Express.

```mermaid
flowchart LR
  U["Browser<br/>React SPA"] -->|"HTTPS /api — JSON + cookie httpOnly"| S["Servidor Node.js<br/>Express + TypeScript"]
  U -->|"HTTPS — ficheiros estáticos"| S
  S -->|"Prisma Client (adapter-pg)"| DB[("PostgreSQL")]
  subgraph Servidor
    R[Rotas] --> M[Middleware<br/>auth · validação Zod · rate limit]
    M --> C[Controladores]
    C --> SV[Serviços<br/>regras de negócio · motor de médias]
    SV --> P[Prisma]
  end
```

### 8.2 Diagrama entidade-relacionamento

```mermaid
erDiagram
  USER ||--o{ SEMESTER : "tem"
  USER ||--o{ DISCIPLINE : "tem"
  USER ||--o{ TASK : "tem"
  USER ||--o{ STUDY_SESSION : "regista"
  SEMESTER ||--o{ DISCIPLINE : "agrupa"
  DISCIPLINE ||--o{ ASSESSMENT : "é avaliada por"
  DISCIPLINE |o--o{ TASK : "associa (opcional)"
  DISCIPLINE |o--o{ STUDY_SESSION : "associa (opcional)"

  USER {
    int id PK
    string name
    string email UK
    string passwordHash
    int tokenVersion
    datetime createdAt
  }
  SEMESTER {
    int id PK
    int userId FK
    string label
    date startDate
    date endDate
    boolean isActive
  }
  DISCIPLINE {
    int id PK
    int userId FK
    int semesterId FK
    string name
    string code
    int ects
    float passingGrade
    string color
  }
  ASSESSMENT {
    int id PK
    int disciplineId FK
    string name
    enum type
    float weight
    datetime date "opcional"
    float score "opcional"
    float minScore "opcional"
  }
  TASK {
    int id PK
    int userId FK
    int disciplineId FK "opcional"
    string title
    string description "opcional"
    datetime dueDate "opcional"
    enum priority
    enum status
    datetime completedAt "opcional"
  }
  STUDY_SESSION {
    int id PK
    int userId FK
    int disciplineId FK "opcional"
    datetime startedAt
    datetime endedAt "opcional"
    string notes "opcional"
  }
```

### 8.3 Diagrama de sequência — criação de tarefa

O diagrama mostra a verificação de posse da disciplina (RN10), que impede o acesso a dados de outros utilizadores (IDOR).

```mermaid
sequenceDiagram
  actor E as Estudante
  participant F as Frontend (React)
  participant A as API (Express)
  participant DB as PostgreSQL

  E->>F: Preenche formulário "Nova tarefa"
  F->>F: Validação Zod (esquema partilhado)
  F->>A: POST /api/tasks {title, dueDate, disciplineId} + cookie
  A->>A: requireAuth: valida JWT e tokenVersion
  A->>A: validate(TaskCreateSchema)
  opt disciplineId presente
    A->>DB: procurar disciplina por id E userId da sessão
    DB-->>A: resultado
    alt disciplina não encontrada ou de outro utilizador
      A-->>F: 404 DISCIPLINE_NOT_FOUND (fim)
    end
  end
  A->>DB: INSERT task (userId da sessão)
  DB-->>A: tarefa criada
  A-->>F: 201 Created + tarefa
  F->>F: Atualiza cache (TanStack Query)
  F-->>E: Tarefa visível na lista
```

### 8.4 Componentes do frontend

```mermaid
flowchart TD
  App --> Router
  Router --> Publico[Rotas públicas]
  Router --> Privado[RequireAuth]
  Publico --> LoginPage & RegisterPage
  Privado --> AppLayout
  AppLayout --> Sidebar & Topbar
  AppLayout --> DashboardPage & TasksPage & DisciplinesPage & DisciplineDetailPage & AccountPage
  DashboardPage --> UpcomingTasks & OverdueTasks & UpcomingAssessments & GradeSummary
  TasksPage --> TaskFilters & TaskList
  TaskList --> TaskItem
  DisciplineDetailPage --> AssessmentTable & GradeSimulator
```

### 8.5 Estrutura do repositório

Monorepo com _npm workspaces_. Os esquemas de validação e os tipos ficam num pacote `shared`, usado pelo frontend e pelo backend. Assim, os dois lados não divergem.

```
studentos/
├── package.json              # workspaces: ["apps/*", "packages/*"]
├── docker-compose.yml        # PostgreSQL para desenvolvimento
├── .env.example
├── .github/workflows/ci.yml
├── packages/
│   └── shared/               # esquemas Zod, tipos e motor de cálculo de médias
│       └── src/{schemas,grades}/
├── apps/
│   ├── api/
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed.ts
│   │   ├── prisma.config.ts
│   │   ├── src/
│   │   │   ├── app.ts        # cria e exporta a app Express (sem listen) — usado nos testes
│   │   │   ├── server.ts     # importa app e chama listen()
│   │   │   ├── routes/  controllers/  services/  middleware/
│   │   │   └── lib/prisma.ts
│   │   └── test/
│   └── web/
│       ├── src/
│       │   ├── main.tsx  routes/  pages/  components/  hooks/  lib/api.ts
│       │   └── index.css     # @import "tailwindcss";
│       ├── e2e/              # testes Playwright
│       └── vite.config.ts
└── README.md
```

> O motor de cálculo de médias fica em `packages/shared/src/grades`. Assim, o simulador funciona no cliente sem pedidos à API, e o servidor usa **a mesma** função para validar e calcular.

---

## 9. Stack tecnológica e justificação

Critérios de escolha: (1) uma só linguagem (TypeScript) em todo o projeto, para reduzir a carga cognitiva de um autor; (2) ferramentas lecionadas ou muito documentadas; (3) custo zero; (4) fáceis de defender perante o júri.

| Camada             | Tecnologia                                                     | Porquê                                                                                                              | Alternativa considerada                                                |
| ------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Linguagem          | **TypeScript** (modo `strict`)                                 | Tipos partilhados entre frontend, backend e base de dados. Apanha erros antes de executar.                          | JavaScript: menos segurança nas refatorações.                          |
| Frontend           | **React** + **React Router**                                   | Componentes reutilizáveis e o ecossistema mais documentado.                                                         | Vue: igualmente válido, mas menos alinhado com o mercado local.        |
| Estado do servidor | **TanStack Query**                                             | Cache, carregamento e erros dos pedidos sem código repetido.                                                        | `useEffect` + `fetch`: mais código e mais bugs.                        |
| Build              | **Vite**                                                       | Arranque e HMR rápidos, configuração mínima.                                                                        | Create React App: descontinuado.                                       |
| Estilos            | **Tailwind CSS v4** (plugin `@tailwindcss/vite`)               | Interface minimalista e consistente, sem CSS próprio extenso.                                                       | CSS Modules: mais lento a iterar.                                      |
| Formulários        | **React Hook Form** + **Zod**                                  | A validação é a mesma no cliente e no servidor (esquemas no pacote `shared`).                                       | Validação manual: duplicada e inconsistente.                           |
| Backend            | **Node.js 24 LTS** + **Express 5**                             | API REST simples. Middleware maduro (helmet, rate limit).                                                           | NestJS: mais estrutura do que este projeto precisa.                    |
| Base de dados      | **PostgreSQL 17**                                              | Relacional e ACID. Os dados académicos são fortemente relacionais. Há planos gratuitos geridos na UE.               | MongoDB: o domínio não justifica um modelo documental.                 |
| ORM                | **Prisma ORM 7** (com `@prisma/adapter-pg`)                    | Schema declarativo, migrações versionadas e cliente tipado.                                                         | Drizzle: boa opção, mas com menos material de apoio.                   |
| Autenticação       | **JWT** em cookie `httpOnly`                                   | Sem estado no servidor. O cookie protege contra roubo do token por XSS (ao contrário do `localStorage`).            | Sessões em base de dados: igualmente válidas, um pouco mais de código. |
| Testes             | **Vitest**, **Supertest**, **Testing Library**, **Playwright** | O Vitest partilha a configuração do Vite e suporta ESM/TS nativamente. Um só executor de testes em todo o monorepo. | Jest: exige configuração extra para ESM e TypeScript.                  |
| CI                 | **GitHub Actions**                                             | Gratuito para repositórios do GitHub, integrado com os PRs.                                                         | —                                                                      |

> **Versões:** no início do projeto devem fixar-se versões exatas no `package.json` e no `package-lock.json`. Atualizações _major_ (ex.: Prisma, Tailwind) só depois de ler o guia de migração respetivo.

---

## 10. Modelo de dados

### 10.1 Schema Prisma

```prisma
// apps/api/prisma/schema.prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
  // O URL de ligação é definido em prisma.config.ts (Prisma 7)
}

enum AssessmentType {
  TEST
  EXAM
  PROJECT
  ASSIGNMENT
  PRESENTATION
  OTHER
}

enum TaskPriority {
  LOW
  MEDIUM
  HIGH
}

enum TaskStatus {
  TODO
  DONE
}

model User {
  id           Int            @id @default(autoincrement())
  name         String
  email        String         @unique
  passwordHash String
  tokenVersion Int            @default(0) // incrementar para invalidar todas as sessões
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt
  semesters    Semester[]
  disciplines  Discipline[]
  tasks        Task[]
  studySessions StudySession[]
}

model Semester {
  id          Int          @id @default(autoincrement())
  label       String       // ex.: "2026/27 — 1.º semestre"
  startDate   DateTime     @db.Date
  endDate     DateTime     @db.Date
  isActive    Boolean      @default(false)
  userId      Int
  user        User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  disciplines Discipline[]

  @@index([userId])
}

model Discipline {
  id            Int            @id @default(autoincrement())
  name          String
  code          String         // sigla, ex.: "PW"
  ects          Int?
  passingGrade  Float          @default(10)
  color         String?        // ex.: "#3B82F6"
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
  userId        Int
  user          User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  semesterId    Int?
  semester      Semester?      @relation(fields: [semesterId], references: [id], onDelete: SetNull)
  assessments   Assessment[]
  tasks         Task[]
  studySessions StudySession[]

  @@unique([userId, semesterId, code])
  @@index([userId])
}

model Assessment {
  id           Int            @id @default(autoincrement())
  name         String
  type         AssessmentType @default(TEST)
  weight       Float          // percentagem: 0 < weight <= 100 (RN02, RN03)
  date         DateTime?
  score        Float?         // null = pendente (RN04)
  minScore     Float?         // nota mínima da componente (RN06)
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt
  disciplineId Int
  discipline   Discipline     @relation(fields: [disciplineId], references: [id], onDelete: Cascade)

  @@index([disciplineId])
}

model Task {
  id           Int          @id @default(autoincrement())
  title        String
  description  String?
  dueDate      DateTime?
  priority     TaskPriority @default(MEDIUM)
  status       TaskStatus   @default(TODO)
  completedAt  DateTime?
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt
  userId       Int
  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  disciplineId Int?
  discipline   Discipline?  @relation(fields: [disciplineId], references: [id], onDelete: SetNull) // RN12

  @@index([userId, status, dueDate])
}

model StudySession {
  id           Int         @id @default(autoincrement())
  startedAt    DateTime
  endedAt      DateTime?   // null = em curso (RN11)
  notes        String?
  userId       Int
  user         User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  disciplineId Int?
  discipline   Discipline? @relation(fields: [disciplineId], references: [id], onDelete: SetNull)

  @@index([userId, startedAt])
}
```

**Restrições garantidas na camada de serviço**, porque não são expressáveis no Prisma:

- 0 ≤ `score`, `minScore`, `passingGrade` ≤ 20;
- soma de `weight` por disciplina ≤ 100 (RN03);
- `endedAt > startedAt`;
- no máximo uma sessão de estudo com `endedAt = null` por utilizador (RN11);
- no máximo um semestre com `isActive = true` por utilizador.

Opcionalmente, estas restrições podem ser reforçadas com `CHECK` _constraints_ numa migração SQL manual.

### 10.2 Configuração do Prisma 7

```ts
// apps/api/prisma.config.ts
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  datasource: { url: env('DATABASE_URL') },
});
```

```ts
// apps/api/src/lib/prisma.ts
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
export const prisma = new PrismaClient({ adapter });
```

### 10.3 Migrações e dados de teste

| Ambiente        | Comando                                     | Efeito                                                                                                                       |
| --------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Desenvolvimento | `npx prisma migrate dev --name <descricao>` | Cria uma nova migração a partir das alterações ao schema e aplica-a.                                                         |
| Desenvolvimento | `npx prisma generate`                       | Regenera o cliente TypeScript.                                                                                               |
| Desenvolvimento | `npx prisma db seed`                        | Cria um utilizador de demonstração com um semestre, 5 disciplinas, tarefas e avaliações (incluindo o exemplo da secção 4.1). |
| Produção / CI   | `npx prisma migrate deploy`                 | Aplica as migrações pendentes. Nunca cria novas migrações nem apaga dados.                                                   |

As migrações ficam versionadas no Git (`prisma/migrations/`). As migrações já aplicadas nunca se editam.

---

## 11. API REST

### 11.1 Convenções

- Prefixo `/api`. Corpo dos pedidos e das respostas em JSON (`Content-Type: application/json`).
- Datas no formato ISO 8601 em UTC (ex.: `2026-11-10T23:59:00Z`). O frontend converte para `Europe/Lisbon`.
- Autenticação por cookie `httpOnly` (secção 12.2). Os pedidos sem sessão válida recebem `401`.
- Um recurso que não existe **ou que pertence a outro utilizador** devolve `404`, sem distinção, para não revelar a existência de IDs alheios (RN10).
- Formato de erro único:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Dados inválidos",
    "details": [{ "path": "weight", "message": "A soma dos pesos não pode exceder 100%" }]
  }
}
```

| Código          | Uso                                                              |
| --------------- | ---------------------------------------------------------------- |
| 200 / 201 / 204 | Sucesso / criado / sem conteúdo                                  |
| 400             | Validação falhou (`VALIDATION_ERROR`)                            |
| 401             | Sem sessão ou sessão expirada                                    |
| 404             | Não encontrado ou não pertence ao utilizador                     |
| 409             | Conflito (ex.: email já registado, sessão de estudo já em curso) |
| 429             | Limite de pedidos excedido                                       |
| 500             | Erro interno (sem detalhes técnicos na resposta)                 |

### 11.2 Endpoints

| Método               | Rota                                    | Descrição                                                                                                             | RF         |
| -------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------- |
| POST                 | `/api/auth/register`                    | Cria a conta e inicia a sessão. `201 {user}`                                                                          | RF01       |
| POST                 | `/api/auth/login`                       | Inicia a sessão. `200 {user}` + cookie                                                                                | RF02       |
| POST                 | `/api/auth/logout`                      | Limpa o cookie. `204`                                                                                                 | RF02       |
| POST                 | `/api/auth/logout-all`                  | Apaga todas as sessões da conta no servidor. `204`                                                                    | RF02       |
| GET                  | `/api/me`                               | Dados do utilizador autenticado                                                                                       | —          |
| GET                  | `/api/me/export`                        | Exporta todos os dados em JSON                                                                                        | RF11       |
| POST                 | `/api/me/password`                      | Muda a palavra-passe (corpo: `{ "currentPassword", "newPassword" }`); termina todas as sessões e abre uma nova. `204` | RF02       |
| DELETE               | `/api/me`                               | Elimina a conta (corpo: `{ "confirmEmail": "...", "password": "..." }`)                                               | RF12       |
| GET / POST           | `/api/semesters`                        | Lista / cria semestres                                                                                                | RF03       |
| PATCH / DELETE       | `/api/semesters/:id`                    | Atualiza / elimina                                                                                                    | RF03       |
| GET / POST           | `/api/disciplines`                      | Lista (`?semesterId=`) / cria                                                                                         | RF04       |
| GET / PATCH / DELETE | `/api/disciplines/:id`                  | Detalhe (inclui avaliações e resumo de notas) / atualiza / elimina                                                    | RF04       |
| GET                  | `/api/disciplines/:id/grades?target=14` | Média atual, média final, aprovação e nota necessária                                                                 | RF08, RF09 |
| GET / POST           | `/api/disciplines/:id/assessments`      | Lista / cria avaliações                                                                                               | RF07       |
| PATCH / DELETE       | `/api/assessments/:id`                  | Atualiza (ex.: registar nota) / elimina                                                                               | RF07       |
| GET / POST           | `/api/tasks`                            | Lista (`?status=&disciplineId=&from=&to=&sort=dueDate`) / cria                                                        | RF05, RF06 |
| GET / PATCH / DELETE | `/api/tasks/:id`                        | Detalhe / atualiza (inclui `status`) / elimina                                                                        | RF05       |
| GET                  | `/api/dashboard`                        | Dados agregados do painel inicial                                                                                     | RF10       |
| POST                 | `/api/study-sessions/start`             | Inicia uma sessão (`{disciplineId?}`). `409` se já houver uma em curso                                                | RF13       |
| POST                 | `/api/study-sessions/:id/stop`          | Termina a sessão                                                                                                      | RF13       |
| GET                  | `/api/study-sessions?from=&to=`         | Lista sessões                                                                                                         | RF13       |

> Usa-se `PATCH` (atualização parcial) em vez de `PUT`, porque o frontend envia só os campos alterados (ex.: marcar uma tarefa como concluída). A documentação completa é gerada em **OpenAPI** a partir dos esquemas Zod (ex.: `zod-to-openapi`) e fica disponível em `/api/docs` em desenvolvimento.

### 11.3 Exemplo

```http
POST /api/tasks HTTP/1.1
Content-Type: application/json
Cookie: sid=<jwt>

{ "title": "Resumo de Matemática", "dueDate": "2026-11-10T23:59:00Z", "priority": "HIGH", "disciplineId": 2 }
```

```http
HTTP/1.1 201 Created
Content-Type: application/json

{
  "id": 42,
  "title": "Resumo de Matemática",
  "description": null,
  "dueDate": "2026-11-10T23:59:00Z",
  "priority": "HIGH",
  "status": "TODO",
  "completedAt": null,
  "disciplineId": 2,
  "createdAt": "2026-10-16T10:12:00Z"
}
```

---

## 12. Segurança e proteção de dados

Referência principal: **OWASP Top 10** e as _cheat sheets_ da OWASP sobre autenticação e armazenamento de palavras-passe.

### 12.1 Palavras-passe

- Hash com **Argon2id** (pacote `argon2`) ou bcrypt com custo ≥ 12.
- Mínimo de 12 caracteres, sem regras de composição obrigatórias. Rejeitar palavras-passe comuns (lista local das 10 000 mais usadas).
- Mensagem de erro de login genérica ("Email ou palavra-passe incorretos"), para não revelar que emails estão registados.

### 12.2 Sessão e JWT

- JWT assinado com HS256, com o segredo `JWT_SECRET` (≥ 32 bytes aleatórios) em variável de ambiente. Nunca vai para o Git.
- _Payload_ mínimo: `{ sub: userId, tv: tokenVersion, iat, exp }`. Validade: 7 dias.
- Enviado em cookie `sid` com `HttpOnly; Secure; SameSite=Lax; Path=/`. O token **não** é guardado em `localStorage`.
- **Logout:** o servidor limpa o cookie. **Terminar todas as sessões:** o servidor incrementa `tokenVersion`, e os tokens com `tv` antigo passam a ser rejeitados pelo middleware.
- Proteção CSRF: `SameSite=Lax` + aceitar apenas `Content-Type: application/json` nas rotas que alteram dados.

### 12.3 API

| Medida                  | Implementação                                                                                                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Validação de entrada    | Esquemas Zod (pacote `shared`) em todos os `body`, `params` e `query`. Os campos desconhecidos são rejeitados.                                                                   |
| Autorização por recurso | Todas as consultas filtram por `userId` da sessão (`where: { id, userId }`), **incluindo as referências** (ex.: `disciplineId` ao criar uma tarefa). Isto previne o IDOR (RN10). |
| Cabeçalhos HTTP         | `helmet()` com CSP adequada à SPA.                                                                                                                                               |
| Limitação de pedidos    | `express-rate-limit`: 10 tentativas por 15 min por IP em `/api/auth/*`; 300 pedidos por 15 min por IP no resto da API.                                                           |
| CORS                    | Não é necessário em produção (mesma origem). Em desenvolvimento usa-se o proxy do Vite.                                                                                          |
| HTTPS                   | Obrigatório em produção. É fornecido pela plataforma de alojamento.                                                                                                              |
| Erros                   | Em produção, nunca se devolvem _stack traces_. Os erros são registados em log no servidor, sem palavras-passe nem tokens.                                                        |
| Dependências            | Dependabot ativo. `npm audit --audit-level=high` no CI.                                                                                                                          |

### 12.4 RGPD

- **Minimização:** só se recolhem nome, email e dados académicos introduzidos pelo próprio utilizador.
- **Localização:** base de dados e servidor alojados em região da UE (ex.: Frankfurt).
- **Direitos do titular:** acesso e portabilidade (RF11, exportação JSON) e apagamento (RF12, eliminação em cascata).
- **Transparência:** página "Privacidade" com a finalidade, os dados recolhidos, onde ficam alojados e o contacto do responsável.

---

## 13. Interface e experiência de utilização

### 13.1 Princípios

- **Minimalista, inspirada no Notion:** fundo claro, conteúdo organizado em blocos e listas, sem elementos decorativos desnecessários.
- **Informação primeiro:** o painel inicial responde às três perguntas da secção 1.1 sem mais cliques.
- **Feedback claro:** todos os ecrãs têm estado de carregamento (_skeleton_), estado vazio (com ação sugerida, ex.: "Ainda não tens disciplinas — Criar disciplina") e estado de erro (com "Tentar novamente").

### 13.2 Ecrãs

| Ecrã                  | Conteúdo principal                                                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Login / Registo       | Formulário simples, validação em tempo real, ligação entre os dois.                                                                 |
| Painel                | Próximos 7 dias, Em atraso, Próximas avaliações, Média atual por disciplina (com indicador de risco se a nota necessária for > 14). |
| Tarefas               | Lista com filtros e ordenação, criação rápida numa linha, marcar como concluída com um clique.                                      |
| Disciplinas           | Cartões por disciplina (sigla, cor, média atual, n.º de tarefas pendentes).                                                         |
| Detalhe da disciplina | Tabela de avaliações com edição em linha, total de pesos, média atual e **simulador de nota necessária** com nota-alvo ajustável.   |
| Conta                 | Dados do perfil, terminar todas as sessões, exportar dados, eliminar conta.                                                         |

### 13.3 Layout e estilo

- **Desktop (≥ 1024 px):** barra lateral fixa (Painel, Tarefas, Disciplinas, Sessões) + área principal com largura máxima de cerca de 1100 px.
- **Mobile (< 768 px):** barra de navegação inferior com 4 ícones e etiqueta de texto. Os formulários abrem em ecrã completo.
- **Tokens de design** definidos no CSS com `@theme` (Tailwind v4): cor de destaque única (ex.: azul `#2563EB`), neutros em cinza, raio de 8 px, espaçamento em múltiplos de 4 px. Tipografia: Inter (ou a fonte do sistema), 16 px de base.
- **Cores por disciplina** só como acento (barra lateral do cartão), nunca como único portador de informação.

### 13.4 Acessibilidade (WCAG 2.2 AA)

- HTML semântico: `<button>`, `<nav>`, `<main>`, `<label for>`.
- Contraste ≥ 4,5:1 no texto. Foco visível em todos os elementos interativos.
- Ícones sem texto com `aria-label`. Os ícones decorativos usam `aria-hidden="true"`.
- O estado de uma tarefa (concluída, em atraso) é indicado por texto ou ícone, não só por cor.
- Testes automáticos com `@axe-core/playwright` nos ecrãs principais.

---

## 14. Estratégia de testes

**Regra:** cada funcionalidade só está concluída quando tem testes e passa no CI. Os testes acompanham o desenvolvimento em cada semana, não ficam para o fim.

| Nível            | Ferramenta                               | O que cobre                                                                                                                                                                     | Meta                     |
| ---------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Unitário         | Vitest                                   | Motor de cálculo de médias (RN03–RN08), com todos os casos da secção 4.1 e casos-limite (sem avaliações, pesos < 100%, nota necessária > 20 ou ≤ 0, nota mínima). Esquemas Zod. | ≥ 95% no módulo `grades` |
| Integração (API) | Vitest + Supertest + PostgreSQL de teste | Cada endpoint: sucesso, validação (400), sem sessão (401), **recurso de outro utilizador (404)**.                                                                               | ≥ 80% nos serviços       |
| Componentes      | Vitest + Testing Library                 | Formulários (validação, submissão), simulador de nota, estados vazio, erro e carregamento.                                                                                      | Componentes críticos     |
| End-to-end       | Playwright                               | Fluxo principal: registo → criar disciplina → adicionar avaliações → ver nota necessária → criar tarefa → concluir. Verificação axe.                                            | 1 a 3 fluxos             |

### 14.1 Exemplos

```ts
// packages/shared/src/grades/grades.test.ts
import { describe, it, expect } from 'vitest';
import { requiredScore } from './grades';

const pw = [
  { weight: 30, score: 12 },
  { weight: 30, score: 15 },
  { weight: 40, score: null, minScore: 8 },
];

describe('requiredScore (RN07)', () => {
  it('para passar, respeita a nota mínima do exame', () => {
    expect(requiredScore(pw, 10)).toEqual({ status: 'needed', value: 8 });
  });
  it('para ter 14 precisa de 13,5', () => {
    expect(requiredScore(pw, 14)).toEqual({ status: 'needed', value: 13.5 });
  });
  it('20 é impossível', () => {
    expect(requiredScore(pw, 20)).toEqual({ status: 'impossible' });
  });
});
```

```ts
// apps/api/test/tasks.test.ts
import request from 'supertest';
import { describe, it, expect, beforeAll } from 'vitest';
import { app } from '../src/app'; // app.ts não chama listen()
import { createUserAndLogin } from './helpers';

describe('POST /api/tasks', () => {
  let alice: string, bob: string, aliceDisciplineId: number;

  beforeAll(async () => {
    ({ cookie: alice, disciplineId: aliceDisciplineId } = await createUserAndLogin('alice'));
    ({ cookie: bob } = await createUserAndLogin('bob'));
  });

  it('cria tarefa na própria disciplina (201)', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Cookie', alice)
      .send({ title: 'Ler capítulo 3', disciplineId: aliceDisciplineId });
    expect(res.status).toBe(201);
  });

  it('não permite associar a disciplina de outro utilizador (404)', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Cookie', bob)
      .send({ title: 'Ataque', disciplineId: aliceDisciplineId });
    expect(res.status).toBe(404);
  });
});
```

```tsx
// apps/web/src/components/TaskList.test.tsx
import { render, screen } from '@testing-library/react';
import { it, expect } from 'vitest';
import { TaskList } from './TaskList';

it('mostra o título de cada tarefa e o estado vazio', () => {
  const { rerender } = render(<TaskList tasks={[{ id: 1, title: 'Resumo de Matemática', status: 'TODO' }]} />);
  expect(screen.getAllByRole('listitem')).toHaveLength(1);
  expect(screen.getByText('Resumo de Matemática')).toBeInTheDocument();

  rerender(<TaskList tasks={[]} />);
  expect(screen.getByText('Sem tarefas pendentes')).toBeInTheDocument();
});
```

---

## 15. CI/CD e alojamento

### 15.1 Integração contínua

```yaml
# .github/workflows/ci.yml
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_USER: studentos
          POSTGRES_PASSWORD: studentos
          POSTGRES_DB: studentos_test
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U studentos"
          --health-interval 5s --health-timeout 5s --health-retries 10
    env:
      DATABASE_URL: postgresql://studentos:studentos@localhost:5432/studentos_test
      JWT_SECRET: ci-only-secret-not-used-in-production-000000
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npx prisma generate --schema apps/api/prisma/schema.prisma
      - run: npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
      - run: npm test -- --coverage
      - run: npm run build
      - run: npm audit --audit-level=high
```

> Os testes E2E (Playwright) correm num _job_ separado, só em `main` ou manualmente (`workflow_dispatch`), para manter o CI dos PRs rápido.

### 15.2 Alojamento (custo 0 €)

| Componente                 | Opção recomendada                                         | Notas                                                                                                                                                                                                                                            |
| -------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Aplicação (API + frontend) | **Render** — _Web Service_ gratuito, região Frankfurt     | Um só serviço. Build: `npm ci && npm run build && npx prisma migrate deploy`. Start: `node apps/api/dist/server.js`. O plano gratuito suspende o serviço por inatividade, por isso o primeiro pedido pode demorar (aceitável numa demonstração). |
| Base de dados              | **Neon** ou **Supabase** — PostgreSQL gratuito, região UE | O plano gratuito de PostgreSQL do Render **expira ao fim de um período limitado**, por isso não serve para dados que têm de durar o semestre.                                                                                                    |
| Domínio                    | Subdomínio da plataforma (ex.: `studentos.onrender.com`)  | HTTPS incluído. Não usar domínios de terceiros (ex.: `ipvc.pt`) sem autorização.                                                                                                                                                                 |

> **Confirmar os limites atuais dos planos gratuitos** na documentação de cada fornecedor antes do deploy. Mudam com frequência.

**Docker** é usado só no desenvolvimento, para a base de dados (Anexo A). Um `Dockerfile` para produção é opcional e só faz sentido se o docente o exigir ou se se mudar para um alojamento baseado em contentores.

---

## 16. Planeamento

Estimativa para **um autor**. Cada semana inclui os testes da funcionalidade respetiva.

| Semana | Entregável                                                                                                         | Horas     |
| ------ | ------------------------------------------------------------------------------------------------------------------ | --------- |
| 1      | Monorepo, ESLint/Prettier, TypeScript strict, `docker-compose`, CI mínimo a passar                                 | 8         |
| 2      | Schema Prisma, migrações, seed. Autenticação backend (registo, login, logout, `me`) + testes                       | 12        |
| 3      | Frontend base: router, layout, login/registo, cliente API, rotas protegidas. **M1: autenticação de ponta a ponta** | 10        |
| 4      | Semestres e disciplinas (backend + frontend + testes de isolamento)                                                | 10        |
| 5      | Tarefas: CRUD, filtros, ordenação                                                                                  | 12        |
| 6      | Avaliações + motor de cálculo de médias (RN03–RN07) + testes unitários exaustivos                                  | 12        |
| 7      | Simulador de nota necessária + painel inicial. **M2: MVP funcional**                                               | 10        |
| 8      | Conta (exportar, eliminar), segurança (helmet, rate limit), revisão de acessibilidade                              | 8         |
| 9      | Deploy (Render + Neon), teste E2E do fluxo principal. **M3: versão publicada**                                     | 10        |
| 10     | Funcionalidades "Should" conforme o tempo disponível (sessões de estudo, calendário)                               | 10        |
| 11     | README, documentação da API, relatório final, preparação da defesa                                                 | 8         |
|        | **Total**                                                                                                          | **110 h** |

Há uma margem de cerca de 15% para imprevistos. Se houver atraso, a semana 10 é a primeira a ser cortada: as funcionalidades "Should" não fazem parte do MVP.

```mermaid
gantt
  dateFormat  YYYY-MM-DD
  title StudentOS — planeamento
  section Base
  Setup e CI              :s1, 2026-10-19, 7d
  Dados e autenticação    :s2, after s1, 7d
  Frontend base (M1)      :s3, after s2, 7d
  section MVP
  Disciplinas             :s4, after s3, 7d
  Tarefas                 :s5, after s4, 7d
  Avaliações e médias     :s6, after s5, 7d
  Simulador e painel (M2) :s7, after s6, 7d
  section Entrega
  Conta e segurança       :s8, after s7, 7d
  Deploy e E2E (M3)       :s9, after s8, 7d
  Should / margem         :s10, after s9, 7d
  Documentação e defesa   :s11, after s10, 7d
```

> Ajustar as datas ao calendário da UC (Q2).

---

## 17. Riscos

| Risco                                                     | Prob. | Impacto | Mitigação                                                                                               |
| --------------------------------------------------------- | ----- | ------- | ------------------------------------------------------------------------------------------------------- |
| Regras de avaliação diferentes entre UC ou do regulamento | Média | Alto    | Validar as RN com o docente e o regulamento (Q3). Parametrizar a nota mínima e os pesos por disciplina. |
| Derrapagem de prazos                                      | Alta  | Médio   | MVP = só os "Must". Semana 10 como margem. Funcionalidades "Should" opcionais.                          |
| Alterações _breaking_ em dependências (Prisma, Tailwind)  | Média | Médio   | Fixar versões. Atualizar só com o guia de migração.                                                     |
| Limites dos planos gratuitos de alojamento                | Média | Médio   | BD num fornecedor com plano gratuito persistente. Fazer backup (`pg_dump`) antes da defesa.             |
| Falha de segurança (IDOR, XSS)                            | Baixa | Alto    | Testes de isolamento obrigatórios, cookie `httpOnly`, validação Zod, React escapa o output por omissão. |
| Dificuldade em defender código gerado com IA              | Média | Alto    | Rever e perceber todo o código antes do _merge_. Manter um registo das decisões neste documento.        |

---

## 18. Questões em aberto

| ID  | Questão                                                                                                                          | A quem                |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Q1  | O projeto é individual ou de grupo? Se for de grupo, como se distribuem os papéis?                                               | Docente               |
| Q2  | Quais são as datas de entrega intermédias e final? Há um modelo de documento ou uma grelha de avaliação obrigatória?             | Docente               |
| Q3  | As RN01–RN08 estão alinhadas com o Regulamento de Avaliação do IPVC (arredondamento, nota mínima, épocas de recurso e melhoria)? | Docente / regulamento |
| Q4  | Deve modelar-se a época de recurso nesta versão, ou fica para a v2?                                                              | Docente               |
| Q5  | Há algum requisito de tecnologia imposto pela UC (ex.: Docker, testes, uma linguagem específica)?                                | Docente               |

---

## 19. Referências

_Consultadas em outubro de 2026._

- React — documentação oficial. https://react.dev
- Vite — documentação oficial. https://vite.dev
- Tailwind CSS — _Installing with Vite_ e _Upgrade guide_ (v4). https://tailwindcss.com/docs
- Node.js — calendário de versões LTS. https://nodejs.org/en/about/previous-releases
- Express — _Security best practices_. https://expressjs.com/en/advanced/best-practice-security.html
- PostgreSQL — documentação oficial. https://www.postgresql.org/docs/
- Prisma ORM — documentação e guia de migração para a versão 7. https://www.prisma.io/docs
- Zod — documentação oficial. https://zod.dev
- Jones, M., Bradley, J., Sakimura, N. (2015). _RFC 7519 — JSON Web Token (JWT)_. IETF. https://www.rfc-editor.org/rfc/rfc7519
- OWASP — _Top 10_ e _Cheat Sheet Series_ (Authentication, Password Storage, Authorization). https://cheatsheetseries.owasp.org
- W3C — _Web Content Accessibility Guidelines (WCAG) 2.2_. https://www.w3.org/TR/WCAG22/
- Regulamento (UE) 2016/679 — Regulamento Geral sobre a Proteção de Dados. https://eur-lex.europa.eu/eli/reg/2016/679/oj
- IPVC — Regulamento de avaliação/frequência aplicável ao curso. _[inserir ligação]_

---

## Anexo A — Configuração do ambiente de desenvolvimento

**Pré-requisitos:** Node.js 24 LTS, Git e Docker Desktop (ou PostgreSQL instalado localmente).

```yaml
# docker-compose.yml
services:
  db:
    image: postgres:17
    environment:
      POSTGRES_USER: studentos
      POSTGRES_PASSWORD: studentos
      POSTGRES_DB: studentos
    ports: ['5432:5432']
    volumes: ['pgdata:/var/lib/postgresql/data']
volumes:
  pgdata:
```

```bash
# .env (copiar de .env.example — nunca fazer commit do .env)
DATABASE_URL="postgresql://studentos:studentos@localhost:5432/studentos"
JWT_SECRET="gerar-com: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
PORT=4000
```

```bash
git clone <repo> && cd studentos
cp .env.example .env
docker compose up -d                 # inicia o PostgreSQL
npm install                          # instala todos os workspaces
npm run db:migrate                   # prisma migrate dev
npm run db:seed                      # dados de demonstração
npm run dev                          # API em :4000 e web em :5173 (em paralelo)
```

Scripts no `package.json` da API:

```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.build.json",
    "start": "node dist/server.js",
    "test": "vitest run",
    "db:migrate": "prisma migrate dev",
    "db:seed": "prisma db seed"
  }
}
```

Proxy do Vite (`apps/web/vite.config.ts`):

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { '/api': 'http://localhost:4000' } },
});
```

---

## Anexo B — Resolução de problemas comuns

| Problema                                        | Solução                                                                                                                                                                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ECONNREFUSED` ao ligar à BD                    | `docker compose ps` para confirmar que o contentor está ativo. Verificar a porta e o `DATABASE_URL`.                                                                                                               |
| `prisma migrate dev` pede _reset_               | Em desenvolvimento, aceitar (os dados de seed são recriados). **Nunca** usar `migrate reset` em produção.                                                                                                          |
| Erro "Cannot find module '../generated/prisma'" | Executar `npx prisma generate`.                                                                                                                                                                                    |
| Classes Tailwind não aplicadas                  | Confirmar `@import "tailwindcss";` no `index.css` e o plugin `@tailwindcss/vite` no `vite.config.ts`. No Tailwind v4 já não se usam as diretivas `@tailwind base/components/utilities` nem o `tailwind.config.js`. |
| Pedidos do frontend devolvem 401                | Confirmar que os pedidos passam pelo proxy do Vite (URL relativo `/api/...`) e usam `credentials: 'include'`.                                                                                                      |
| Erros ESM/CommonJS nos imports                  | Usar `"type": "module"` em todos os pacotes e `"module": "NodeNext"` no `tsconfig.json`, de forma consistente.                                                                                                     |
| Recarregar uma página no deploy dá 404          | Confirmar que o Express tem _fallback_ para `index.html` nas rotas que não são `/api`.                                                                                                                             |

---

## Anexo C — Alterações em relação à versão 1

| Área              | v1                                                                                                                                                                                                       | v2                                                                                                                                                               |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Apresentação      | Marcas de citação da ferramenta de IA (ex.: `【74†L10-L14】`, `【24†embed_image】`), sem autor, data ou versão, mistura de PT-BR e PT-PT                                                                 | Marcas removidas, cabeçalho com metadados, declaração de uso de IA, PT-PT consistente, referências reais com URL                                                 |
| Núcleo do produto | "Cálculo automático de médias" sem fórmula                                                                                                                                                               | Regras de negócio RN01–RN12 com exemplo numérico e simulador de nota necessária                                                                                  |
| Requisitos        | Lista de funcionalidades sem IDs. "Sessões de Estudo" e "gráficos" eram Must mas não estavam no MVP nem no roadmap                                                                                       | RF01–RF23 com MoSCoW coerente (MVP = Must), histórias de utilizador com critérios de aceitação e RNF mensuráveis                                                 |
| Modelo de dados   | `Assessment.score` e `date` obrigatórios (não permitia avaliações futuras), `Session.end` obrigatório, sessão sem disciplina, sem `onDelete`, índices ou timestamps, sem blocos `generator`/`datasource` | Score e data opcionais, `StudySession` com `endedAt` opcional e disciplina, entidade `Semester`, enums, cascatas, índices, timestamps e configuração do Prisma 7 |
| Diagramas         | Imagens sem rótulos nas relações ER, sequência sem verificação de posse                                                                                                                                  | Diagramas Mermaid editáveis (arquitetura, ER, sequência com verificação de IDOR, componentes, Gantt)                                                             |
| API               | Sem logout, sem endpoints de sessões ou médias, `PUT`                                                                                                                                                    | Tabela completa, `PATCH`, formato de erro único, 404 para recursos alheios, OpenAPI                                                                              |
| Segurança         | Local do JWT indefinido, sem verificação de posse das referências, domínio `studentos.ipvc.com`                                                                                                          | Cookie `httpOnly` + `tokenVersion`, prevenção de IDOR, rate limits concretos, secção de RGPD                                                                     |
| Stack             | Citações de slogans, "Prisma ORM 8" inexistente, Node 18 (fim de vida), Tailwind v3, Jest + Cypress                                                                                                      | Justificação por critérios e alternativas, Node 24 LTS, Prisma 7, Tailwind v4, Vitest + Playwright                                                               |
| Testes            | Testes só na semana 9, exemplo RTL com erro (`getByText(/Tarefa/)` ambíguo, texto inexistente), Supertest a importar um ficheiro que chama `listen`                                                      | Testes em cada semana, metas por nível, exemplos corrigidos (separação `app.ts`/`server.ts`, teste de IDOR)                                                      |
| CI/Deploy         | CI sem BD nem `prisma generate`, Node 18, `actions@v3`, Vercel + Render + Docker + AWS/Azure, "sem restrições orçamentais"                                                                               | CI com serviço Postgres, migrações e `npm audit`. Um só serviço (Render) + BD gratuita persistente na UE, custo 0 €                                              |
| Planeamento       | 10 semanas / "90–100 h" / "5–6 semanas" (contraditório)                                                                                                                                                  | 11 semanas, 110 h, marcos M1–M3, margem explícita, Gantt                                                                                                         |
| Estrutura         | Especificação misturada com tutorial                                                                                                                                                                     | Setup e troubleshooting nos anexos A e B, riscos e questões em aberto adicionados                                                                                |

## Anexo D — Registo de decisões de implementação

As decisões técnicas e as diferenças em relação a esta especificação estão em [`ARCHITECTURE.md`](ARCHITECTURE.md) (secção «Diferenças em relação ao spec»). As mais recentes (outubro de 2026), saídas de uma revisão do conselho de avaliação:

- **Sessões no servidor** em vez de JWT com `tokenVersion`: o logout é real e cada sessão pode ser revogada.
- **Mudar a palavra-passe** (`POST /api/me/password`) e **eliminar a conta só com a palavra-passe** (HU06): um cookie roubado não chega para apagar os dados.
- **«Urgência»** é o nome do nível calculado pelo planeador, para não se confundir com a prioridade que o estudante escolhe numa tarefa. «Hoje/amanhã/daqui a N dias» conta-se em dias civis de Lisboa, com a mesma regra na API e na interface.
- **«O que estudar agora»** é recalculado no momento do pedido e inclui tarefas sem duração estimada (pede a duração em vez de as ignorar).
- **Atalho do painel** «Definir disponibilidade» em vez de «Ligar calendário», enquanto as integrações Outlook/Moodle não estiverem disponíveis.
- **«Em risco»:** disciplina em curso cuja média atual, arredondada como a nota final, fica abaixo da nota de aprovação.
