# Biblioteca Mestre V3 (220 modelos): fase 1

Data: 14/11/2026. Origem: SPEC "Biblioteca Mestre V3", com 220 modelos (180 dietas e 40 treinos), e as respostas do nutricionista de 14/11.

## 1. Auditoria (só leitura)

**Modelos de dieta** ficam em `modelos_nutricao` (observação, refeição ou dieta completa). O conteúdo segue o mesmo formato do editor de dietas, e todos os nutricionistas da clínica veem a biblioteca. Antes desta fase não havia:
- código estável;
- estado bloqueado;
- campo de orientações ao nutricionista separado das observações que vão ao paciente.

**Modelos de treino** ficam em `treino_modelos`:
- modalidade musculação, corrida ou ciclismo;
- privados ou compartilhados;
- o plano é copiado ao criar o programa do aluno;
- musculação já tem `observacoes` gerais, que o aluno vê; corrida e ciclismo não têm.

**Produção** (consulta só de leitura em 14/11):
- os quatro modelos protegidos existem, cadastrados à mão, com o código no início do nome: EMG-001 e FIS-BIK-007, 008 e 009;
- há 2 observações, 11 refeições e 2 treinos dos profissionais;
- há 27 alimentos cadastrados pelo nutricionista, entre eles goma de mandioca, filé de tilápia grelhada, geleia de frutas e macarrão cozido.

**Alimentos:**
- Os ids da TACO são diferentes entre a produção e a base local. Por isso os arquivos dos modelos guardam o código TACO (`codigo_origem`), e cada base resolve o id na importação.
- Os alimentos cadastrados pelo nutricionista foram copiados para a base local com o mesmo id da produção (alimentos, nutrientes e medidas).
- Nenhum dado de paciente foi copiado.

**Ambiente isolado:** a base local (Docker `nutri-postgres`) serve de homologação. Nada foi gravado na produção.

## 2. Decisões do nutricionista (14/11)

| # | Decisão |
|---|---|
| 1 | **Opção b**: poucos cardápios-base com as gramas ajustadas por objetivo (aproveita o material antigo) |
| 2 | MUL-005 a MUL-009 são de gestação e lactação e ficam bloqueados até a revisão |
| 3 | FIS-BIK-007 = 2.100 kcal, FIS-BIK-008 = 2.300 kcal, FIS-BIK-009 = 2.000 kcal |
| 4 | Clínicos, gestação e bariátricos ficam bloqueados até a revisão individual |
| 5 | Arroz branco → "Arroz, tipo 1, cozido"; pão de forma branco → "Pão, trigo, francês"; ovo mexido → ovo inteiro cozido; tapioca → "Goma de mandioca, assada" (cadastro dele); bebida vegetal → "Soja, extrato solúvel, natural, fluido"; tilápia, geleia e macarrão cozido: cadastros dele |
| 6 | Levantamento terra romeno → "Stiff com barra"; cadastrar "Puxada neutra" e "Flexão de braços inclinada"; supino com halteres → "Supino reto com halteres" |

As trocas estão em `banco/biblioteca/decisoes.json`.

## 3. O que mudou no sistema

**Migração 038** (`banco/migrations/038_biblioteca_mestre.sql`), só aditiva:
- `modelos_nutricao` ganha:
  - `codigo`, único quando preenchido;
  - `situacao`, liberado ou bloqueado; os modelos atuais ficam liberados;
  - `orientacoes_profissional`;
  - `biblioteca`, com os dados de auditoria;
  - `liberado_em` e `liberado_por`.
- `treino_modelos` ganha `codigo`, `orientacoes_profissional` e `biblioteca`.
- Entram os dois exercícios novos na lista base.

**Servidor:**
- Modelo bloqueado não é usado. A importação para dieta é recusada com o código 409, e o uso de refeição ou observação também é recusado.
- Só o nutricionista libera um modelo bloqueado, com `PATCH { acao: "liberar" }`, que registra quem liberou e quando.
- As orientações ao profissional ficam só no modelo e nunca são copiadas para a dieta ou o treino.

