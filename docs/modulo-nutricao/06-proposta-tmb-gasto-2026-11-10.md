# TMB e gasto energético: relatório de auditoria e proposta

Origem: `SPEC_Avaliacao_Fisica_TMB_GET_2026-11-10.md`, com nove imagens de referência, em `Downloads\spec_avaliacao_fisica`.

**Situação: aprovado pelo nutricionista em 10/11/2026 e implementado (Fase 2).** As respostas e o que foi feito estão na seção 9. As seções 1 a 8 são o relatório da Fase 1, como foi enviado.

Convenções deste relatório:
- **[E]**: evidência publicada.
- **[P]**: decisão de produto.
- **[H]**: hipótese a confirmar.
- Os números das imagens foram lidos diretamente nelas. A Imagem5 é idêntica à Imagem4 (byte a byte).

---

## 1. O que existe hoje

| Peça | Onde | O que faz |
| --- | --- | --- |
| Fórmulas de TMB | `lib/nutricao/avaliacao.ts` (`PROTOCOLOS_TMB`, `calcularTmb`) | São 5 fórmulas, mais um valor manual (aprovadas em 20/10/2026, M-01): Harris-Benedict **revisada (Roza & Shizgal, 1984)**, Mifflin-St Jeor 1990, FAO/OMS/UNU 1985 só com peso (de 0 anos em diante), FAO 1985 com peso e altura (a partir de 10 anos) e Cunningham 1980 (MLG da mesma avaliação). Faltando um dado, a fórmula não calcula e diz o que falta. Fora da população do estudo, calcula e mostra um aviso. |
| Gasto total (GET) | mesmo arquivo (`METODOS_GET`, `calcularGetDri`, `calcularGetNaf`) | Dois métodos aprovados em M-02. **DRIs 2023:** equação própria por categoria de atividade, que não usa a TMB. **TMB × NAF da FAO 2004:** o NAF é digitado e precisa estar entre 1,40 e 2,40. |
| Atividades por MET | mesmo arquivo (`ATIVIDADES`, `gastoDaAtividade`) | 37 atividades do Compendium 2024. Para 60 anos ou mais, usa o Older Adult Compendium com repouso de 2,7 mL/kg/min. Calcula o gasto bruto e o líquido, este como (MET − 1) × 3,5 × peso ÷ 200 × min. **Só soma ao GET na categoria Inativo das DRIs**, para não contar a atividade duas vezes. |
| Documento e cálculo | `lib/nutricao/avaliacaoDocumento.ts` (`AvaliacaoDoc`, esquema 1, e `calcularAvaliacao`) | Guarda as entradas. O resultado é calculado a partir delas. |
| Tela | `components/nutricao/avaliacao/EditorDaAvaliacao.tsx`, seção "Gasto energético" | Lista de protocolo da TMB com "?" (equação, população e fonte), lista do método de GET e lista de atividades. |
| Histórico | `lib/servidor/avaliacoes.ts` (`resultadosDe`) | **A avaliação finalizada guarda os resultados congelados.** Um rascunho é recalculado a cada abertura. |
| Dieta | `lib/nutricao/dieta.ts` (`gastoReferencia`) | A dieta guarda uma **cópia** da TMB, do GET e do "GET + METs" da avaliação escolhida. |
| PDF | `lib/servidor/pdf/avaliacao.tsx` | Mostra a TMB e o GET a partir dos resultados. |
| Testes | `tests/avaliacao.test.mjs` | Casos de referência das fórmulas atuais. |

Fluxo atual: o nutricionista abre a avaliação, escolhe o protocolo da TMB, escolhe o método do GET (DRIs ou TMB × NAF) e pode listar atividades. Ao finalizar, os resultados congelam, e a dieta pode copiar o gasto daquela avaliação.

