# Pesquisa: cores que não pareçam «feitas por IA»

Recolhida a 2026-10-25 (decisão 3 em [`../decisoes-pendentes.md`](../decisoes-pendentes.md)). As fontes são sobretudo blogues e artigos de opinião: tratam-se as relações de causa como plausíveis, não como medidas.

## O que denuncia uma app genérica

- O azul/índigo por defeito do Tailwind tornou-se o «aspeto por defeito» da web. O criador do Tailwind pediu desculpa em 2025 por ter posto os botões dos exemplos em índigo; esses exemplos foram copiados em milhares de projetos e os modelos de IA aprenderam-nos ([prg.sh](https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website), [DEV](https://dev.to/lyd_lyd_d4869af25d33ce0eb/why-do-ai-generated-websites-all-look-the-same-k2j)).
- Outros sinais repetidos: gradientes roxo→azul, a fonte Inter, grelhas de três cartões e heróis iguais ([925studios](https://www.925studios.co/blog/ai-slop-design-tells), [codemyspec](https://codemyspec.com/blog/vibe-coded-websites-look-the-same)).
- O conselho comum é impor tokens de marca explícitos em vez de aceitar os valores por defeito ([robotsonpayroll](https://robotsonpayroll.substack.com/p/how-to-avoid-that-vibe-coded-look)).

No StudentOS o sinal era o `#2563EB` (o `blue-600` do Tailwind) ao lado do verde do estilo Gentelella: duas paletas a competir.

## Porque verde-azulado

- É lido como confiança e clareza sem o peso «corporativo» do azul-marinho, e paletas frias e pouco saturadas são associadas a calma e foco ([Octet](https://octet.design/journal/teal-color-meaning), [Verpex](https://verpex.com/blog/website-tips/best-color-combinations-for-educational-websites)).
- Os tons médios de verde-azulado costumam falhar com texto branco: é preciso medir ([Visily](https://www.visily.ai/blog/teal-color)).
- Evitou-se o `teal-700` do Tailwind (`#0F766E`), sugerido em guias de cores para apps de educação: seria outro valor por defeito.

## Decisão

Um só acento, derivado do verde-azulado da marca (`#1ABB9C`, já usado no indicador ativo da barra lateral) e escurecido até cumprir AA. Contrastes calculados (WCAG 2.x):

| Token          | Valor     | Uso                                     | Contraste                                                                     |
| -------------- | --------- | --------------------------------------- | ----------------------------------------------------------------------------- |
| `accent`       | `#0F7F6B` | botões, ligações, foco                  | 4,92:1 sobre branco (e texto branco por cima); 4,59:1 sobre o fundo `#F7F7F7` |
| `accent-hover` | `#0B6656` | botão em hover                          | 6,89:1 com texto branco                                                       |
| `accent-soft`  | `#F0F9F6` | fundos de destaque                      | `accent` por cima: 4,59:1                                                     |
| `accent-ink`   | `#0A4D41` | texto sobre `accent-soft`               | 9,11:1                                                                        |
| `brand`        | `#1ABB9C` | só decorativo (indicador ativo, barras) | 2,43:1: nunca para texto                                                      |

As cores das disciplinas continuam a ser escolha do estudante e só servem de acento. Ficou de fora, de propósito, uma segunda cor de destaque (por exemplo coral): um só acento é mais coerente e menos genérico.
