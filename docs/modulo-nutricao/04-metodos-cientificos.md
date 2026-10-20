# 04 — Métodos científicos: propostas para aprovação

Regra da SPEC 01 (decisão 177): cada método de cálculo clínico é pesquisado, apresentado com fórmula, variáveis, população, limitações, ano e fonte verificável, e **só é codificado após aprovação expressa** do responsável. Se não for aprovado, pesquisam-se alternativas. Depois da aprovação, cada método ganha teste numérico com os exemplos desta página.

| ID | Método | Situação |
|---|---|---|
| M-01 | TMB / gasto de repouso (4 equações + valor manual) | **Aprovado em 20/10/2026** |
| M-02 | Gasto energético total (GET) e fator de atividade (NAF) | **Aprovado em 20/10/2026** (opções A e B) |
| M-03 | Gasto por METs | A pesquisar |
| M-04 | Dobras cutâneas (Jackson-Pollock 7 e 3, Faulkner, Slaughter, Petroski) e conversão densidade → % gordura | A pesquisar |
| M-05 | Faixas de referência de % de gordura | A pesquisar |
| M-06 | kcal não proteica / g de nitrogênio (fator N/proteína) | A pesquisar |
| M-07 | Calculadora de medicações (mL × mg/mL; totais semanais) | A pesquisar |
| M-08 | Cálculos de fórmulas, suplementos e exames | A pesquisar, conforme os campos reais |
| F-01 | Fonte complementar de nutrientes ausentes na TACO | **Aguardando decisão** (ver abaixo) |

Convenções em todos os métodos: peso em kg, altura em cm (salvo indicação), idade em anos completos na data da avaliação, resultado em kcal/dia arredondado só na exibição. O método, a versão e os dados de entrada ficam gravados na avaliação.

---

## M-01 — Taxa metabólica basal / gasto energético de repouso

O roteiro pede: Harris-Benedict revisada (Roza e Shizgal, 1984), Mifflin-St Jeor (1990), FAO/OMS/UNU (1985), equações das DRIs quando aplicáveis, Cunningham quando houver massa livre de gordura, e campo manual.

### 1. Harris-Benedict revisada — Roza & Shizgal (1984)

| Sexo | Equação (kcal/dia) |
|---|---|
| Masculino | 88,362 + 13,397 × P + 4,799 × A − 5,677 × I |
| Feminino | 447,593 + 9,247 × P + 3,098 × A − 4,330 × I |