**Conclusão da auditoria do código:** os coeficientes implementados conferem com as fontes do M-01 e do M-02. Não encontrei erro de cálculo. Encontrei duas diferenças em relação às imagens:
- As imagens mostram uma **janela separada**, "Taxa Metabólica". No sistema, isso é uma seção dentro da avaliação física.
- As imagens mostram os **fatores 1,2 a 1,9**. Eles não existem no sistema e já tinham sido deixados de fora no M-02 por falta de fonte.

## 2. Fórmulas: atual × imagem × proposta

Caso de exemplo usado em todo o relatório: **mulher, 44 anos, 165 cm, 70 kg, 30% de gordura (MLG de 49 kg)**.

| Fórmula | Implementação atual | O que a imagem diz | Divergência | Proposta | Exemplo (kcal/dia) |
| --- | --- | --- | --- | --- | --- |
| **Mifflin-St Jeor** | 10P + 6,25A − 5I + 5 (H) / −161 (M). Aviso fora de 19 a 78 anos. | "Padrão-ouro para adultos saudáveis" (Imagem1) | **"Padrão-ouro" está errado.** O padrão é a calorimetria indireta. [E] Na revisão sistemática de Frankenfield et al. (2005), a Mifflin foi a equação que mais vezes ficou dentro de ±10% do medido, em adultos não obesos e obesos. | Manter a equação. Lembrete: "Adultos de 19 a 78 anos, com peso normal ou obesidade. Na revisão de 2005, foi a equação mais precisa nesse público. Usa peso, altura, idade e sexo." | 1.350 |
| **Harris-Benedict** | **Revisada, de 1984** (Roza & Shizgal) | "Fórmula clássica de 1919. Tende a superestimar." (Imagens 8 e 9) | A imagem fala da versão de 1919; o sistema usa a revisada de 1984 (aprovada no M-01). [E] Frankenfield (2005): tende a superestimar em parte dos adultos. | Manter a de 1984 e **não** acrescentar a de 1919. Corrigir o texto do lembrete: "Versão revisada (1984) dos dados de 1919. Tende a superestimar a TMB em parte dos adultos. Usa peso, altura, idade e sexo." | 1.416 (a de 1919 daria 1.424) |
| **FAO/OMS/UNU** | Duas versões de 1985 (Schofield): só peso, de 0 anos em diante; peso e altura, a partir de 10 anos. Faixas fechadas no início. | "Por faixa etária e sexo (≥10 anos)", com 1985/2004 (Imagem7) | [E] O relatório de 2004 **manteve** as equações de Schofield de 1985. O "≥10 anos" da imagem vale só para a versão com altura. A versão só com peso já calcula crianças. | Manter as duas versões. Lembrete por versão, com a idade mínima correta: "só peso: todas as idades; peso e altura: a partir de 10 anos". Nada de pediátrico novo é inventado; isso já existe e foi aprovado. | 1.438 (só peso) · 1.433 (peso e altura) |
| **Cunningham** | 500 + 22 × MLG (kg). A MLG vem das dobras ou da bioimpedância da mesma avaliação. Sem MLG, não calcula. | "Indicada para indivíduos treinados" (Imagem3) | [E] Foi derivada de dados de adultos em geral, não de atletas (Cunningham, 1980). [E] Teve boa concordância em atletas de endurance (Thompson & Manore, 1996). Por isso, "indicada para treinados" é uma simplificação. | Manter. Lembrete: "Usa a massa livre de gordura em kg desta avaliação. Costuma ser preferida em pessoas treinadas, com muita massa magra. O erro da medida de gordura passa para a TMB." | 1.578 |
| **Tinsley (MLG)** | **Não existe no sistema** | "Atletas de força/físico. 25,9 × MLG + 284" (Imagem6) | [E] Tinsley, Graybeal & Moore (2019): 27 atletas de fisiculturismo (17 homens e 10 mulheres), com MLG por DXA. A equação com MLG (25,9 × MLG + 284) confere com o resumo publicado. Há também a equação com peso (24,8 × P + 10). | **Decisão D6**: acrescentar ou não. Se entrar, o lembrete diz: "Desenvolvida em 27 atletas de fisiculturismo, com MLG por DXA. Fora desse público, a precisão não foi estabelecida." | 1.553 (MLG) · 1.746 (peso) |