**Telas:**
- A biblioteca de dietas mostra a etiqueta "Bloqueado até revisão".
- O editor do modelo tem o campo "Orientações ao nutricionista" e, quando o modelo está bloqueado, um aviso com o botão "Liberar para uso".
- Na janela "Importar", os modelos bloqueados aparecem desabilitados.
- No Treino, a janela "Usar modelo" mostra o código e o botão "Orientações ao educador".

## 4. Ferramentas da biblioteca

Todo o conteúdo fica em `banco/biblioteca/`, versionado no git:
- `catalogo.csv`: o catálogo oficial da V3;
- `controle.json`: o progresso de cada código;
- `decisoes.json`: as trocas aprovadas;
- `orientacoes/<FAMÍLIA>.json`: as orientações por categoria, com referências reais;
- `modelos/<CÓDIGO>.json`: um arquivo por modelo, no formato intermediário.

```
# 1. Converter o material antigo (fora do repositório) para o formato intermediário
python -I -X utf8 scripts/biblioteca/converter.py <pasta-dos-json-antigos> EMG-003 EMG-004 ...

# 2. Ajustar as gramas à meta de energia (fator único, arredondamento de 5 g)
node scripts/biblioteca/biblioteca.mjs ajustar EMG-003 EMG-004

# 3. Validar com as funções do próprio aplicativo
node scripts/biblioteca/biblioteca.mjs validar EMG-003 EMG-004     # --notas mostra lacunas da TACO

# 4. Importar na base local: uma transação por modelo, nunca sobrescreve
node scripts/biblioteca/biblioteca.mjs importar EMG-003 EMG-004 --autor <e-mail dono dos treinos>

# Reverter: só apaga modelo nunca usado
node scripts/biblioteca/biblioteca.mjs reverter EMG-003
```

**Proteções da ferramenta:**
- Recusa qualquer banco que não seja local. Só funciona fora dele com `--producao` e `BIBLIOTECA_PRODUCAO=CONFIRMO`, depois da autorização expressa do cliente.
- Não gera nem importa os quatro modelos protegidos.
- O catálogo decide o bloqueio: um modelo que o catálogo bloqueia não entra liberado.

**O que o validador confere:**
- **Dietas:**
  - alimentos existentes e não arquivados, com gramas maiores que zero;
  - refeições sem horário;
  - as duas orientações (ao paciente e ao nutricionista);
  - energia calculada contra a meta nominal: desvio acima de 10% gera aviso;
  - termos de risco nos modelos de fisiculturismo.
- **Musculação:**
  - exercícios da lista base;
  - séries positivas e faixa de repetições em ordem;
  - carga em branco;
  - um dia por sessão.
- **Corrida e ciclismo:**
  - número de semanas igual à duração do programa;
  - soma dos blocos igual ao tempo da sessão;
  - zonas Z1 a Z5;
  - nenhuma métrica absoluta preenchida.

## 5. Pilotos (os quatro testes da SPEC)

| Código | Resultado na base local |
|---|---|
| EMG-002 | ajustado com fator 0,859: 1.501 kcal para a meta de 1.500; 98,5 g de proteína, 192 g de carboidrato, 39,5 g de lipídio, 18,3 g de fibras |
| MUS-002 | 4 sessões, 22 exercícios e 44 séries, sem carga |
| COR-001 | 8 semanas, 24 sessões e 775 min; blocos conferidos |
| CIC-001 | 4 semanas, 12 sessões e 650 min; blocos conferidos |

**Idempotência:** a segunda importação pulou os quatro modelos, sem sobrescrever. **Reversão:** removeu os quatro, e a reimportação seguinte entrou limpa.

