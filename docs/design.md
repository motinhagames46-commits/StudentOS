# Design e acessibilidade

## Direção

Estudantes do ensino superior, muitos sobretudo no telemóvel (ver [`PRODUCT.md`](../PRODUCT.md)). Interface em português de Portugal e "informação primeiro": o painel responde às três perguntas do produto sem cliques extra (especificação §13). Desde 2026-10-30 o visual é claro e limpo, com o Instagram como referência de tom, e usa Liquid Glass só na camada de navegação; substitui o estilo Gentelella de 2026-10-25. Pesquisa, fontes e decisões em [`research/interface-moderna.md`](research/interface-moderna.md).

## Sistema existente

- Fonte de verdade dos tokens: [`apps/web/src/index.css`](../apps/web/src/index.css) (`@theme` do Tailwind 4). Um só acento, `--color-accent` (#0F7F6B, botões, ligações e foco), derivado do verde-azulado da marca e escurecido até AA, com `-hover`, `-soft` (fundos) e `-ink` (texto sobre `-soft`); escolha e contrastes em [`research/cores.md`](research/cores.md). Neutros `stone` e a fonte do sistema (pilha por defeito do Tailwind). Outros tokens: `brand` (#1ABB9C, **só decorativo**: barras de progresso, 2,4:1 sobre branco), `page` (#F5F5F4, o fundo) e `panel-border` (#E7E5E4, a linha dos cartões). Não usar cores por defeito do Tailwind (`blue-*`, `indigo-*`) para destaque.
- Texto diretamente sobre o fundo `page` usa `stone-600` ou mais escuro: `stone-500` fica abaixo de 4,5:1.
- `Card` é o cartão de conteúdo em toda a app (cantos de 16 px, linha fina, sombra mínima, fundo sólido); `collapsible` acrescenta o botão de recolher (`aria-expanded`), com a escolha guardada só no browser. Botões em cápsula, campos com cantos de 12 px, etiquetas em pílula.
- Vidro: o utilitário `glass` (`index.css`) só na navegação que flutua sobre o conteúdo, nunca em cartões. Base quase opaca sem suporte de desfoque; sólido com `prefers-reduced-transparency` e com `prefers-contrast: more`. Texto sobre vidro em `stone-700` ou mais escuro; o item ativo leva fundo sólido `accent-soft`.
- Componentes base: [`apps/web/src/components/ui.tsx`](../apps/web/src/components/ui.tsx) (Button, IconButton, TextField, SelectField, Card, PageHeader, EmptyState, ErrorState, FormError, Skeleton, LoadingList, Badge, DisciplineChip). Reutiliza-os antes de criar novos.
- Cores por disciplina só como acento (barra do cartão, ponto), nunca como único portador de informação. Estado "Em risco" com texto, não só cor.
- Não há biblioteca de componentes externa (shadcn ou similar).

## Interação

- HTML semântico, navegação por teclado, foco visível global (`:focus-visible` com contorno na cor de destaque em `index.css`).
- Campos com `<label>` associado; erros por campo junto ao campo (`TextField error`), erros gerais com `FormError` (`role="alert"`).
- Operações assíncronas: botões com `loading` (evitam duplo envio); mensagens de sucesso com `role="status"`.
- Avisos da app (`components/Toast.tsx`, nunca `alert`/`confirm` do browser): região `aria-live`, não roubam o foco e o tempo pára com o rato ou o foco em cima (WCAG 2.2.1). Marcar tarefas é otimista (aparece logo e volta atrás com aviso se falhar). Eliminar tarefas usa «Desfazer» durante 10 s: o pedido só sai quando o aviso fecha, por isso fechar a página não apaga nada. Pedidos com mais de 3 s mostram «A ligar ao servidor…». As restantes eliminações usam o diálogo da app (`components/ConfirmDialog.tsx`, `<dialog>` nativo): foco em «Cancelar», Esc cancela, e eliminar uma disciplina diz quantas avaliações, notas e faltas são apagadas.
- Movimento reduzido: as poucas transições decorativas (seta de recolher, «+» das perguntas frequentes) usam `motion-safe:`; novas animações seguem a mesma regra.

## Layout e revisão

- Mobile < 768 px (`md`): cabeçalho de vidro fixo no topo com sino e sair; barra de separadores de vidro a flutuar no fundo, com 4 itens + "Mais" (menu também de vidro). Desktop: barra lateral branca de 244 px (secções principais, «Definições» e «Terminar sessão»; item ativo a negrito com fundo claro), barra superior de vidro de 64 px com alertas, utilizador e semestre, e conteúdo com largura máxima. Avisos e barras fixas no telemóvel ficam acima da barra de separadores. Os separadores da linha de estatísticas só aparecem com 5 colunas.
- Página de entrada (`/` sem sessão): só afirmações verificáveis na app, sem testemunhos, números de utilizadores, preços nem urgência (regras e fontes em [`research/onboarding-e-landing.md`](research/onboarding-e-landing.md)). A captura `apps/web/public/landing/painel.jpg` usa uma conta de teste com dados de exemplo e regenera-se com `npm run build` seguido de `SCREENSHOTS=1 npx playwright test -c e2e/playwright.config.ts screenshots`.
- Estados obrigatórios em cada ecrã: carregamento (skeleton), vazio (com ação sugerida), erro (com "Tentar novamente").
- Revisões feitas: axe sem violações sérias/críticas em painel, tarefas, disciplinas, disciplina, calendário, plano, importar, preferências, integrações, modo foco e conta (`e2e/accessibility.spec.ts`), na página de entrada (`e2e/landing.spec.ts`) e nos passos do questionário (`e2e/onboarding.spec.ts`). Verificação visual manual no browser integrado em telemóvel (375 px) e desktop.

## Manutenção

Alterações visuais atualizam os tokens em `index.css` ou os componentes em `ui.tsx`, e este documento quando uma regra muda. Para revisões de interface usa a skill `web-design-guidelines` (ver [`setup.md`](setup.md)).
