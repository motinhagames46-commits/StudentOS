# Design e acessibilidade

## Direção

Estudantes do ensino superior, muitos sobretudo no telemóvel (ver [`PRODUCT.md`](../PRODUCT.md)). Interface em português de Portugal e "informação primeiro": o painel responde às três perguntas do produto sem cliques extra (especificação §13). Desde 2026-10-25, a navegação e o painel seguem o estilo do [Gentelella](https://github.com/ColorlibHQ/gentelella) (MIT; reproduz-se só a estrutura e as medidas, sem código nem imagens): é um desvio ao "minimalista" do §13, pedido pelo dono do produto. Medidas e contrastes em [`research/gentelella.md`](research/gentelella.md).

## Sistema existente

- Fonte de verdade dos tokens: [`apps/web/src/index.css`](../apps/web/src/index.css) (`@theme` do Tailwind 4). Um só acento, `--color-accent` (#0F7F6B, botões, ligações e foco), derivado do verde-azulado da marca e escurecido até AA, com `-hover`, `-soft` (fundos) e `-ink` (texto sobre `-soft`); escolha e contrastes em [`research/cores.md`](research/cores.md). Neutros `stone`, tipografia Inter com fallback do sistema. Tokens do estilo Gentelella: `sidebar*` (#2A3F54 e texto #E7E7E7/#C4CFDA), `brand` (#1ABB9C, **só decorativo**: indicador ativo e barras, 2,4:1 sobre branco), `page` (#F7F7F7) e `panel-border` (#E6E9ED). Não usar cores por defeito do Tailwind (`blue-*`, `indigo-*`) para destaque.
- Texto diretamente sobre o fundo `page` usa `stone-600` ou mais escuro: `stone-500` fica abaixo de 4,5:1.
- `Card` é o painel `x_panel` (borda, sombra leve, título com borda inferior) em toda a app; `collapsible` acrescenta o botão de recolher (`aria-expanded`), com a escolha guardada só no browser.
- Componentes base: [`apps/web/src/components/ui.tsx`](../apps/web/src/components/ui.tsx) (Button, IconButton, TextField, SelectField, Card, PageHeader, EmptyState, ErrorState, FormError, Skeleton, LoadingList, Badge, DisciplineChip). Reutiliza-os antes de criar novos.
- Cores por disciplina só como acento (barra do cartão, ponto), nunca como único portador de informação. Estado "Em risco" com texto, não só cor.
- Não há biblioteca de componentes externa (shadcn ou similar).

## Interação

- HTML semântico, navegação por teclado, foco visível global (`:focus-visible` com contorno na cor de destaque em `index.css`).
- Campos com `<label>` associado; erros por campo junto ao campo (`TextField error`), erros gerais com `FormError` (`role="alert"`).
- Operações assíncronas: botões com `loading` (evitam duplo envio); mensagens de sucesso com `role="status"`.
- Movimento reduzido: as poucas transições decorativas (seta de recolher, «+» das perguntas frequentes) usam `motion-safe:`; novas animações seguem a mesma regra.

## Layout e revisão

- Mobile < 768 px (`md`): cabeçalho com sino e sair, navegação inferior com 4 itens + "Mais". Desktop: barra lateral escura de 230 px (perfil, secções «Geral» e «Definições», item ativo com borda verde de 5 px), barra superior de 58 px com alertas e utilizador, e conteúdo com largura máxima. Os separadores da linha de estatísticas só aparecem com 5 colunas.
- Página de entrada (`/` sem sessão): só afirmações verificáveis na app, sem testemunhos, números de utilizadores, preços nem urgência (regras e fontes em [`research/onboarding-e-landing.md`](research/onboarding-e-landing.md)). A captura `apps/web/public/landing/painel.jpg` usa uma conta de teste com dados de exemplo e regenera-se com `npm run build` seguido de `SCREENSHOTS=1 npx playwright test -c e2e/playwright.config.ts screenshots`.
- Estados obrigatórios em cada ecrã: carregamento (skeleton), vazio (com ação sugerida), erro (com "Tentar novamente").
- Revisões feitas: axe sem violações sérias/críticas em painel, tarefas, disciplinas, disciplina, calendário, plano, importar, preferências, integrações, modo foco e conta (`e2e/accessibility.spec.ts`), na página de entrada (`e2e/landing.spec.ts`) e nos passos do questionário (`e2e/onboarding.spec.ts`). Verificação visual manual no browser integrado em telemóvel (375 px) e desktop.

## Manutenção

Alterações visuais atualizam os tokens em `index.css` ou os componentes em `ui.tsx`, e este documento quando uma regra muda. Para revisões de interface usa a skill `web-design-guidelines` (ver [`setup.md`](setup.md)).