**Testes:**
- teste de navegação `tests/navegacao/biblioteca1114.mjs`: 27 itens OK;
- 135 testes unitários;
- regressão sem falhas: treinoT2, T4a, T4c, T6, fumaça, melhorias1101 e cadastroAnamnese1110.

## 6. Fase 2: dietas liberadas (161)

**Orientações:** um arquivo por família em `banco/biblioteca/orientacoes/` (EMG, HIP, ESP, MAN, ROT, ALI, GAS, IDA, MET, MUL e FIS).
- **Ao paciente:** linguagem simples, preparo, hidratação, sinais de alerta e quando procurar a equipe.
- **Ao nutricionista:** objetivo, perfil, individualização, monitoramento, medicamentos e encaminhamento.
- **Complementos:**
  - por código: cada restrição alimentar, temas de metabolismo e rotina;
  - por divisão do fisiculturismo;
  - por fase competitiva: off-season, preparação, semana de pico, dia da competição e pós-competição, sem restrição de água ou sódio nem diurético.
- Só referências reais.

**Coerência com a categoria** (`decisoes.json`): o validador acusa erro em qualquer alimento proibido.
- **Trocas e proibições por código:**
  - ALI-001: sem nada de origem animal (tofu, lentilha, extrato de soja);
  - ALI-002: ovolactovegetariano;
  - ALI-003: sem lactose;
  - ALI-004: sem glúten (cuscuz de milho no lugar do pão);
  - ALI-005: sem carne vermelha;
  - ALI-006: com peixe;
  - MET: sem geleia, com integrais;
  - IDA-003 e GAS-004: textura macia.
- **Trocas por refeição:** os lanches com arroz e frango herdados do material antigo passaram a pão integral e ovo, fora das famílias de atletas (FIS, HIP e ESP).

**Ajuste das gramas** (opção b):
- **Para baixo:** fator único em todos os itens.
- **Para cima:**
  - legumes ficam como estão;
  - a proteína sobe no máximo 25%;
  - as fontes de energia completam a diferença.
- **Energia muito acima do cardápio-base:** até duas refeições extras (ceia ou lanche extra), copiadas do lanche do próprio cardápio. Isso aconteceu em 27 dietas, e o validador avisa em cada uma.
- **Fisiculturismo:** piso de 2,0 g/kg de proteína sobre o peso de referência. É uma aproximação conservadora de Helms 2014 (2,3 a 3,1 g/kg de massa magra), **a confirmar**. Resultado: 1,96 a 2,47 g/kg.
- **Resultado:** todas ficaram a até 3% da meta.

## 7. Fase 3: treinos (40)

**Musculação:**
- Os 9 modelos que eram cópia de outro ganharam divisão própria em `banco/biblioteca/musculacao.json`: feminino com ênfase em membros inferiores, glúteos com quadríceps ou com posteriores, emagrecimento com descanso curto e cardio leve opcional, e manutenção com volume reduzido.
- Os demais seguem o material antigo, com as trocas de exercício aprovadas.
- Cargas em branco.

**Corrida e ciclismo:**
- O material antigo era uma fórmula repetida e incoerente: "longo leve" em Z3–Z4, "recuperação" mais longa que o longão e quatro grupos de programas idênticos.
- Os 20 programas foram gerados de `banco/biblioteca/endurance.json`, com as sessões em aquecimento, bloco principal e volta à calma:
  - tipos de sessão do próprio aplicativo;
  - progressão linear do bloco principal até o pico;
  - semanas de recuperação com 75%;
  - polimento de 60% na última semana dos programas com prova;
  - intervalados com séries por semana.
- Zonas relativas (Z1 a Z5), sem nenhuma métrica absoluta.
- Nenhum programa repetido.

## 8. Fase 4: bloqueados (15), rascunhos novos em `banco/biblioteca/clinicos.json`

