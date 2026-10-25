# Pesquisa: onboarding, página de entrada e práticas de produto

Recolhida a 2026-10-25 (pesquisa web). **[F]** = facto com fonte (muitas são análises de terceiros, não dados oficiais); **[I]** = inferência.

## Conclusão

Os melhores funis mostram valor antes de pedir compromisso (Duolingo); os piores são longos e usam urgência falsa (Noom). No StudentOS, a conversão ética vem de: um plano real em menos de 3 minutos, o produto verdadeiro visível sem conta, e transparência (privacidade, limites, quem o fez). [I]

## Questionário de boas-vindas

- **Duolingo:** experimentar uma lição antes do registo deu cerca de +20% de utilizadores ativos diários; botões "Mais tarde" e pedidos opcionais +8,2% ([First Round](https://review.firstround.com/the-tenets-of-a-b-testing-from-duolingos-master-growth-hacker)). Registo com 6–7 passos ([UserGuiding](https://userguiding.com/blog/duolingo-onboarding-ux)). [F]
- **Noom:** até 113 ecrãs e 10–15 minutos, temporizador de 15 minutos, processamento "em parte teatral" ([RevenueCat](https://www.revenuecat.com/blog/growth/web-to-app-onboarding-funnel)). [F] Não copiar.
- **Fabulous:** números de utilizadores contraditórios minam a confiança; perguntas sensíveis sem explicar o uso ([Behavioral Scientist](https://www.thebehavioralscientist.com/articles/fabulous-app-product-critique-onboarding)). [F]
- **Headspace/Calm:** recolhem objetivos sem mudar o conteúdo — personalização vazia ([ScreensDesign](https://screensdesign.com/articles/calm-onboarding-design/)). [F] **Cada pergunta tem de mudar o resultado.**
- **NN/g:** perguntas breves, explicar porquê, "Saltar", só o que personaliza; o resto pede-se mais tarde ([NN/g](https://www.nngroup.com/articles/mobile-app-onboarding/)). [F]
- Tamanho: média de 3,9 ecrãs de perguntas em 119 apps ([Lazyweb](https://www.lazyweb.com/research/onboarding-flow-length-benchmark-steps.md)); 3–7 perguntas com 65–85% de conclusão vs. 25–45% acima de 16 (fonte de vendedor, só direcional — [Outgrow](https://outgrow.co/blog/?p=62795)). [F]
- **Ilusão do trabalho** (Buell & Norton 2011): mostrar esforço aumenta o valor percebido — só é ético se o trabalho mostrado for real (o planeador determinístico permite mostrar etapas verdadeiras). [F/I]
- **Progresso inicial concedido:** 34% vs. 19% de conclusão (Nunes & Drèze 2006, via [resumo](https://siliconcanals.com/t-car-wash-loyalty-cards-endowed-progress/)); **intenções de implementação** d≈0,65 (Gollwitzer & Sheeran 2006). Aplicação ética: "Quando vais fazer a primeira sessão?" e marcá-la. [F/I]
- **Permissões:** pedir notificações ao carregar a página tem baixa aceitação; pedir depois de uma ação do utilizador e com pré-explicação ([web.dev](https://web.dev/articles/permissions-best-practices)). [F]
- **RGPD:** não perguntar por stress/saúde (art. 9.º, categoria especial); minimização (art. 5.º, 1, c). [F]

## Página de entrada

- **Julian Shapiro:** título diz exatamente o que vendes; compra = desejo − (esforço + confusão); 3–6 funcionalidades que respondem a objeções; CTA repetido ([guia](https://www.julian.com/guide/startup/landing-pages)). [F]
- **Todoist** (screenshot no hero, "Start for free", independência) e **Linear** (UI real no hero). [F]
- Conversão mediana: 6,6% geral, 3,8% SaaS (Unbounce 2024) — ordem de grandeza ([Unbounce](https://unbounce.com/conversion-benchmark-report/saas-conversion-rate/)). [F]
- Estrutura recomendada [I]: hero com produto real → problema (curto e honesto) → solução → 4 funcionalidades como benefícios → como funciona em 3 passos → privacidade e transparência → perguntas frequentes → CTA final.
- **Prova social honesta sem utilizadores:** história do autor em primeira pessoa ([Stanford Credibility](https://credibility.stanford.edu/guidelines)); metodologia aberta (como se calcula a média); privacidade como argumento; honestidade sobre limites (Moodle só com autorização do IPVC). [F/I]
- **Proibido:** testemunhos e números inventados; urgência falsa; chamar "grátis" ao que se paga — práticas sempre desleais na Diretiva 2005/29/CE, Anexo I ([texto](https://www.legislation.gov.uk/eudr/2005/29/annex/I/adopted)); avaliações falsas (Diretiva Omnibus). Padrões enganosos: [EDPB 03/2022](https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-032022-deceptive-design-patterns-social-media_en) por analogia. [F/I]
- **Técnica:** Core Web Vitals (LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,1 — [web.dev](https://web.dev/articles/defining-core-web-vitals-thresholds)); mobile-first, contraste, teclado. [F]

## Práticas de produto

- **Momento aha:** comportamento medível que separa retidos de quem abandona ([Koji](https://www.koji.so/docs/aha-moment-research)). Hipótese StudentOS: em 7 dias, ≥ 2 disciplinas com avaliações e ≥ 1 sessão planeada concluída. [F/I]
- **Encaixe produto-mercado:** inquérito "Como te sentirias se deixasses de usar…?" a quem usou ≥ 2 vezes; ~40 respostas dão direção ([Superhuman](https://blog.superhuman.com/how-superhuman-built-an-engine-to-find-product-market-fit/)). [F]
- **Analytics sem rastreio:** contadores agregados no backend, sem cookies nem identificadores; ferramentas de terceiros exigem análise de consentimento (CNIL/CNPD). [F/I]
- **A/B tests** não são fiáveis com pouco tráfego ([Evan Miller](https://www.evanmiller.org/how-not-to-run-an-ab-test.html)); preferir testes com 5–8 estudantes. [F/I]
- **Estados vazios:** título positivo e uma ação primária ([Carbon](https://carbondesignsystem.com/patterns/empty-states-pattern/)). [F]