Observação sobre o exemplo: na mesma pessoa, as fórmulas variam de **1.350 a 1.578 kcal/dia**, uma diferença de 17%. Nenhuma é universalmente a melhor. A escolha continua com o nutricionista, e o lembrete existe para orientar essa escolha. **Nenhum critério bloqueia o cálculo**: fora da população do estudo, a fórmula continua calculando e mostra um aviso, como hoje.

## 3. Fatores de atividade: atual × imagem × proposta

| Item | Implementação atual | Imagens 1, 3 e 8 | Avaliação | Proposta |
| --- | --- | --- | --- | --- |
| Fatores 1,2 · 1,375 · 1,55 · 1,725 · 1,9 | Não existem | Seletor com o multiplicador visível | [E] Não encontrei fonte primária nem estudo de validação. São atribuídos a livros de fisiologia do exercício em fontes secundárias. Os rótulos ("1–3x/semana") misturam exercício com estilo de vida. [E] **1,2 e 1,375 ficam abaixo de 1,40**, que a FAO 2004 dá como o menor NAF compatível com a vida livre. A FAO considera "baixo demais" até o 1,21 proposto em 1985 para pessoas totalmente inativas. | **Decisão D1.** Recomendo não usar estes fatores como padrão. |
| Faixas da FAO 2004 (Tabela 5.3) | Existem (TMB × NAF, digitado) | — | [E] Sedentário ou leve: 1,40–1,69. Ativo ou moderado: 1,70–1,99. Vigoroso: 2,00–2,40. Acima de 2,40 é difícil de manter. Os exemplos do próprio relatório (Tabela 5.1) são **1,53, 1,76 e 2,25**. | Usar estas faixas no modo "Fator de atividade", com o multiplicador sempre visível. |

Exemplo com a Mifflin (TMB de 1.350):

| Fator | GET (kcal/dia) |
| --- | --- |
| ×1,2 (imagem, sedentário) | 1.620 |
| ×1,375 (imagem, levemente ativo) | 1.857 |
| ×1,53 (FAO, exemplo sedentário) | 2.066 |
| ×1,76 (FAO, exemplo ativo) | 2.376 |
| ×2,25 (FAO, exemplo vigoroso) | 3.038 |

Para uma pessoa sedentária, a diferença entre o 1,2 da imagem e o 1,53 da FAO é de **446 kcal/dia**.

## 4. Proposta de interface e cálculo

Fica tudo dentro da seção "Gasto energético" da avaliação física. Não proponho uma janela separada: os dados de peso, altura, idade, sexo e MLG já estão na avaliação, e uma janela separada criaria cópias divergentes. A data é a da avaliação, e a idade é calculada nessa data, como hoje.

### 4.1 Lembrete por fórmula

Ao escolher a fórmula, aparece uma caixa visível (como nas imagens) com:
- o público em que a fórmula é mais usada;
- os dados necessários;
- as limitações;
- a referência resumida.

O texto é o da coluna "Proposta" da seção 2. O "?" com a equação completa continua existindo. Os campos aparecem conforme a fórmula: peso, altura e idade, ou só a MLG, no caso de Cunningham e Tinsley.

### 4.2 Modo "Fator de atividade" (aba 1)

- **Seletor de nível** (Decisão D1, opção A recomendada), sempre com o multiplicador escrito:
  - "Sedentário ou atividade leve: escritório, poucos deslocamentos a pé, sem exercício regular ×1,53 (faixa 1,40–1,69)";
  - "Ativo ou moderadamente ativo: trabalho em pé ou exercício moderado frequente ×1,76 (faixa 1,70–1,99)";
  - "Vigoroso: trabalho braçal pesado ou treino intenso diário ×2,25 (faixa 2,00–2,40)".