- **Variáveis:** P = peso (kg), A = altura (cm), I = idade (anos).
- **População:** reanálise dos dados originais de Harris e Benedict, 337 adultos saudáveis (168 homens, 169 mulheres).
- **O que estima:** taxa metabólica basal.
- **Limitações:** erro de ±213 kcal/dia (homens) e ±201 kcal/dia (mulheres); tende a superestimar em obesos.
- **Fonte:** Roza AM, Shizgal HM. *Am J Clin Nutr* 1984;40(1):168-182. Coeficientes conferidos em [Wikipedia — Harris–Benedict equation](https://en.wikipedia.org/wiki/Harris%E2%80%93Benedict_equation) e na diretriz holandesa [Richtlijnendatabase (PDF)](https://richtlijnendatabase.nl/gerelateerde_documenten/file/3130/1/Harris%20en%20Benedict%20formule.pdf).
- **Exemplos de teste:** homem, 80 kg, 180 cm, 35 anos → **1.825 kcal/dia**; mulher, 60 kg, 165 cm, 35 anos → **1.362 kcal/dia**.

### 2. Mifflin-St Jeor (1990)

| Sexo | Equação (kcal/dia) |
|---|---|
| Masculino | 10 × P + 6,25 × A − 5 × I + 5 |
| Feminino | 10 × P + 6,25 × A − 5 × I − 161 |

- **Variáveis:** P (kg), A (cm), I (anos).
- **População:** 498 adultos saudáveis de 19 a 78 anos (247 mulheres, 251 homens), 264 com peso normal e 234 obesos, gasto medido por calorimetria indireta.
- **O que estima:** gasto energético de repouso (GER).
- **Limitações:** derivada de população norte-americana; precisão menor após emagrecimento intenso. A forma simplificada acima é a publicada pelos autores ("a simplificação e a separação por sexo não afetaram o valor preditivo"); a forma original da regressão (9,99 × P + 6,25 × A − 4,92 × I + 166 × sexo − 161) difere em poucas kcal.
- **Fonte:** Mifflin MD, St Jeor ST, Hill LA, Scott BJ, Daugherty SA, Koh YO. *Am J Clin Nutr* 1990;51(2):241-247. PMID 2305711. Resumo em [AGRIS/FAO](https://agris.fao.org/search/ar/records/65de26fe7c7033e84be9ee76).
- **Proposta:** usar a forma simplificada.
- **Exemplos de teste:** homem 80 kg, 180 cm, 35 anos → **1.755 kcal/dia**; mulher 60 kg, 165 cm, 35 anos → **1.295 kcal/dia**.

### 3. FAO/OMS/UNU (1985) — a partir do peso

| Idade (anos) | Masculino (kcal/dia) | Feminino (kcal/dia) |
|---|---|---|
| 0–3 | 60,9 × P − 54 | 61,0 × P − 51 |
| 3–10 | 22,7 × P + 495 | 22,5 × P + 499 |
| 10–18 | 17,5 × P + 651 | 12,2 × P + 746 |
| 18–30 | 15,3 × P + 679 | 14,7 × P + 496 |
| 30–60 | 11,6 × P + 879 | 8,7 × P + 829 |
| > 60 | 13,5 × P + 487 | 10,5 × P + 596 |

- **Variáveis:** P (kg), idade para escolher a faixa.
- **População:** compilação de Schofield et al. (1985), cerca de 7.000 medições, com forte peso de dados europeus (47% italianos).
- **O que estima:** taxa metabólica basal.
- **Limitações:** tende a superestimar a TMB em várias populações, inclusive tropicais; faixas etárias com limites coincidentes.
- **Proposta para os limites:** faixa fechada no início e aberta no fim (18 ≤ I < 30, 30 ≤ I < 60, I ≥ 60). **Confirmar.**
- **Variante com peso e altura** (Anexo 1 do mesmo relatório, altura em metros) existe e pode ser oferecida como opção separada se o nutricionista quiser.
- **Fonte:** FAO/WHO/UNU. *Energy and protein requirements.* WHO Technical Report Series 724, 1985 — Tabela 5, [fao.org/4/aa040e/aa040e06.htm](https://www.fao.org/4/aa040e/aa040e06.htm); Anexo 1, [fao.org/4/aa040e/AA040E15.htm](https://www.fao.org/4/aa040e/AA040E15.htm).
- **Exemplos de teste:** homem 80 kg, 35 anos → **1.807 kcal/dia**; mulher 60 kg, 35 anos → **1.351 kcal/dia**.

### 4. Cunningham (1980)

| Equação (kcal/dia) |
|---|
| 500 + 22 × MLG |

- **Variáveis:** MLG = massa livre de gordura (kg), vinda da dobra cutânea ou da bioimpedância **da mesma avaliação**.
- **População:** reanálise de 223 indivíduos dos dados de Harris e Benedict.
- **O que estima:** taxa metabólica basal; independe de sexo e idade quando a MLG é conhecida.
- **Limitações:** a qualidade depende do método usado para obter a MLG; só é oferecida quando a avaliação tem MLG.
- **Fonte:** Cunningham JJ. *Am J Clin Nutr* 1980;33(11):2372-2374. [Cópia do artigo (PDF)](https://pdodds.w3.uvm.edu/files/papers/others/1980/cunningham1980a.pdf).
- **Exemplo de teste:** MLG 65 kg → **1.930 kcal/dia**.

### 5. DRIs (National Academies, 2023)

As DRIs de energia de 2023 **não estimam TMB**: dão o gasto energético total (GET) direto, por categoria de atividade. Por isso a proposta é usá-las no M-02 (GET), não como opção de TMB, cumprindo a regra do roteiro de não apresentar equação de gasto total como TMB.

### 6. Valor manual

Campos: valor (kcal/dia), método ou justificativa, observação. Identificado na tela e no histórico como "informado pelo profissional".

### Decisão do responsável (20/10/2026)

Aprovadas as cinco perguntas: as quatro equações com estes coeficientes; Mifflin na forma simplificada; faixas da FAO fechadas no início (30 e 60 anos entram na faixa de cima); Cunningham só com MLG da mesma avaliação; versão da FAO com peso e altura também oferecida.

### O que foi submetido em M-01

1. As quatro equações acima com os coeficientes exatos.
2. Mifflin na forma simplificada.
3. Limites das faixas da FAO.
4. Cunningham disponível só com MLG da mesma avaliação.
5. DRIs fora da lista de TMB e dentro do GET (M-02).

---

## M-02 — Gasto energético total (GET) e NAF

O roteiro mostra os fatores 1,00 / 1,12 / 1,27 / 1,45 (sedentário, pouco ativo, ativo, muito ativo) e avisa que eles não são multiplicadores universais da TMB. Esses fatores são os **coeficientes de atividade (PA) das equações de EER do IOM de 2005**, que foram substituídas pelas DRIs de 2023. Eles não devem multiplicar uma TMB de Harris-Benedict ou Mifflin.

### Opção A (proposta) — DRIs 2023, GET direto pela categoria

Adultos a partir de 19 anos, peso estável (GET = EER). Idade (I) em anos, altura (A) em cm, peso (P) em kg.

| Sexo | Categoria | GET (kcal/dia) |
|---|---|---|
| Masculino | Inativo | 753,07 − 10,83 × I + 6,50 × A + 14,10 × P |
| Masculino | Pouco ativo | 581,47 − 10,83 × I + 8,30 × A + 14,94 × P |
| Masculino | Ativo | 1.004,82 − 10,83 × I + 6,52 × A + 15,91 × P |
| Masculino | Muito ativo | −517,88 − 10,83 × I + 15,61 × A + 19,11 × P |
| Feminino | Inativo | 584,90 − 7,01 × I + 5,72 × A + 11,71 × P |
| Feminino | Pouco ativo | 575,77 − 7,01 × I + 6,60 × A + 12,14 × P |
| Feminino | Ativo | 710,25 − 7,01 × I + 6,54 × A + 12,34 × P |
| Feminino | Muito ativo | 511,83 − 7,01 × I + 9,07 × A + 12,56 × P |

- **População:** banco internacional de água duplamente marcada (padrão-ouro de gasto total em vida livre).
- **Precisão:** R² 0,73 (homens) e 0,71 (mulheres); erro médio 339 kcal/dia (homens) e 246 kcal/dia (mulheres).
- **Limitações:** só adultos; gestantes, lactantes e menores de 19 anos têm equações próprias (fora desta proposta). As categorias se referem ao nível habitual de atividade; o relatório define os limites numéricos de NAF de cada categoria — a transcrever antes de codificar.
- **Fonte:** National Academies of Sciences, Engineering, and Medicine. *Dietary Reference Intakes for Energy.* Washington, DC: The National Academies Press, 2023 — Tabela S-1, [nationalacademies.org/read/26818/chapter/2](https://www.nationalacademies.org/read/26818/chapter/2); desenvolvimento das equações no cap. 5, [NCBI Bookshelf NBK591021](https://www.ncbi.nlm.nih.gov/books/NBK591021/).
- **Exemplos de teste** (homem 80 kg, 180 cm, 35 anos): inativo **2.672**, pouco ativo **2.892**, ativo **3.072**, muito ativo **3.442** kcal/dia.

### Opção B — TMB × NAF (FAO/OMS/UNU 2001)

GET = TMB × NAF, com NAF escolhido pelo nutricionista entre as faixas do relatório FAO/OMS/UNU de 2004 (*Human energy requirements*): sedentário/leve 1,40–1,69; ativo/moderado 1,70–1,99; vigoroso 2,00–2,40. Compatível com TMB de FAO 1985, Harris-Benedict ou Mifflin. Fonte a transcrever: [fao.org/4/y5686e/y5686e07.htm](https://www.fao.org/4/y5686e/y5686e07.htm). **Não pesquisada a fundo ainda**; detalho se a opção A não for aprovada ou se o nutricionista quiser as duas.

### Relação com METs (M-03)

- Na opção A, a categoria já contém a atividade habitual: o gasto por METs aparece só como informação, sem somar ("GET + METs" fica oculto ou com aviso de dupla contagem).
- "GET + METs" só é exibido se o nutricionista escolher a categoria **Inativo** e cadastrar as atividades por METs separadamente. **Confirmar se esse é o comportamento desejado.**

### Decisão do responsável (20/10/2026)

- As duas opções ficam disponíveis: A (DRIs 2023) e B (TMB × NAF da FAO/OMS/UNU 2004). Antes de codificar a opção B, transcrever as faixas de NAF da fonte original.
- Os fatores 1,00 / 1,12 / 1,27 / 1,45 do NutriDiet não serão usados.
- "GET + METs" só soma na categoria Inativo, com as atividades cadastradas por METs.

### O que foi submetido em M-02

1. Opção A (DRIs 2023) como método padrão do GET.
2. Não usar os fatores 1,00/1,12/1,27/1,45 do NutriDiet (são do IOM 2005, substituído).
3. Opção B oferecida ou não.
4. Regra de "GET + METs" acima.

---

## F-01 — Fonte complementar para os nutrientes que a TACO não traz

Nutrientes ausentes na TACO: vitamina B12, folato, vitaminas D e E, selênio, açúcares, fibras solúveis e insolúveis. O responsável autorizou escolher uma fonte reconhecida, a ser apresentada antes do uso.

| Opção | O que é | Prós | Contras |
|---|---|---|---|
| **A. TBCA** (Tabela Brasileira de Composição de Alimentos, USP/FoRC) | Base brasileira, mais de 6 mil alimentos | Alimentos e preparações brasileiros, mesma lógica da TACO | Licença indicada nos documentos da TBCA: **CC BY-NC-ND 4.0** (sem uso comercial e sem obras derivadas). Para usar num aplicativo pago seria preciso autorização por escrito da TBCA. Cobertura exata de B12, folato, vit. D, selênio e açúcares a confirmar. |
| **B. USDA FoodData Central** (Departamento de Agricultura dos EUA) | Base norte-americana | **Domínio público (CC0 1.0)**, sem necessidade de autorização; cobre todos os nutrientes faltantes | Alimentos e preparações dos EUA: cada alimento da TACO precisa de uma correspondência escolhida e aprovada pelo nutricionista (ex.: "Arroz, tipo 1, cozido" ↔ "Rice, white, long-grain, cooked"). Sem correspondência confiável, o dado continua "não disponível". |
| **C. Só cadastro manual** | O nutricionista completa os valores quando precisar | Nenhuma dependência externa | Trabalhoso; poucos valores preenchidos |

**Proposta:** opção B, aplicada por correspondência aprovada, começando pelos alimentos mais usados nas dietas. Cada valor importado fica identificado com a fonte "USDA FoodData Central", o código do alimento americano e a data, e pode ser revisto. A opção A só se a TBCA autorizar por escrito.

Fontes: [FoodData Central — licença CC0](https://fdc.nal.usda.gov/) · [TBCA — tabelas complementares (versão 7.0)](https://www.tbca.net.br/arquivosestaticos/Tabelas_complementares_Vitamina_A_Carotenoides_n.pdf) · [Agência FAPESP sobre a TBCA](https://agencia.fapesp.br/59305)
