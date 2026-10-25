# Decisões pendentes (para o dono do produto)

Trabalho de 2026-10-25 no ramo local `feat/primeira-impressao` (página de entrada, questionário de boas-vindas, dashboard estilo Gentelella), feito com o utilizador fora de casa. Estas decisões ficaram para ele; entretanto avançou-se com a opção indicada como **suposição**. Responde por número.

| # | Pergunta | Suposição usada até haver resposta |
|---|---|---|
| 1 | «Atrair vendas»: queres cobrar no futuro (planos pagos, pagamentos)? | Não: a app é grátis; o botão diz «Criar conta grátis» e não há preços. Cobrar exigiria pagamentos, termos e RGPD revistos. |
| 2 | Posso fazer merge para `main` e push (publica no Render)? | Não: tudo fica em commits locais no ramo. |
| 3 | Botões e destaques: manter o azul `#2563EB` ou passar ao verde acessível `#0F7F6B` do Gentelella? A barra lateral escura fica aprovada? | Barra lateral escura estilo Gentelella; botões continuam azuis. |
| 4 | Público da página de entrada: colegas do IPVC ou qualquer estudante do ensino superior? Posso nomear o IPVC? | Qualquer estudante do superior português; o IPVC aparece só como origem do projeto («feito por um estudante de TPSI»). |
| 5 | Secção «Quem fez»: queres o teu nome/foto/texto? | Só factos neutros, sem nome nem foto. |
| 6 | Primeira visita lenta (servidor gratuito do Render adormece): manter acordado com um ping, ou alojar a página de entrada à parte? | Só mitigações sem serviços novos (ecrã de espera imediato, cache dos ficheiros). Nota: um ping pelo GitHub Actions não correria enquanto a faturação da conta estiver bloqueada. |
| 7 | Confirmas que a base de dados do Neon está em Frankfurt (UE)? | A página de privacidade já o afirma (DEPLOY.md); não verificado de novo. |
| 8 | O questionário de boas-vindas deve ser obrigatório? | Opcional, com «Saltar» em cada passo. |
| 9 | Fonte oficial dos ECTS das UC de TPSI para um catálogo pré-preenchido? | Sem catálogo: o estudante escreve as UC e os ECTS. |
| 10 | Falar com o docente sobre o desvio ao §13 da especificação (visual minimalista → Gentelella)? | O desvio fica documentado em `docs/design.md`. |
| 11 | Testar o questionário com 3–5 colegas? | Por fazer; sem analytics, é a forma honesta de medir. |
| 12 | Próximas funcionalidades (ver `docs/research/mercado.md`: notificações, tarefas recorrentes, faltas…)? | Nenhuma começada. |