- O valor sugerido pode ser **ajustado dentro da faixa**, como o campo NAF de hoje.
- **Resultado:** "GET = TMB × NAF = 1.350 × 1,53 = 2.066 kcal/dia". Vem com a ressalva: "estimativa; NAF baseado no estilo de vida habitual, incluindo exercícios".
- Neste modo, **as atividades não são somadas**, porque o NAF já inclui o exercício.

### 4.3 Modo "Rotina semanal" (aba 2)

- **Estilo de vida fora dos treinos** (Decisão D3). Os valores das imagens são 1,40 · 1,55 · 1,70 · 1,90, citando a FAO 2004:
  - [E] a FAO dá faixas e exemplos, **não estas quatro categorias de ocupação**;
  - [P] os quatro valores caem dentro das faixas da FAO, então são uma decisão de produto ancorada na FAO, não um valor da FAO.
- **Atividades:** é a lista que já existe (Compendium 2024). Cada atividade tem minutos por sessão e vezes por semana, com botões de adicionar e remover. O MET, o código e o gasto aparecem em cada linha.
- **Cálculo do dia** (Decisões D4 e D5):
  - `dia sem treino = TMB × estilo de vida`
  - `dia com treino = TMB × estilo × (1440 − min) ÷ 1440 + gasto das atividades nesses minutos`
  - `média diária = (soma da semana) ÷ 7`. É esse o valor que vai para a dieta.
- **Exibição:** dia sem treino, cada tipo de dia com treino, média diária e o NAF equivalente (média ÷ TMB), para comparar com as faixas da FAO.
- **Dupla contagem evitada:**
  - (1) o estilo de vida é só **fora dos treinos**;
  - (2) os minutos de treino saem do estilo de vida (D5);
  - (3) o repouso é descontado do gasto da atividade (D4);
  - (4) o modo Rotina nunca se soma ao modo Fator nem ao GET das DRIs;
  - (5) uma mesma atividade repetida na lista gera aviso.
- **"Importar dos cardios"** (Imagens 4 e 5): é a Decisão D8. Os registros de corrida e ciclismo (distância e duração) existem no Módulo de Treino. Importá-los traz três questões:
  - cruza dados entre Nutrição e Treino;
  - só existe para quem tem Treino;
  - o período e as duplicatas precisam ser definidos.

  Recomendo deixar para uma etapa posterior.

### 4.4 Gasto das atividades: três formas (Decisão D4)

Exemplo: Mifflin (TMB de 1.350, ou seja, 0,938 kcal/min de repouso) e estilo de vida 1,40.
- Musculação moderada (MET 5,0): 60 min, 3 vezes por semana.
- Caminhada moderada (MET 3,8): 40 min, 2 vezes por semana.

| Forma | Musculação (por sessão) | Caminhada (por sessão) | Média diária (kcal/dia) |
| --- | --- | --- | --- |
| **A — imagens:** MET × 3,5 × P ÷ 200 × min − TMB ÷ 1440 × min | 311 | 149 | **2.066** |
| **B — atual no sistema (M-03):** (MET − 1) × 3,5 × P ÷ 200 × min | 294 | 137 | 2.056 |
| **C — MET corrigido pela TMB da pessoa:** (MET − 1) × TMB ÷ 1440 × min | 225 | 105 | 2.017 |

- **[E]** Byrne et al. (2005), com 769 adultos, mostraram que o repouso médio real é de 2,6 mL/kg/min. Ou seja, o 1 MET de 3,5 superestima o repouso em cerca de 35%. Os autores recomendam corrigir pela TMB medida ou estimada.
- A forma C aplica essa correção nas duas pontas. A forma A mistura as duas coisas: o bruto vem do padrão de 3,5 e o desconto vem da TMB individual.
- **[H]** Não há estudo comparando A × B × C neste uso. É uma escolha de método.

