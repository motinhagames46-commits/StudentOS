# Pesquisa: interface moderna e Liquid Glass

Recolhida a 2026-10-30, a pedido do dono do produto: a interface com o estilo Gentelella «parece um site de 2010»; a referência dada foi o Instagram e o pedido incluía «talvez com liquid glass». Substitui a direção de [`gentelella.md`](gentelella.md).

## Como a Apple manda usar o Liquid Glass

- É um material para a **camada de navegação e controlos** (barras de separadores, barras laterais, barras de ferramentas, menus) que flutua por cima do conteúdo. A orientação é não o usar na camada de conteúdo ([Apple HIG, Materials](https://developer.apple.com/design/human-interface-guidelines/materials)).
- Há duas variantes: «regular», que se adapta ao fundo para manter a legibilidade, e «clear», mais transparente, só por cima de conteúdo rico em media. Com conteúdo claro por baixo, a variante clara precisa de uma camada que escureça ([Apple HIG, Materials](https://developer.apple.com/design/human-interface-guidelines/materials)).
- As definições de acessibilidade do sistema (reduzir transparência, aumentar contraste) tornam o vidro mais opaco ou com contorno; a recomendação é testar com elas ligadas ([WWDC25 design group lab](https://developer.apple.com/forums/thread/791070), [Wikipedia](https://en.wikipedia.org/wiki/Liquid_Glass)).
- As críticas na estreia (iOS 26, 2025) foram sobretudo de legibilidade: texto por cima de vidro demasiado transparente ([Wikipedia](https://en.wikipedia.org/wiki/Liquid_Glass)).

## Como fazê-lo bem na web

Fonte principal: [buildmvpfast, receitas de `backdrop-filter`](https://www.buildmvpfast.com/blog/liquid-glass-css-backdrop-filter-recipes-2026).

- Primeiro uma base sólida (quase opaca). O desfoque entra só dentro de `@supports (backdrop-filter: …)`, para nunca ficar texto sobre um fundo transparente sem desfoque.
- `prefers-reduced-transparency` ainda tem suporte irregular nos browsers. Usa-se na mesma, com `prefers-contrast: more` a passar a fundo sólido e contorno mais forte.
- O desfoque custa GPU, sobretudo no telemóvel. Fica em poucas superfícies fixas, e o raio do desfoque não é animado.
- A refração com filtros SVG dentro do `backdrop-filter` é frágil (falha no Firefox): não se usa.

## Instagram como referência

Da interface web e móvel do Instagram retirou-se o tom geral, não elementos concretos:

- fundo claro e neutro;
- barra lateral branca com ícones grandes e texto, sem fundo escuro;
- item ativo a negrito;
- cantos arredondados e linhas finas em vez de molduras.

## Decisão

- **Vidro só na navegação:** barras superiores (telemóvel e desktop), barra de separadores flutuante no telemóvel e menu «Mais». Os cartões e todo o conteúdo ficam com fundo sólido. O diálogo de confirmação desfoca o fundo, que não é animado.
- **Utilitário `glass`** em `apps/web/src/index.css`:
  - sem suporte de desfoque, branco a 96 %;
  - com suporte, branco a 78 %, desfoque de 20 px e saturação a 180 %;
  - com transparência reduzida, branco sólido;
  - com mais contraste, branco sólido e contorno a 45 %.
- **Contraste sobre o vidro:**
  - o texto inativo é `stone-700` ou mais escuro;
  - o separador ativo tem fundo sólido `accent-soft` com texto `accent-ink` (9,1:1), por isso a legibilidade não depende do que passa por baixo.
- **Tipografia:** fonte do sistema (pilha por defeito do Tailwind: SF no Apple, Segoe no Windows, Roboto no Android). A Inter nunca era carregada e era um dos sinais de «app genérica» ([`cores.md`](cores.md)).
- **Forma:**
  - cartões com cantos de 16 px, linha `stone-200` e sombra mínima, sem a régua por baixo do título;
  - botões em cápsula;
  - campos com cantos de 12 px;
  - etiquetas em pílula.
- **Cor:** mantém-se o acento verde-azulado AA ([`cores.md`](cores.md)).
- **Fora desta alteração:** o modo escuro, que obrigaria a rever o contraste de todos os ecrãs.
