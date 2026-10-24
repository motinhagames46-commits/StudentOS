# Design e acessibilidade

## Direção

Estudantes do ensino superior, muitos sobretudo no telemóvel (ver [`PRODUCT.md`](../PRODUCT.md)). Interface em português de Portugal, minimalista e "informação primeiro": o painel responde às três perguntas do produto sem cliques extra (especificação §13).

## Sistema existente

- Fonte de verdade dos tokens: [`apps/web/src/index.css`](../apps/web/src/index.css) (`@theme` do Tailwind 4): cor de destaque `--color-accent` (#2563eb), variantes `-hover` e `-soft`, neutros `stone`, tipografia Inter com fallback do sistema.
- Componentes base: [`apps/web/src/components/ui.tsx`](../apps/web/src/components/ui.tsx) (Button, IconButton, TextField, SelectField, Card, PageHeader, EmptyState, ErrorState, FormError, Skeleton, LoadingList, Badge, DisciplineChip). Reutiliza-os antes de criar novos.
- Cores por disciplina só como acento (barra do cartão, ponto), nunca como único portador de informação. Estado "Em risco" com texto, não só cor.
- Não há biblioteca de componentes externa (shadcn ou similar).

## Interação

- HTML semântico, navegação por teclado, foco visível global (`:focus-visible` com contorno na cor de destaque em `index.css`).
- Campos com `<label>` associado; erros por campo junto ao campo (`TextField error`), erros gerais com `FormError` (`role="alert"`).
- Operações assíncronas: botões com `loading` (evitam duplo envio); mensagens de sucesso com `role="status"`.
- Movimento reduzido: **não existe tratamento específico** (a interface quase não tem animações). Se forem adicionadas, respeitar `prefers-reduced-motion`.

## Layout e revisão

- Mobile < 768 px (`md`): cabeçalho com sino e sair, navegação inferior com 4 itens + "Mais". Desktop: barra lateral fixa e conteúdo com largura máxima.
- Estados obrigatórios em cada ecrã: carregamento (skeleton), vazio (com ação sugerida), erro (com "Tentar novamente").
- Revisões feitas: axe sem violações sérias/críticas em painel, tarefas, disciplina, calendário, plano, importar, preferências, integrações, modo foco e conta (`e2e/accessibility.spec.ts`). Verificação visual manual no browser integrado em telemóvel (375 px) e desktop.

## Manutenção

Alterações visuais atualizam os tokens em `index.css` ou os componentes em `ui.tsx`, e este documento quando uma regra muda. Para revisões de interface usa a skill `web-design-guidelines` (ver [`setup.md`](setup.md)).
