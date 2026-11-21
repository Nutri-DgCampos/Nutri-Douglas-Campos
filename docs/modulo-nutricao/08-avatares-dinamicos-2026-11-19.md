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
- complemento do tronco sob o braço, na isométrica e acima da cintura na pele.

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

## 4. Pendente de aprovação do nutricionista

Arquivo: `Downloads/Nova feature/folha-de-conferencia-avatares-v1.pdf`, com 20 páginas: capa, estado de referência, combinações extremas e uma página por região.

- Neutros propostos: deltoide 115 cm (M) e 100 cm (F); tórax 100 cm (M) e 90 cm (F).
- Dobra de referência visual da panturrilha: 12 mm (M) e 18 mm (F).
- Espessura projetada (antebraços e ombros): metade da tricipital de referência, 4,5 mm.
- Aspecto de cada região nova e as faixas suportadas.

Limite conhecido: cintura ou abdômen muito altos com o tórax no neutro formam um degrau logo abaixo do peito, na isométrica feminina. A folha mostra a região isolada; na prática as medidas sobem juntas.

## 5. Andamento

| Fase | Situação |
|---|---|
| 1. Motor compartilhado | 100% |
| 2. Regiões novas, máscaras e folha de conferência | 90% (falta o aceite do nutricionista) |
| 3. Leitura das medidas, proveniência e projeção | 0% |
| 4. Tela de resultados e transparência | 0% |
| 5. Salvamento por revisão, geração no servidor e permissões | 0% |
| 6. PDF | 0% |
| 7. Comparação histórica | 0% |
| 8. Aceite e regressão | 0% |

Módulo: cerca de 30%.

Olhos e lábios (SPEC §8.6): a camada de gordura do pacote já traz esses pontos transparentes, então o músculo aparece por baixo. Um teste confere que, com a gordura opaca, esses pixels mostram o músculo e não o fundo.