- **BAR-001 a 005: não prescritivos, sem cardápio.**
  - Não trazem volumes nem horários, porque não há protocolo validado da equipe cirúrgica.
  - As orientações são por fase, com exemplos condicionais ("se liberados pela equipe").
  - Trazem as diferenças entre Sleeve (refluxo) e Bypass (dumping e micronutrientes) e os alertas de urgência, inclusive os sinais neurológicos (tiamina).
- **CLI-001 a 005:** um cardápio próprio por condição:
  - diabetes tipo 2: integrais e distribuição dos carboidratos;
  - doença renal: proteína moderada, de propósito sem restrições específicas, a individualizar;
  - hipertensão: padrão DASH;
  - dislipidemia: aveia, leguminosas e peixe;
  - esteatose (MASLD): baixo açúcar.
- **MUL-005 a 009 (gestação e lactação):** um cardápio por fase:
  - segurança dos alimentos (carnes e peixes bem cozidos, laticínios pasteurizados, sem álcool);
  - folato, ferro, cálcio, colina e DHA;
  - acréscimos de energia de referência do IOM (2005) no texto ao nutricionista.
- **Ajuste:** as gramas foram ajustadas à referência do catálogo como ponto de partida, sem aumentar a proteína e sem refeição extra. A energia não é meta obrigatória.
- Todos entram bloqueados, e só o nutricionista libera.

## 9. Fase 5: relatório e situação final

- **Relatório por código:** `banco/biblioteca/relatorio.md`, gerado por `node scripts/biblioteca/biblioteca.mjs relatorio`. Tem as 220 linhas, com situação, cálculo (energia, proteína e fibras) e avisos.
- **Contagem:**
  - **216 modelos novos** validados e importados na base local: 161 dietas liberadas, 15 dietas bloqueadas e 40 treinos;
  - **4 protegidos**, que já existem na produção;
  - **nenhum erro**;
  - 34 modelos com avisos para revisão: porções grandes nas dietas de 3.600 a 4.400 kcal e refeições acrescentadas.
- **Controle:** `banco/biblioteca/controle.json` bate com a base local (mesmo hash em 216 de 216).
- **Testes:**
  - `biblioteca1114.mjs`: 31 itens, inclusive as contagens, o bloqueio dos clínicos, de gestação e bariátricos, e o PDF da dieta feita a partir de modelo (com as orientações ao paciente e sem as do nutricionista);
  - 135 testes unitários;
  - regressão sem falhas: fumaça, treinoT2, T4a, T4c, T6, melhorias1101, cadastroAnamnese1110, complementar1106 e tmbGasto1110.

**Protegidos na produção** (leitura em 14/11, calculados com a lógica do aplicativo):

| Modelo | Energia calculada | Nominal ou decidido | Diferença |
|---|---|---|---|
| EMG-001 | 1.130 kcal | 1.300 | −13% |
| FIS-BIK-007 | 1.954 kcal | 2.100 | −7% |
| FIS-BIK-008 | 1.923 kcal | 2.300 | −16% |
| FIS-BIK-009 | 1.751 kcal | 2.000 | −12% |

Os textos desses modelos só citam diurético e restrição hídrica para proibi-los. Nada foi alterado: a V3 exige aprovação antes de reconciliar.

## 10. Perguntas para o cliente: respostas de 15/11

O nutricionista respondeu "a" às seis perguntas.

| # | Pergunta | Resposta | O que foi feito |
|---|---|---|---|
| 1 | Os 4 modelos manuais estão abaixo do valor do nome | Ajustar as porções até o valor do nome | Ajuste preparado; aplicação na carga (seção 12.3) |
| 2 | ALI-001 como vegetariana estrita | Confirmado | Nada a mudar |
| 3 | Piso de proteína de 2,0 g/kg no fisiculturismo | Confirmado | Nada a mudar |
| 4 | Pão de forma branco | Pão francês | Nada a mudar (já era assim) |
| 5 | Orientações ao aluno em corrida e ciclismo | O aluno vê direto no app | Campo criado (seção 12.1) |
| 6 | Autorização para colocar os modelos no sistema oficial | Autorizado | Execução a combinar com o usuário, depois do deploy da 038 (seção 12.4) |

