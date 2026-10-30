# Referência visual: Gentelella (clássico)

> Substituída a 2026-10-30 por [`interface-moderna.md`](interface-moderna.md). Fica como registo da decisão anterior.

Recolhida a 2026-10-25. Gentelella ([ColorlibHQ/gentelella](https://github.com/ColorlibHQ/gentelella)) é um template de administração Bootstrap/jQuery, licença **MIT** ("Copyright (c) 2014–2026 Aigars Silkalns & Colorlib"). O demo ao vivo é hoje a v4 (sem `tile_count`/`x_panel`); o visual clássico foi medido na 1.4.0 (jsDelivr) e cruzado com `custom.scss` da branch Bootstrap-5. **Não usamos o código** (a app é React 19 + Tailwind 4): só a estrutura e valores de medida, sem o nome, logótipo nem imagens do demo.

## Estrutura

- **Barra lateral** 230 px, fundo `#2A3F54`; perfil no topo (avatar 56 px, "Bem-vindo," + nome); cabeçalhos de secção 11 px, maiúsculas; itens 13–14 px `#E7E7E7`, ícones `#C4CFDA`; item ativo com **borda direita de 5 px `#1ABB9C`** e gradiente `#334556 → #2C4257`; colapsada a 70 px só com ícones.
- **Barra superior** 58 px, clara, com botão de menu à esquerda e utilizador (avatar 29 px + nome) e alertas à direita.
- **Área principal** `#F7F7F7`; título de página 24 px.
- **`tile_count`**: linha de 4–6 estatísticas com separador vertical; rótulo 13 px com ícone, número 30–40 px peso 600, linha de comparação com ▲ verde / ▼ vermelho.
- **`x_panel`**: fundo branco, borda `#E6E9ED`, barra de título com h2 18 px + texto pequeno e ícones à direita (recolher), borda inferior 2 px; na versão 2.x, raio 8 px e sombra `0 2px 8px rgba(0,0,0,.1)`.
- **Progresso**: pista `#F5F5F5`, barra `#1ABB9C`; `widget_summary` (rótulo / barra / valor).
- **Tabelas** com cabeçalho escuro `rgba(52,73,94,.94)`.
- Paleta: verde `#1ABB9C`, azul `#3498DB`, vermelho `#E74C3C`, laranja `#F39C12`, roxo `#9B59B6`, escuro `#34495E`.

## Acessibilidade (contrastes calculados)

| Par                                                   | Rácio              | WCAG AA |
| ----------------------------------------------------- | ------------------ | ------- |
| `#73879C` sobre `#F7F7F7` / `#fff` (texto principal)  | 3,45 / 3,70        | falha   |
| `#1ABB9C` sobre `#fff`                                | 2,43               | falha   |
| Branco sobre `#1ABB9C` / `#3498DB` / `#E74C3C`        | 2,43 / 3,15 / 3,82 | falha   |
| `#E7E7E7` / `#C4CFDA` sobre `#2A3F54` (barra lateral) | 8,77 / 6,86        | passa   |

Ajustes verificados (≥ 4,5:1): texto `#566A80`; verde para texto/botões `#0F7F6B` (manter `#1ABB9C` só em preenchimentos decorativos e no indicador ativo, ≥ 3:1 sobre `#2A3F54`); vermelho `#C0392B`; azul `#2874A6`; ícones ≥ 3:1 (ex. `#7B8794`). O original remove o contorno de foco (`outline: 0`): é preciso `:focus-visible`, e as setas ▲/▼ não podem depender só da cor.

## Responsivo

Abaixo de 992 px a barra lateral desaparece; no StudentOS, gaveta sobreposta com fundo escurecido, foco preso e Esc para fechar (a barra inferior do telemóvel mantém-se).
