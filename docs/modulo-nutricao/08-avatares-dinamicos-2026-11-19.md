# Avatares dinâmicos da avaliação física

SPEC aprovada pelo nutricionista em 19/11/2026 (pacote "Nova feature", cinco zips). A SPEC e os protótipos ficam fora do repositório. Aqui estão a auditoria, as decisões e o andamento.

## 1. O que muda

A seção "Percentual de gordura — referência visual" passa a se chamar "Representação corporal — avaliação atual", na tela de resultados e no PDF. A faixa de 13 corpos dá lugar a duas vistas geradas a partir da própria avaliação:

- Pele frontal.
- Isométrica com músculo e gordura, com transparência da gordura de 0 a 100% (padrão 85%).

O fundo `#20343A` vai incorporado às imagens. As imagens são salvas por avaliação e revisão e congeladas ao finalizar. A figura numerada da Perimetria não muda.

## 2. Decisões do usuário (21/11, "de acordo com as recomendações")

| # | Assunto | Decisão |
|---|---|---|
| 1 | Avaliações antigas, sem imagens | Continuam com a faixa antiga. Geração retroativa só por botão explícito, e não agora. |
| 2 | Comparação histórica | Na tela de resultados, seletor "Comparar com" outra avaliação finalizada. Não vai para o PDF. |
| 3 | Regiões novas | Folha de conferência para o nutricionista aprovar antes de ligar o salvamento e o PDF. |
| 4 | Transparência | Escolhida no rascunho e congelada ao finalizar, junto com as imagens. Para mudar, reabrir a avaliação. |

## 3. Arquitetura (fases 1 e 2)

- `lib/avatar/`: núcleo em TypeScript puro, sem Canvas e sem Node. É o mesmo código para a tela e para o servidor (SPEC §12.3).
  - `regioes.ts`: coordenadas no espaço de referência 600 × 802, neutros, faixas suportadas e dobras de referência visual.
  - `campos.ts`: geração determinística dos campos de deslocamento. As oito bases do protótipo são uma tradução fiel de `referencia-geracao-campos.py`, com erro médio abaixo de 0,01 px, conferido em teste.
  - `motor.ts`: recorte feminino, separação dos braços, deformação (24 passos, refinamento das células dobradas, amostragem bilinear ponderada por alfa) e composição com o fundo.
  - `raster.ts`: polígonos e transformada de distância.
  - `versao.ts`: versões do renderizador, dos materiais e das regiões. Imagens salvas guardam a versão e nunca são refeitas em silêncio.
- `public/nutricao/avatares/dinamicos/`: as seis fontes grandes e as seis fontes 600 × 802 da tela, com SHA-256 conferido contra o manifesto do pacote. São materiais-base públicos (SPEC §11.3).
- `scripts/avatar/folha-de-conferencia.mjs`: gera a folha de aprovação (PDF). `carregar.mjs` lê e grava PNG com o `sharp` já presente.
- `tests/avatarMotor.test.mjs` cobre:
  - a equivalência com o protótipo e a separação das camadas;
  - a malha sem inversão nas faixas suportadas, isoladas e combinadas;
  - o recorte feminino e o fundo;
  - a transparência sem efeito na geometria;
  - olhos e lábios sem gordura;
  - o determinismo.

### 3.1. Braço como camada própria (mudança em relação ao protótipo)

Medição: com a "proteção dos braços" do protótipo, a malha dobrava dentro do corpo já com:

| Medida | Masculino | Feminino |
|---|---|---|
| Cintura | acima de 97 cm | acima de 82 cm |
| Abdômen | acima de 107 cm | acima de 93 cm |
| Coxa | acima de 67 cm | acima de 63 cm |

A causa é a transição de 6 px que comprimia o tronco contra o braço. Na versão 1, cada fonte é separada em corpo, desenhado atrás, e braço, desenhado na frente:
- o tronco cresce por trás do braço;
- o braço segue só os próprios campos (SPEC §8.4).

A separação usa os polígonos do protótipo, com três ajustes:
- uma erosão leve, que rompe contatos finos (cotovelo na cintura, dedos na coxa);
- propagação a partir do eixo do braço e a partir do corpo;
- complemento do tronco sob o braço (revisto na versão 2, §4.2).

### 3.2. Regiões novas (SPEC §7.2)

| Região | Tipo | Como age |
|---|---|---|
| Deltoide | perímetro | Alargamento radial da calota de cada ombro, igual nas duas camadas |
| Tórax | perímetro | Faixa entre ombros e cintura, complementar à cintura; na isométrica se atenua perto do braço |
| Bicipital | dobra | Metade anterior do braço; com a tricipital igual, reproduz o braço aprovado |
| Peitoral | dobra | Elipse radial no peitoral |
| Axilar média | dobra | Laterais do tronco abaixo das axilas |
| Subescapular | dobra | Transição posterior superior, a parte visível da isométrica |
| Suprailíaca | dobra | Flancos; divide a região com a abdominal |
| Panturrilha | dobra | Segmentos das panturrilhas; cede o joelho à coxa |
| Projetada | espessura | Antebraço e calotas dos ombros, sem dobra própria |