## 11. Andamento

| Fase | % da fase | Situação |
|---|---|---|
| 1. Infraestrutura, importador, validador e pilotos | 100% | concluída |
| 2. Dietas liberadas (161) | 100% | concluída; 88 reajustadas em 15/11 (seção 12.2) |
| 3. Treinos (40) | 100% | concluída; corrida e ciclismo com observações ao aluno (seção 12.1) |
| 4. Bloqueados: rascunhos específicos (15) | 100% | concluída; aguardam revisão do nutricionista |
| 5. Relatório final e autorização | 100% | autorização recebida em 15/11 |
| 6. Respostas de 15/11 e carga na produção | 80% | respostas aplicadas na base local; falta a carga, depois do deploy |

**Módulo Biblioteca Mestre: 100% na base local; a carga na produção é o último passo.**

## 12. Ajustes de 15/11

### 12.1 Observações ao aluno em corrida e ciclismo (resposta 5)

- **Mesmo formato da musculação.** A planilha de corrida e ciclismo ganhou observações gerais, iguais às do treino de musculação: título, texto, até 20 e busca no catálogo do profissional. Fica em `plano.observacoes`; não há migração.
- **Validação.** `validarPlanoEndurance` usa a mesma regra da musculação (`validarObservacoesDoTreino` em `lib/treinoEditor.ts`).
- **Para o aluno.** O aluno não recebe o vínculo com o catálogo (`observacoesParaAluno`).
- **Editor.** O bloco "Observações do treino" fica abaixo da grade da semana, com o mesmo componente da musculação.
- **"Usar modelo" com Substituir.** As observações do modelo entram; se o modelo não tiver nenhuma, ficam as do rascunho.
- **Aluno.** No "Meu treino", o bloco "Observações do treino de corrida" (ou de ciclismo) aparece abaixo do planejado da semana. Aparece enquanto a planilha vigente estiver no ciclo e respeita o bloqueio por plano vencido (`orientacoesDasPlanilhas` em `lib/servidor/treinoAtividades.ts`).
- **PDF.** Seção "Observações do treino" no fim da planilha.
- **Biblioteca.** As orientações ao aluno dos 20 programas COR e CIC saíram do texto ao educador ("Para repassar ao aluno") e foram para as observações do plano. Os 20 foram reimportados na base local.
- **Testes.** Unitário em `tests/treinoEndurance.test.mjs`. Navegação em `treinoT4c` (editor, Meu treino e PDF, que precisa do pypdf) e em `biblioteca1114` (COR-001 e CIC-001).

### 12.2 Leite desnatado UHT (TACO 457) e reajuste de 88 dietas

- **Origem.** Na produção, o nutricionista completou à mão, em 08/11, a energia e os macronutrientes do "Leite, de vaca, desnatado, UHT". Ficou com 35 kcal, proteína 3,4 g, carboidrato 4,9 g e lipídio 0,2 g, com origem "manual".
- **Na base local.** A base local (e `banco/importacao/taco.sql`) não tinha esses valores, então o leite entrava com 0 kcal.
- **Conferência.** A comparação de toda a composição TACO entre a produção e a base local mostrou que essa é a única diferença. Os 4 valores foram copiados para a base local, com a mesma origem "manual".
- **Efeito.** Com o leite contado, 88 das 176 dietas passaram da faixa de ±3% da meta (até 8,1%). As 88 foram reajustadas com `ajustar --motivo`, que guarda o ajuste anterior em `ajuste.historico`, e reimportadas na base local.
- **Resultado.** As 216 validam sem erro, todas até 3% da meta, e 33 têm avisos.
- **Valores informados antes.** Os números dos 4 protegidos passados ao nutricionista em 14/11 também saíram baixos por causa do leite. Os valores reais estão na tabela da seção 12.3.