**Recomendação:** C, por coerência com a TMB escolhida e com Byrne. A alternativa é A, se o cliente quiser seguir as imagens. Nas três formas, a diferença na média diária é pequena (cerca de 50 kcal/dia neste exemplo).

**Decisão D5** (sobreposição do tempo de treino): sem descontar os minutos de treino do estilo de vida, cada hora de treino conta cerca de 22 kcal a mais, porque é contada também no estilo de vida.

Ainda neste exemplo, a rotina dá uma média de 2.066 kcal/dia, o que equivale a um NAF de 1,53. **O mesmo valor do exemplo "sedentário" da FAO.** Já o fator 1,375 da imagem daria 1.857, ou seja, 209 kcal/dia a menos para a mesma pessoa.

### 4.5 Exclusividade e rascunhos (seção 4.3 da SPEC)

- Há **uma escolha só** por avaliação: Fator de atividade, Rotina semanal ou DRIs 2023 (Decisão D2). Os modos nunca se somam nem se multiplicam.
- Trocar de aba **preserva o que foi digitado** na outra aba, enquanto a avaliação for rascunho. Só o modo escolhido gera o resultado e vai para a dieta.
- Ao finalizar, os dados do modo não escolhido são descartados, para o documento finalizado não ficar ambíguo. [P]

## 5. Histórico, versões e proveniência

- **Avaliações finalizadas não mudam:** os resultados já estão congelados, e as dietas guardam a própria cópia do gasto. Nenhuma migração de dados é necessária.
- **Rascunhos antigos** (esquema 1), Decisão D9:
  - "TMB × NAF" passa a ser o modo "Fator de atividade", com o **mesmo NAF digitado**, então o resultado não muda;
  - "DRIs 2023" continua como está;
  - "GET + METs" (Inativo das DRIs) continua aparecendo nesses rascunhos.
- **Esquema 2** do documento da avaliação, com novos campos:
  - `gasto.modo`;
  - `gasto.fator` (código e valor usado);
  - `gasto.rotina.estilo` (código e valor);
  - versão do método de gasto das atividades (A, B ou C);
  - o PDF e a dieta passam a mostrar "Método: Rotina semanal (estilo 1,40; atividades: forma C)".
- **Sem migração de banco:** o documento já é JSON. Não muda nada em dieta, anamnese, relatórios, Treino, pagamentos, login ou perfis.
- **Permissões:** as mesmas da avaliação hoje. O nutricionista escreve; o autor finaliza, reabre e exclui. A importação de cardios (se aprovada no futuro) precisaria de uma regra de acesso própria.

## 6. Plano de implementação e testes (após aprovação)

1. **Cálculo:** funções puras em `lib/nutricao/avaliacao.ts`, com o fator, a rotina e as formas aprovadas, mais Tinsley se aprovada. Testes unitários com os números deste relatório e com casos independentes.
2. **Documento:** esquema 2 em `avaliacaoDocumento.ts`, com validação e leitura do esquema 1 sem mudar resultados. Testes de reabertura dos rascunhos antigos.
3. **Tela:** lembrete por fórmula, abas "Fator de atividade" e "Rotina semanal" (e DRIs, se mantida), campos e resultado detalhado. Responsiva e acessível, com os componentes PrimeReact já usados.
4. **PDF e dieta:** mostrar o modo e as premissas, sem mudar as dietas existentes.
5. **Testes de navegação:**
   - troca entre abas sem soma nem multiplicação;
   - rotina com dias sem treino, várias atividades e aviso de repetida;
   - valores ausentes e extremos;
   - finalizar, reabrir e conferir o histórico;
   - avaliações antigas intactas;
   - permissões;
   - conferência visual com as imagens.
6. **Regressão completa** e build de produção.

## 7. Decisões que pedem aprovação individual