As dobras do tronco ocupam a região por prioridade, sem somar espessuras nas junções. A ordem é: calotas, suprailíaca, abdominal, peitoral, axilar e subescapular.

### 3.3. Faixas suportadas

Dentro delas, nenhuma célula da malha inverte (jacobiano > 0,02) no corpo, em cada medida isolada e em todas juntas, no mínimo e no máximo. Fora delas, o desenho usa o limite e registra que o limite foi aplicado. A medida clínica não muda.

| Medida | Faixa |
|---|---|
| Braço | 20–50 cm (feminino até 43) |
| Cintura | 55–125 cm |
| Abdômen | 60–135 cm |
| Quadril | 80–130 cm |
| Coxa | 40–80 cm (feminino até 75) |
| Deltoide | 80–150 cm |
| Tórax | 70–140 cm |
| Dobras | 2–50 mm |

## 4. Revisão do nutricionista (21/11) e versão 2

### 4.1. Valores aprovados

São calibração do desenho, nunca medidas clínicas do paciente:

| Valor | Masculino | Feminino |
|---|---|---|
| Deltoide neutro | 115 cm | 100 cm |
| Tórax neutro | 100 cm | 90 cm |
| Dobra de referência da panturrilha | 12 mm | 18 mm |
| Espessura ilustrativa inicial de antebraços e ombros | 4,5 mm | 4,5 mm |

Os 4,5 mm são a metade da **espessura ilustrada** de 9 mm da tricipital de 18 mm, e não a metade da dobra de 18 mm. Ficam sempre identificados como referência ou projeção, porque não há dobra local medida.

### 4.2. Correções feitas

**Axilas e junção entre braço e tronco**
- O braço fica restrito ao próprio eixo, até 1,15 × a meia largura medida nos pixels. Os polígonos do protótipo invadiam o peito e as costas.
- Na axila, o braço acompanha a borda interna real do tronco, nos dois sentidos, e não muda do lado interno.
- Abaixo da axila, o braço gira a partir do ombro só o necessário para o tronco crescer. Vale o maior giro que alguma faixa do tronco exigir.
- O tronco escondido atrás do braço é completado até um contorno interpolado e suavizado. A cor vem espelhada do próprio tronco, sem copiar o vinco escuro, e a borda é esfumada.

**Volume do braço independente do tronco**
- Na camada do braço, cintura, abdômen e tórax só deslocam ou giram o braço, sem mudar a largura.
- Um teste confere que o deslocamento é igual ao longo de cada linha.

**Degraus e saliências entre regiões**
- Novo `lib/avatar/limites.ts`: limite de coerência entre regiões vizinhas, como diferença máxima de ln(medida ÷ neutro).

| Vizinhas | Diferença máxima |
|---|---|
| Deltoide–braço | 0,25 |
| Braço–antebraço | 0,25 |
| Deltoide–tórax | 0,3 |
| Tórax–cintura | 0,3 |
| Cintura–abdômen | 0,2 |
| Abdômen–quadril | 0,25 |
| Quadril–coxa | 0,3 |
| Coxa–panturrilha | 0,3 |

- Uma região medida cede o mínimo necessário. Uma região não medida cede quase tudo e vira projeção.
- A medida clínica não muda. O limite aplicado fica registrado por região (`faixa` ou `coerencia`).

**Cotovelo e joelho**
- Braço–antebraço e coxa–panturrilha formam uma cadeia e dividem a articulação.
- Na articulação, a contração é perpendicular à bissetriz, o que evita nós e dobras atrás do joelho.

**Combinações diferentes**
- O teste da malha cobre:
  - cada medida isolada, com as vizinhas ausentes e com as vizinhas no neutro;
  - seis perfis mistos;
  - tudo no mínimo e tudo no máximo.
- Vale para os dois modelos e as duas vistas. Nenhuma célula da malha inverte no corpo.

**Braço feminino**
- O recorte aprovado continua o mesmo, testado nas duas camadas.

### 4.3. Perímetros opcionais novos

São antebraço direito e esquerdo e panturrilha direita e esquerda, sempre no maior perímetro. Entram em `PERIMETRIA` com as setas 10 a 13 na figura numerada. O desenho usa o lado direito. Campo vazio continua vazio. O perímetro não determina sozinho gordura nem músculo.

Neutros propostos, pendentes de aprovação:

| Perímetro | Masculino | Feminino |
|---|---|---|
| Antebraço | 30 cm | 25 cm |
| Panturrilha | 38 cm | 35 cm |

### 4.4. Camada de gordura

A medição mostrou a faixa nos membros 2 a 4 vezes mais fina que a meia dobra. A escala vinha do raio do segmento do protótipo, e não da largura visível. Agora, no contorno visível, a espessura é meia dobra × (2 × meia largura medida ÷ diâmetro do perímetro neutro).

Medido nas imagens de exportação (esperado: 9 e 18 mm):