### 12.3 Ajuste dos 4 modelos manuais (resposta 1)

**Regra.** Proteínas, gorduras, legumes, laticínios e bebidas ficam como o nutricionista montou. Só as fontes de carboidrato mudam, até a meta ±1,5%.

- **Fonte de carboidrato:** pelo menos 50% da energia vem do carboidrato e o alimento tem pelo menos 50 kcal/100 g. Entram pães, arroz, feijão, aveia, batata-doce, banana e geleia.
- **Arredondamento:** gramas em passos de 5 g; medida caseira em unidades inteiras.

| Modelo | Antes | Depois | Meta | Proteína (g/kg, 60 kg) | Porções alteradas |
|---|---|---|---|---|---|
| EMG-001 | 1.183 kcal | 1.282 kcal | 1.300 | — | 4 |
| FIS-BIK-007 | 2.024 kcal | 2.094 kcal | 2.100 | 2,08 → 2,11 | 7 |
| FIS-BIK-008 | 1.993 kcal | 2.289 kcal | 2.300 | 1,99 → 2,12 | 9 |
| FIS-BIK-009 | 1.751 kcal | 2.006 kcal | 2.000 | 2,12 → 2,21 | 7 |

- **Arquivos.** O detalhe item a item está em `banco/biblioteca/protegidos/<CÓDIGO>.json`, com o conteúdo original, o novo, o cálculo e as mudanças. No relatório, os 4 aparecem como "protegido, ajuste preparado".
- **Ferramenta.** `scripts/biblioteca/protegidos.mjs`:
  - **preparar** calcula sem gravar em banco.
  - **aplicar** troca o conteúdo só se o modelo ainda estiver na revisão e com o conteúdo da cópia de 15/11. Também grava o código, soma 1 na revisão e registra o ajuste em `biblioteca`.
  - **restaurar** volta ao original.
  - Banco que não seja local exige `--producao` e `BIBLIOTECA_PRODUCAO=CONFIRMO`.
- **Teste na base local.** Foi feito com cópias temporárias dos 4 modelos, já removidas. O teste cobriu:
  - aplicar uma vez;
  - recusa ao repetir;
  - restaurar;
  - recusa por revisão diferente;
  - recusa de banco externo sem a confirmação.
- **Observações para o nutricionista** (sem alteração):
  - FIS-BIK-008 e FIS-BIK-009 usam "Geléia, mocotó, natural". Ele pode querer a geleia de frutas que cadastrou.
  - FIS-BIK-009 tem duas refeições "Pré-palco"; a segunda tem uma linha vazia.

### 12.4 Carga na produção (autorizada na resposta 6; execução a combinar)

1. **Deploy.** O deploy do usuário leva as migrações 035 a 038 e os commits desde cfaf513. Confirmar que a 038 está aplicada.
2. **Conferir os 4 modelos manuais.** Ler na produção, só leitura, se os 4 continuam na revisão e com o conteúdo da cópia: EMG-001 na revisão 4, FIS-BIK-007 na 1, FIS-BIK-008 na 2 e FIS-BIK-009 na 1. Se algum mudou, preparar de novo a partir da cópia nova.
3. **Rodar os comandos.** Com o projeto disponível, de dentro da VPS ou por túnel:
   - `importar --todos --producao --autor <e-mail do nutricionista>`;
   - `protegidos.mjs aplicar --producao`.

   Os dois exigem `BIBLIOTECA_PRODUCAO=CONFIRMO`.
4. **Conferir na produção.** Devem existir 216 modelos novos (161 liberados, 15 bloqueados, 40 treinos) e os 4 ajustados.
5. **Revisão dos bloqueados.** O nutricionista revisa os 15 bloqueados e clica em "Liberar para uso".