| # | Decisão | Opções | Recomendação |
| --- | --- | --- | --- |
| D1 | Valores do "Fator de atividade" | **A)** faixas da FAO 2004, com valor sugerido (1,53/1,76/2,25) ajustável dentro da faixa · **B)** fatores das imagens (1,2 a 1,9), marcados "uso comum, sem validação primária" · **C)** A e B, com B identificado | A |
| D2 | DRIs 2023 (GET por equação, aprovado no M-02) | Manter como terceira opção · retirar | Manter. É o método com base em água duplamente marcada. |
| D3 | Estilo de vida na Rotina | 1,40 · 1,55 · 1,70 · 1,90 das imagens, como decisão de produto dentro das faixas da FAO · outros valores | Aprovar os das imagens, rotulados "dentro das faixas FAO 2004" |
| D4 | Gasto das atividades | A (imagens) · B (atual, M-03) · C (MET corrigido pela TMB) | C |
| D5 | Tirar os minutos de treino do estilo de vida | Sim · não | Sim |
| D6 | Tinsley 2019 | Acrescentar (MLG e/ou peso) · não acrescentar | Acrescentar só a versão com MLG, com o lembrete de público restrito |
| D7 | Textos dos lembretes | Os da seção 2 · ajustes | Os da seção 2 |
| D8 | "Importar dos cardios" | Agora · etapa posterior · não fazer | Etapa posterior |
| D9 | Rascunhos antigos | TMB × NAF passa a ser "Fator" com o mesmo NAF; DRIs ficam iguais | Aprovar |
| D10 | Lugar da tela | Seção da avaliação (atual) · janela separada (imagens) | Seção da avaliação |
| D11 | Harris-Benedict | Manter só a de 1984 · acrescentar a de 1919 | Só a de 1984 |
| D12 | Resultado da Rotina enviado à dieta | Média diária (a tela mostra também dia com e sem treino) · outro | Média diária |

## 8. Referências

- Mifflin MD, St Jeor ST et al. *Am J Clin Nutr* 1990;51(2):241-247.
- Roza AM, Shizgal HM. *Am J Clin Nutr* 1984;40(1):168-182.
- Harris JA, Benedict FG. *A biometric study of basal metabolism in man*. Carnegie Institution, 1919.
- Frankenfield D, Roth-Yousey L, Compher C. Comparison of predictive equations for resting metabolic rate in healthy nonobese and obese adults: a systematic review. *J Am Diet Assoc* 2005;105(5):775-789.
- Cunningham JJ. *Am J Clin Nutr* 1980;33(11):2372-2374.
- Thompson J, Manore MM. Predicted and measured resting metabolic rate of male and female endurance athletes. *J Am Diet Assoc* 1996;96(1):30-34.
- Tinsley GM, Graybeal AJ, Moore ML. Resting metabolic rate in muscular physique athletes: validity of existing methods and development of new prediction equations. *Appl Physiol Nutr Metab* 2019;44(4):397-406. doi:10.1139/apnm-2018-0412.
- FAO/WHO/UNU. *Energy and protein requirements*. WHO TRS 724, 1985 (Schofield).
- FAO/WHO/UNU. *Human energy requirements*. Food and Nutrition Technical Report Series 1, Roma, 2004. Tabelas 5.1 a 5.3: https://www.fao.org/4/y5686e/y5686e07.htm
- National Academies. *Dietary Reference Intakes for Energy*, 2023.
- Herrmann SD et al. 2024 Adult Compendium of Physical Activities. *J Sport Health Sci* 2024;13(1):6-12. https://pacompendium.com
- Byrne NM, Hills AP, Hunter GR, Weinsier RL, Schutz Y. Metabolic equivalent: one size does not fit all. *J Appl Physiol* 2005;99(3):1112-1119.
- Fatores 1,2 a 1,9: sem fonte primária localizada. Aparecem em fontes secundárias atribuídos a McArdle, Katch & Katch, *Exercise Physiology*. É preciso conferir se forem usados.

## 9. Decisões do nutricionista (10/11/2026) e implementação