| Membro | Dobra 18 mm | Dobra 36 mm |
|---|---|---|
| Braço masculino | 8,2 | 17,7 |
| Braço feminino | 9,1 | 17,1 |
| Coxa masculina | 8,9 | 17,7 |
| Coxa feminina | 8,4 | 16,1 |

Com o perímetro fixo, uma dobra maior engrossa a faixa e reduz o núcleo, e um teste confere isso. No PDF, 9 mm equivalem a cerca de 0,6 pt na figura de 115 pt de largura: ali a gordura é percebida pela cor da camada, e não pela espessura.

### 4.5. Faixas do desenho (versão 2)

| Medida | Masculino | Feminino |
|---|---|---|
| Braço | 20–50 | 20–43 |
| Antebraço | 18–40 | 16–36 |
| Deltoide | 80–150 | 80–150 |
| Tórax | 70–140 | 70–140 |
| Cintura | 55–125 | 55–125 |
| Abdômen | 60–135 | 60–135 |
| Quadril | 80–130 | 80–130 |
| Coxa | 40–80 | 40–75 |
| Panturrilha | 25–55 | 25–52 |
| Dobras | 2–50 mm | 2–50 mm |

### 4.6. Folha versão 2

Arquivo: `Downloads/Nova feature/folha-de-conferencia-avatares-v2.pdf`, com 25 páginas:
- capa;
- estado de referência;
- transparência a 85, 65 e 49% no tamanho do PDF, com a mesma geometria;
- exemplo do bloco do PDF;
- camada de gordura;
- combinações, com 5 perfis por modelo;
- os 9 perímetros, do mínimo ao máximo, com o limite aplicado anotado;
- as 9 dobras.

## 5. Fase 3: proposta de leitura das medidas e da regra para dobras ausentes

Leitura do documento, sem alterá-lo:

**Perímetros**
- `deltoide`, `torax`, `cintura`, `abdomen`, `quadril`, `braco_direito`, `antebraco_direito`, `coxa_direita` e `panturrilha_direita`.
- O lado esquerdo nunca é usado no desenho.

**Dobras (`dobras.valores`)**

| Campo do documento | Sítio no desenho |
|---|---|
| `triceps` | tricipital |
| `bicipital` | bicipital |
| `peitoral` | peitoral |
| `axilar_media` | axilar |
| `subescapular` | subescapular |
| `supra_iliaca` | suprailíaca |
| `abdominal` | abdominal |
| `coxa` | coxa |
| `panturrilha_medial` | panturrilha |

Valores zero, negativos ou não numéricos contam como ausentes.

**Percentual**
- O resultado clínico já selecionado: `resultados.percentualGordura` e o método.

Regras, determinísticas e versionadas:

1. **Perímetros:** os medidos passam pelos limites visuais (§4.2). Os ausentes ficam como referência, ou como projeção quando o limite de coerência os aproxima das vizinhas medidas.
2. **Dobra medida:** usa a meia dobra, limitada a 2–50 mm.
3. **Dobra ausente, com pelo menos uma dobra medida:** fator r = média de (dobra medida ÷ dobra de referência) sobre as dobras medidas, limitado entre 0,5 e 1,8. A projetada é a referência × r.
4. **Sem dobras, com percentual:** r = percentual ÷ percentual de referência do desenho, com os mesmos limites. O protótipo usava 20% (M) e 28% (F) como o percentual que a figura de referência representa. É calibração do desenho, ainda a aprovar, e não constante clínica.
5. **Sem dobras e sem percentual:** tudo fica como referência.
6. **Antebraços e ombros:** 4,5 mm × r, sempre como projeção ou referência.
7. **Registro:** para cada região, guardar a origem (medido, projetado ou referência), o valor usado, o motivo da projeção e os limites aplicados.

Perguntas ao nutricionista:
- Aprova a regra 3 (dobras medidas orientam as ausentes), com o limite de 0,5 a 1,8?
- Aprova 20% (M) e 28% (F) como percentual de referência do desenho (regra 4)?
- Havendo dobras e percentual, as dobras têm prioridade?
- Aprova os neutros de antebraço e panturrilha (§4.3) e os limites de coerência (§4.2)?
- Qual transparência padrão no PDF: 85, 65 ou 49%?

## 6. Andamento

| Fase | Situação |
|---|---|
| 1. Motor compartilhado | 100% |
| 2. Regiões, máscaras e conferência visual | 90% (folha v2 aguardando aceite) |
| 3. Leitura das medidas, proveniência e projeção | 15% (limites visuais e proposta; faltam as regras aprovadas) |
| 4. Tela de resultados e transparência | 0% |
| 5. Salvamento por revisão, geração no servidor e permissões | 0% |
| 6. PDF | 0% |
| 7. Comparação histórica | 0% |
| 8. Aceite e regressão | 0% |

Módulo: cerca de 33%.

Olhos e lábios (SPEC §8.6): a camada de gordura do pacote já traz esses pontos transparentes, então o músculo aparece por baixo. Um teste confere que, com a gordura opaca, esses pixels mostram o músculo e não o fundo.
