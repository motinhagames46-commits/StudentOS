# Conjunto de avaliação: ficha da UC → avaliações

Serve para medir quantos campos um extrator acerta antes de construir o «Colar ficha da UC» (veredicto do conselho de 2026-10-21): um parser determinístico primeiro e um LLM só para o que falhar. O número decide se a IA compensa e é a prova a mostrar na defesa.

## Fonte

- [`ipvc-tpsi.json`](ipvc-tpsi.json): as 18 unidades curriculares do CTeSP em Tecnologias e Programação de Sistemas de Informação (IPVC, ESTG), com as fichas obtidas a 2026-10-21 da [página pública do curso](https://www.ipvc.pt/cursos/tecnologias-e-programacao-de-sistemas-de-informacao-2/?mp=603&mc=598&tab=tab-planoestudos).
- 17 fichas têm secção de avaliação. A de «Matemática (CTeSP Formação Complementar)» diz que o programa não está disponível e fica como **caso negativo**.

## Textos das fichas

Os textos são do IPVC e **não vão para o Git**. Para os descarregar para `.cache/` (ignorado pelo Git):

```bash
node scripts/fetch-fichas-uc.mjs
```

O script faz o mesmo pedido que o botão «Consultar» da página do curso, dentro da sessão anónima que essa página abre. Usa o `curl` do sistema porque o servidor do IPVC não envia o certificado intermédio e o `fetch` do Node não o vai buscar. A verificação TLS continua ligada. Gera um `.txt` (o que o estudante copia do browser) e o `.html` original por ficha.

## Formato de cada caso

| Campo                                              | Significado                                                                                              |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `id`, `cdDiscip`                                   | Identificador do caso e código da UC no IPVC (é o que o script usa).                                     |
| `year`, `semester`, `academicYear`                 | Como aparecem na ficha. O ano letivo varia de ficha para ficha.                                          |
| `available`                                        | `false` se a ficha não tem programa; nesse caso `expected` é `null`.                                     |
| `difficulty`                                       | `fácil`, `médio`, `difícil` ou `negativo`, para relatar os resultados por grupo.                         |
| `expected.discipline`                              | Nome, ECTS e `passingGrade`, como em `disciplineCreateSchema` (sem a sigla).                             |
| `expected.assessments`                             | A proposta certa: `name`, `type`, `weight`, `minScore`, `date`, como em `assessmentCreateSchema`.        |
| `acceptTypes`                                      | Outros tipos defensáveis para essa avaliação.                                                            |
| `expected.examRegime`                              | Regime das épocas de exame, só informativo (`null` se a ficha não o descreve).                           |
| `attendanceMinPercent`                             | Presença mínima, quando a ficha a exige. O StudentOS não a guarda.                                       |
| `expected.unrepresentable`, `expected.ambiguities` | Regras que o modelo de dados não guarda e dúvidas que a ficha não resolve. O extrator deve assinalá-las. |
| `traps`                                            | O que torna o caso difícil, para perceber os erros.                                                      |

## Regras de anotação

- **Proposta = avaliação no período letivo** (contínua ou periódica): é a que o estudante acompanha durante o semestre. O regime de exame fica em `examRegime`.
- **Pesos globais, em %, somam 100.** Pesos encaixados multiplicam-se: em Segurança de Redes, a assiduidade vale 20 % dos 80 % da componente prática, ou seja 16 %. Em Serviços Distribuídos, as percentagens das subcomponentes já são globais e não se multiplicam.
- **`minScore`** só quando a ficha dá a nota mínima desse elemento; caso contrário é `null`, e não 8 «por costume».
- **`date` é sempre `null`.** As fichas não têm datas, e qualquer data extraída é um erro (spec §8.2: nunca preencher silenciosamente uma data).
- **`passingGrade` é 10 em todos os casos.** O StudentOS arredonda a nota final, por isso «≥ 9,5» e «≥ 10» são a mesma regra.
- **A sigla não está nas fichas.** O extrator pode sugerir uma, mas tem de a marcar como sugestão.
- **Tipos:** frequência ou teste → `TEST`; exame → `EXAM`; trabalho prático ou relatório → `ASSIGNMENT`; projeto → `PROJECT`; apresentação → `PRESENTATION`; assiduidade, participação e avaliação pela empresa → `OTHER`.
- **Os nomes são sugestões** e não se comparam letra a letra.

## Como pontuar

- **Caso certo:** mesmo número de avaliações, os mesmos pesos (como multiconjunto), todos os `minScore` certos e nenhuma data. Num caso negativo, nenhuma avaliação proposta.
- **Por campo:** `weight` e `minScore` exatos; `type` certo se for `type` ou um dos `acceptTypes`.
- **Assinalar:** proporção das `ambiguities` e das `unrepresentable` que o extrator mostra ao estudante.
- Relatar por `difficulty` e comparar o parser determinístico com o LLM no mesmo conjunto.

## Estado

`reviewedByHuman` está a `true`: os resultados esperados foram anotados por Claude a partir das fichas e revistos à mão pelo autor a 2026-10-21, caso a caso, contra a secção «Avaliação» de cada ficha. As 18 bateram certo sem correções. As fichas mudam de ano para ano: se voltares a descarregá-las e o texto mudar, revê o esperado e volta a pôr `false` até o confirmares.
O teste [`../../fichas-uc-dataset.test.ts`](../../fichas-uc-dataset.test.ts) garante que o esperado é algo que o StudentOS aceita gravar, com pesos a somar 100 e sem datas.
