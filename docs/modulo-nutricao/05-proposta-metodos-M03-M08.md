# Módulo de Nutrição — aprovação dos métodos de cálculo restantes

Como combinado, nenhum cálculo clínico é programado sem o seu "de acordo". Abaixo estão os métodos que faltam: METs, dobras cutâneas, faixas de referência de gordura, kcal não proteica por grama de nitrogênio, calculadora de medicações e cálculo de fórmulas.

Pode responder por número, por exemplo "2.3: aprovado" ou "2.3: usar a outra opção". Cada item traz a fonte. Quando a fonte que conseguimos consultar não é o artigo original, isso está indicado. Nesses casos, conferimos o coeficiente no original antes de programar.

---

## 1. Gasto energético por METs

### Fórmula (já está no roteiro)

**kcal por sessão = MET × 3,5 × peso (kg) ÷ 200 × duração (min)**

- O peso usado é o da avaliação física.
- O sistema mostra o gasto por sessão, por semana (× frequência) e a média diária (semana ÷ 7).
- **Exemplo:** 80 kg, musculação com MET 5,0, 60 min, 4 vezes por semana. Dá **420 kcal por sessão**, 1.680 kcal por semana e 240 kcal por dia em média.

### Referência dos valores de MET

Proposta: **2024 Adult Compendium of Physical Activities** (Herrmann et al., *Journal of Sport and Health Science*, 2024), feito para adultos de 19 a 59 anos. Fonte: [pacompendium.com](https://pacompendium.com/adult-compendium/), [artigo no PubMed](https://pubmed.ncbi.nlm.nih.gov/38242596/).

Cada atividade da lista do roteiro ganha um código do Compendium. Velocidades convertidas de mph para km/h:

| Modalidade | Atividade do roteiro | Código | MET | Descrição no Compendium |
|---|---|---|---|---|
| Musculação | Leve | 02054 | 3,5 | Vários exercícios, 8–15 repetições, cargas variadas |
| Musculação | Moderada | 02052 | 5,0 | Agachamento, levantamento terra, ritmo lento ou explosivo |
| Musculação | Vigorosa | 02050 | 6,0 | Pesos livres ou máquinas, power lifting ou fisiculturismo, esforço vigoroso |
| Caminhada | Leve | 17170 | 3,0 | 4,0 km/h, terreno plano |
| Caminhada | Moderada | 17190 | 3,8 | 4,5–5,5 km/h, terreno plano |
| Caminhada | Rápida | 17200 | 4,8 | 5,6–6,3 km/h, terreno plano, como exercício |
| Caminhada | Em subida | 17034 | 5,3 | Subida de 1–5%, ritmo moderado a rápido |
| Corrida | Leve | 12030 | 8,5 | 8,0–8,4 km/h |
| Corrida | Moderada | 12050 | 9,3 | 9,7–10,1 km/h |
| Corrida | Vigorosa | 12090 | 12,0 | 12,9 km/h |
| Mountain bike | Pedalada recreativa | 01013 | 5,8 | Estrada de terra, ritmo moderado |
| Mountain bike | Treinamento moderado | 01009 | 8,5 | Mountain bike, geral |
| Mountain bike | Treinamento vigoroso | 01003 | 14,0 | Mountain bike, subida, vigoroso |
| Mountain bike | Competição | 01004 | 16,0 | Mountain bike, competição |
| Ciclismo de estrada/pista | Pedalada leve | 01020 | 6,8 | 16–19 km/h, esforço leve |
| Ciclismo de estrada/pista | Pedalada moderada | 01030 | 8,0 | 19–22 km/h, esforço moderado |
| Ciclismo de estrada/pista | Treinamento vigoroso | 01040 | 10,0 | 22,5–25,6 km/h, esforço vigoroso |
| Ciclismo de estrada/pista | Competição | 01050 | 12,0 | 25,7–30,6 km/h, competição em geral |

Pontos para decidir:

**1.1.** A tabela acima está aprovada? Em dois casos o Compendium não tem um item exatamente igual ao do roteiro:
- O Compendium só tem três itens de mountain bike: geral, subida vigorosa e competição. Para a "pedalada recreativa", propomos o item de bicicleta em estrada de terra em ritmo moderado.
- Musculação não tem itens chamados "leve, moderada, vigorosa". Propomos os três acima.

**1.2.** Para quem precisar de mais precisão, podemos mostrar também opções por velocidade na corrida e na caminhada (o Compendium tem de 4 a 22 km/h) e na caminhada com subida maior (código 17035, subida de 6–10%, MET 7,0). **Incluir?**

**1.3. Pacientes com 60 anos ou mais.** O Compendium de adultos exclui essa faixa. Existe o **Older Adult Compendium 2024**, com METs próprios para 60+, calculados com um gasto de repouso menor (2,7 mL/kg/min no lugar de 3,5). Opções:
- **A (proposta):** para 60+, usar os valores do Older Adult Compendium, com a fórmula ajustada ao repouso de 2,7.
- **B:** usar o Compendium de adultos para todos, com aviso na tela.

**1.4. "GET + METs" (só na categoria Inativo, como já aprovado).** O GET já inclui o gasto de repouso das horas de exercício. Somar o MET inteiro contaria esse repouso duas vezes. Proposta: somar o gasto **líquido**, (MET − 1) × 3,5 × peso ÷ 200 × minutos. O gasto bruto continua aparecendo como informação. **De acordo?**
- No exemplo acima, o líquido fica em **336 kcal por sessão**, contra 420 do bruto.

---

## 2. Dobras cutâneas

### Regras gerais

- Dobras em mm. O sistema só mostra os campos da equação escolhida.
- Sem todas as dobras, o rascunho é salvo, mas o cálculo não roda.
- **Massa gorda** = peso × %G ÷ 100. **Massa livre de gordura** = peso − massa gorda. Também aparece a soma das dobras.
- A avaliação grava o protocolo, a versão, a equação e a conversão usadas.

### 2.1 Conversão da densidade em % de gordura

Jackson-Pollock e Petroski estimam a **densidade corporal (D)**. Para converter em %G, propomos **Siri (1961): %G = (4,95 ÷ D − 4,50) × 100**, a conversão usada nesses estudos e no material de referência brasileiro.

- **Alternativa:** Brozek (1963), %G = (4,57 ÷ D − 4,142) × 100.
- Lohman (1986) propõe constantes por idade e sexo, por exemplo (5,03 ÷ D − 4,59) para mulheres de 20 a 50 anos. Não estão na proposta.

**Aprova Siri como conversão padrão?**

Fonte: Siri WE, 1961, em *Techniques for measuring body composition*; constantes de Lohman conforme [material da disciplina REF0063 da USP](https://edisciplinas.usp.br/pluginfile.php/8803551/mod_resource/content/1/Composi%C3%A7%C3%A3o%20Corporal%20-%20HEYWARD.pdf).

### 2.2 Jackson e Pollock — 7 dobras

Dobras: peitoral, axilar média, tríceps, subescapular, abdominal, supra-ilíaca e coxa (mesmas para os dois sexos). S = soma das 7; I = idade.

| Sexo | Densidade corporal |
|---|---|
| Masculino | D = 1,112 − 0,00043499 × S + 0,00000055 × S² − 0,00028826 × I |
| Feminino | D = 1,097 − 0,00046971 × S + 0,00000056 × S² − 0,00012828 × I |

- **População:** homens de 18 a 61 anos (Jackson & Pollock, *Br J Nutr* 1978;40:497-504, [PubMed](https://pubmed.ncbi.nlm.nih.gov/718832/)); mulheres de 18 a 55 anos (Jackson, Pollock & Ward, *Med Sci Sports Exerc* 1980;12:175-182).
- **Exemplos:** homem de 35 anos com S = 100 mm → D = 1,06391 → **15,3%**. Mulher de 30 anos com S = 110 mm → D = 1,04826 → **22,2%**.

### 2.3 Jackson e Pollock — 3 dobras

| Sexo | Dobras | Densidade corporal |
|---|---|---|
| Masculino | peitoral, abdominal, coxa | D = 1,10938 − 0,0008267 × S + 0,0000016 × S² − 0,0002574 × I |
| Feminino | tríceps, supra-ilíaca, coxa | D = 1,0994921 − 0,0009929 × S + 0,0000023 × S² − 0,0001392 × I |

- Mesmas populações e artigos do item 2.2.
- **Exemplos:** homem de 35 anos com S = 50 mm → **15,6%**. Mulher de 30 anos com S = 60 mm → **24,1%**.
- Como o roteiro pede, a combinação tríceps + peitoral + abdominal da imagem de exemplo **não será usada**.

### 2.4 Faulkner

**%G = (tríceps + subescapular + supra-ilíaca + abdominal) × 0,153 + 5,783**

- Dá o %G direto, sem densidade.
- **Exemplo:** soma de 60 mm → **15,0%**.
- **Ressalvas:**
  - A autoria é discutida na literatura: seria uma adaptação de Faulkner (1968) da equação de Yuhasz.
  - A população original é pouco documentada.
  - Há relatos de que superestima o %G.
  - É muito usada no Brasil, mas sem validação forte.
- Fonte: calculadoras e materiais brasileiros que reproduzem a equação ([exemplo](https://medesportepapers.com.br/calculadoras/faulkner-4-dobras/)).

**Mantém Faulkner com o aviso "precisão não estabelecida"?**

### 2.5 Slaughter (crianças e adolescentes, 8 a 18 anos)

Dá o %G direto. Slaughter MH, Lohman TG et al., *Human Biology* 1988;60(5):709-723 ([PubMed](https://pubmed.ncbi.nlm.nih.gov/3224965/)).

**Tríceps + subescapular (S), quando S ≤ 35 mm:**

| Grupo | %G |
|---|---|
| Meninos | 1,21 × S − 0,008 × S² + C |
| Meninas (todos os estágios) | 1,33 × S − 0,013 × S² − 2,5 |

A constante C dos meninos depende da maturação sexual (estágios de Tanner) e da etnia:

| Maturação | Brancos | Negros |
|---|---|---|
| Pré-púbere (Tanner 1–2) | −1,7 | −3,2 |
| Púbere (Tanner 3) | −3,4 | −5,2 |
| Pós-púbere (Tanner 4–5) | −5,5 | −6,8 |

**Tríceps + subescapular, quando S > 35 mm:**
- Meninos: %G = 0,783 × S + 1,6
- Meninas: %G = 0,546 × S + 9,7

**Tríceps + panturrilha medial (T):**
- Meninos: %G = 0,735 × T + 1,0
- Meninas: %G = 0,610 × T + 5,1

**Exemplos:**
- Menino pré-púbere branco com S = 20 mm → **19,3%**.
- Menina com S = 30 mm → **25,7%**.
- Menina com S = 40 mm → **31,5%**.
- Menino com T = 25 mm → **19,4%**.

**Pontos para decidir:**
- A equação dos meninos exige **estágio de maturação** e **etnia**. Os campos seriam preenchidos pelo nutricionista na avaliação. **Aprova?**
- Uma fonte secundária traz −1,7 em vez de +1,6 na equação dos meninos acima de 35 mm. Vamos conferir no artigo original antes de programar.
- Estudos com DXA mostram que Slaughter subestima o %G em crianças magras e superestima em crianças com mais gordura. Aparece com aviso.

### 2.6 Petroski (adultos brasileiros)

Petroski EL. *Desenvolvimento e validação de equações generalizadas para a estimativa da densidade corporal em adultos*. Tese, UFSM, 1995. Coeficientes conferidos no [material da USP](https://edisciplinas.usp.br/pluginfile.php/8803551/mod_resource/content/1/Composi%C3%A7%C3%A3o%20Corporal%20-%20HEYWARD.pdf) e em [Moreira et al., *Rev Bras Geriatr Gerontol* 2009](https://www.redalyc.org/articulo.oa?id=403838781005).

| Versão | Dobras | Densidade corporal |
|---|---|---|
| Homens (304 homens do sul do Brasil, 18–61 anos) | subescapular, tríceps, supra-ilíaca, panturrilha medial | D = 1,10726863 − 0,00081201 × S + 0,00000212 × S² − 0,00041761 × I |
| Mulheres, versão A (281 mulheres do sul do Brasil, 18–51 anos) | axilar média, supra-ilíaca, coxa, panturrilha medial | D = 1,19547130 − 0,07513507 × log₁₀(S) − 0,00041072 × I |
| Mulheres, versão B | subescapular, tríceps, supra-ilíaca, panturrilha medial | D = 1,02902361 − 0,00067159 × S + 0,00000242 × S² − 0,0002073 × I − 0,00056009 × peso (kg) + 0,00054649 × altura (cm) |

- **Exemplos:**
  - Homem de 35 anos com S = 60 mm → D = 1,05156 → **20,7%**.
  - Mulher de 30 anos, versão A, S = 80 mm → **25,9%**.
  - Mulher de 30 anos, versão B, S = 70 mm, 60 kg, 165 cm → **24,0%**.
- **Ponto para decidir:** a tese traz mais de uma equação feminina. **Qual versão usar: A, B ou as duas, com o nome visível?** A tese também tem uma versão de 5 dobras, que um estudo com mulheres militares considerou a mais precisa ([Rev Bras Cineantropom](https://periodicos.ufsc.br/index.php/rbcdh/article/view/3759)). Se quiser incluí-la, buscamos os coeficientes na tese.

### 2.7 Paciente fora da população do protocolo

Proposta:
- O protocolo de outro sexo **não aparece**.
- Fora da faixa de idade do estudo (por exemplo, Slaughter para adulto ou Petroski feminino para 60 anos), o cálculo **roda com aviso**: "paciente fora da população em que a equação foi desenvolvida".

**De acordo, ou prefere bloquear o cálculo?**

---

## 3. Faixa de referência de gordura corporal

O roteiro proíbe usar uma faixa fixa para todos. Proposta:

**3.1. Adultos de 20 a 79 anos: Gallagher et al. (2000).** "Healthy percentage body fat ranges", *Am J Clin Nutr* 72:694-701 ([PubMed](https://pubmed.ncbi.nlm.nih.gov/10966886/)).
- Faixas por sexo e idade, ligadas aos pontos de corte de IMC da OMS.
- Base: cerca de 1.600 adultos medidos por métodos de referência (modelo de 4 compartimentos e DXA).

Valores para brancos e afro-americanos (a tabela publicada traz outros valores para asiáticos):

| Sexo | Idade | Baixo | Adequado | Sobrepeso | Obesidade |
|---|---|---|---|---|---|
| Feminino | 20–39 | < 21% | 21–32% | 33–38% | ≥ 39% |
| Feminino | 40–59 | < 23% | 23–33% | 34–39% | ≥ 40% |
| Feminino | 60–79 | < 24% | 24–35% | 36–41% | ≥ 42% |
| Masculino | 20–39 | < 8% | 8–19% | 20–24% | ≥ 25% |
| Masculino | 40–59 | < 11% | 11–21% | 22–27% | ≥ 28% |
| Masculino | 60–79 | < 13% | 13–24% | 25–29% | ≥ 30% |

As fontes secundárias divergem em até 1 ponto nos limites. Os valores finais serão transcritos da tabela do artigo original antes de programar.

**3.2. Menores de 20 e maiores de 79 anos:** sem referência aprovada, a tela mostra **"Referência não disponível"**, como manda o roteiro. Se você usa alguma referência para crianças e adolescentes, informe e pesquisamos.

**3.3.** A classificação é só informativa e aparece com a fonte. O roteiro também prevê que o nutricionista possa trocar de referência. Hoje haveria só esta. **Aprova Gallagher para adultos?**

---

## 4. kcal não proteica por grama de nitrogênio (painel da dieta)

| Grandeza | Cálculo |
|---|---|
| kcal não proteica | kcal total da dieta − (proteína em g × 4) |
| Nitrogênio (g) | proteína em g ÷ 6,25 |
| **Relação** | kcal não proteica ÷ g de nitrogênio, exibida como "X:1" sem decimais |

- **Exemplo:** dieta de 2.000 kcal com 100 g de proteína.
  - kcal não proteica: 2.000 − 400 = 1.600.
  - Nitrogênio: 100 ÷ 6,25 = 16 g.
  - Relação: 1.600 ÷ 16 = **100:1**.
- **Fator 6,25.** É o fator geral, pela premissa de que a proteína tem 16% de nitrogênio. A FAO recomenda o fator específico do alimento (fatores de Jones, como 5,7 para trigo e 6,38 para leite) quando ele é conhecido, e 6,25 quando não é. O erro do fator geral fica em cerca de 1% da energia na maioria das dietas. A base TACO não traz o fator usado em cada alimento, então só o geral é viável. Fonte: FAO, *Food energy – methods of analysis and conversion factors*, Food and Nutrition Paper 77, 2003 ([fao.org](https://www.fao.org/4/Y5022E/y5022e03.htm)).
- **kcal total.** É a energia registrada dos alimentos, a mesma do painel, e não 4/4/9. Se faltar dado de energia ou de proteína em algum alimento, o indicador aparece como incompleto.
- **Sem classificação automática.** Faixas recomendadas variam por situação clínica (ASPEN, ESPEN, queimados). O sistema não interpreta o valor.

**4.1. Aprova o cálculo, o fator 6,25 e a exibição "X:1"?**

---

## 5. Calculadora de medicações (só soma, sem prescrição)

Segue o roteiro e os acordos ND-186 e ND-187:

**5.1. Princípio ativo por administração = concentração × quantidade.** Só é calculado quando as unidades combinam:
- mg/mL × mL;
- mg/comprimido × comprimidos;
- UI/mL × mL.

Exemplo: 200 mg/mL × 2 mL = **400 mg**.

**5.2. Total semanal = soma de todas as administrações da semana**, dia a dia, conforme os dias marcados e as vezes por dia.
- Mostra separadamente a quantidade física (por exemplo, 4 mL/semana) e a de princípio ativo (por exemplo, 800 mg/semana).
- Com doses diferentes em dias diferentes, soma cada uma.

**5.3. Sem conversões:**
- não converte UI em mg;
- não converte entre mg, mcg e g (fica na unidade informada);
- não soma substâncias diferentes.

Se faltar dado ou as unidades não combinarem, a calculadora não mostra o resultado e diz o que falta.

**5.4. Frequências que não são semanais** (por exemplo, "a cada 10 dias"). Duas opções:
- **A (proposta):** não calcular e pedir o dado semanal.
- **B:** mostrar a média semanal (quantidade × 7 ÷ intervalo), identificada como média.

**5.5. Arredondamento:** até 2 casas decimais, sem zeros à direita.

**Aprova 5.1 a 5.5?** Na 5.4, qual opção?

---

## 6. Fórmulas manipuladas (quantidade para dispensação)

Acordos ND-172 e ND-173:

**6.1. Quantidade total = quantidade por administração × administrações por dia × dias de tratamento.** Se faltar algum dado, o sistema pede.

**6.2. Componente por unidade ou por dose.** O cadastro diz se a quantidade do componente é por unidade (cápsula, sachê) ou pela dose completa.
- Exemplo: 300 mg por cápsula e 2 cápsulas por dose dão 600 mg por dose.
- Para 2 doses por dia por 30 dias: 120 cápsulas e 36.000 mg do componente.
- A conta não prova que a fórmula é viável na farmácia; aparece com esse aviso.

**6.3.** Sem conversão entre mg, mcg, g e UI, como em medicações.

**Aprova 6.1 a 6.3?**

---

## 7. Suplementos e exames — confirmação

- **Suplementos:** entram na dieta como alimentos, como você decidiu. Não têm cálculo próprio além dos nutrientes do cadastro.
- **Exames:** o roteiro trata só do arquivo, do vínculo com a consulta e dos modelos de solicitação, sem nenhum cálculo. A leitura de bioimpedância só extrai os valores do PDF, para sua conferência.

**7.1. Confirma que não há outro cálculo esperado em suplementos ou exames?**