| # | Resposta | Como ficou |
| --- | --- | --- |
| D1 | **Opção C**: os dois conjuntos, com as diferenças de fundamentação claras; um conjunto por cálculo | Aba "Fator de atividade" com a escolha "FAO 2004" ou "Fatores tradicionais". Cada conjunto tem o seu aviso: o tradicional diz que **não são valores da FAO** e não têm validação localizada. Trocar de conjunto limpa o nível. Na FAO, o valor sugerido (1,53 / 1,76 / 2,25) pode ser ajustado só dentro da faixa; os tradicionais são fixos. |
| D2 | Aprovado | "DRIs 2023" é a terceira aba, igual a antes (inclusive o "GET + METs" do Inativo). |
| D3 | Aprovado | Estilo de vida 1,40 / 1,55 / 1,70 / 1,90, com o texto "categorias operacionais do sistema, com valores dentro das faixas FAO 2004". |
| D4 | **Opção C** | MET × TMB ÷ 1440 por minuto (repouso da própria pessoa). 60+: MET60 do Older Adult Compendium, como no M-03. A equação completa aparece nas premissas da tela e no "?". |
| D5 | Aprovado | No dia com treino: TMB × E × (1440 − min) ÷ 1440 + MET × TMB ÷ 1440 × min, o que é igual a TMB × E + (MET − E) × TMB ÷ 1440 × min. |
| D6 | Aprovado (só MLG) | "Tinsley (2019) — massa livre de gordura": 284 + 25,9 × MLG. Sem MLG na avaliação, não calcula e diz o que falta. |
| D7 | Aprovado | Caixa de lembrete visível com o público, os dados, as limitações e a referência. O "?" continua com a equação, a população e a fonte. |
| D8 | Adiado | "Importar dos cardios" não foi feito. Fica como pendência futura. |
| D9 | Aprovado | As avaliações finalizadas, os resultados congelados e as dietas não mudam. Os rascunhos antigos com "TMB × NAF" continuam com esse método e o NAF registrado (aparece como "TMB × NAF (método anterior)"). Abrir um rascunho antigo não regrava nada. |
| D10 | Aprovado | Continua na seção "Gasto energético" da avaliação física. |
| D11 | Aprovado | Só a Harris-Benedict revisada (1984). |
| D12 | Aprovado | A média diária da semana é o GET que vai para a dieta. A tela e o PDF mostram também o dia sem treino e o dia com cada atividade, e os resultados congelados guardam todas as premissas (`gastoDetalhe`). |

**Número corrigido em relação à seção 4.4:** a tabela da seção 4.4 mostrava a forma C **sem** o desconto da D5 (2.017 kcal/dia). Com as decisões D4 e D5 juntas, o exemplo (rotina "sentado", musculação 3x de 60 min e caminhada 2x de 40 min) dá **2.003 kcal/dia** de média. O dia com musculação dá 2.093 kcal, e o dia sem treino, 1.890 kcal.

**Persistência:**
- O documento da avaliação passou ao esquema 2, com `gasto.fator` (conjunto, nível e valor) e `gasto.rotina.estilo`.
- A lista de atividades é a mesma de antes: é usada pela rotina e pelas DRIs, e não entra no fator de atividade.
- Cada aba guarda o seu rascunho, e só o método escolhido calcula.
- Não houve migração de banco: o documento já é JSON.

**Arquivos:**
- `lib/nutricao/avaliacao.ts`: Tinsley, lembretes, conjuntos de fatores e rotina semanal.
- `lib/nutricao/avaliacaoDocumento.ts`: esquema 2, validação, completar documento antigo e resultados com premissas.
- `components/nutricao/avaliacao/EditorDaAvaliacao.tsx`: tela.
- `lib/servidor/pdf/avaliacao.tsx`: PDF.

**Testes:**
- `tests/gastoEnergetico.test.mjs` (unitário).
- `tests/navegacao/tmbGasto1110.mjs`: tela, troca de abas, finalização, PDF, rascunho antigo, avaliações finalizadas intactas e celular.
