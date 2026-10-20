# 03 — Pendências que dependem do cliente

## Respostas recebidas em 19/10/2026

| Item | Resposta do cliente | Efeito no projeto |
|---|---|---|
| B.2 Suplementos | Inseridos direto na dieta, tratados como alimentos | Sem cadastro próprio; suplementos são alimentos de cadastro manual (ex.: whey, creatina). CFG-11 encerrado |
| B.3 Trocar alimento | A quantidade zera | Ao escolher outro alimento na linha, quantidade de medidas e gramas ficam vazias |
| B.4 Registrar evolução | Substituído pela avaliação física | O registro rápido de peso sai quando a avaliação física entrar (Fase 4); os registros antigos continuam no histórico de peso |
| B.5 Dieta na área do paciente | Paciente vê a dieta completa em tela | Além do PDF, tela da dieta com refeições, opções, substituições e observações |
| B.6 Questionário de Rastreamento Metabólico | Não será usado | Fora do escopo |
| B.7 E-mail de contato | Sim, para enviar a anamnese, além do link por WhatsApp | E-mail de contato no cadastro, independente do acesso ao app |
| C.1 Traços | "Trataremos como vazio" | Traço = dado não disponível (ver dúvida abaixo sobre os zeros) |
| C.2 Alimentos sem kcal | De acordo | Ficam "Dado não disponível" até serem completados |
| C.3 Nutrientes fora da TACO | Usar fonte complementar reconhecida, à escolha da equipe | Pesquisar e propor a fonte (licença de uso incluída) |
| E Consentimento para IA | Não será pedido: a IA só auxilia, o nutricionista revisa e libera, sob sua responsabilidade | Sem termo de aceite no app |

Confirmações de 20/10/2026:

- **B.1 Sexo:** campo obrigatório no cadastro. Proposto Masculino / Feminino (os grupos das equações aprovadas); aguardando confirmação das opções. "Todas as equações possíveis" se referia aos protocolos de dobras: Jackson-Pollock 7 e 3 dobras, Faulkner, Slaughter e Petroski — todos devem aparecer (métodos ainda a submeter, M-04).
- **C.1 Traços:** só os traços viram "dado não disponível"; zeros verdadeiros continuam zero. Como o CSV não distingue traço de zero, a importação vai cruzar com a planilha oficial da TACO (NEPA/Unicamp, 4ª edição), onde os traços estão marcados como "Tr".
- **"5.1":** era a seção 1.1 — as cinco perguntas da TMB estão aprovadas.
- **M-01 e M-02:** aprovados (ver 04-metodos-cientificos.md).
- **E Consentimento:** o responsável consultou advogado; termo não é necessário porque a IA não decide nada diretamente para o paciente.
- Enviadas em 20/10/2026 e aguardando resposta: opções do campo sexo, seção A (trechos cortados, incluindo kcal não proteica/gN) e seção D (materiais, frase e CRN).

Respostas de 20/10/2026 (segunda rodada):

- **PDF de exemplo:** layout e intensidade da marca-d'água aprovados; assinatura só na última página, alinhada à direita.
- **Sexo:** somente Masculino e Feminino.
- **Perimetria:** as 9 medidas do roteiro (deltoide, tórax inspirado, cintura, abdômen, quadril, braço direito e esquerdo, coxa direita e esquerda).
- **Ilustrações:** são de autoria do responsável, com direito de uso. Recebidas em `Downloads\Avatars`: silhueta frente/costas (sem marcações) e faixas de percentual de gordura feminina (45, 40, 35, 30, 25, 20, 18, 15, 12, 10, 8, 5, 3%) e masculina (45, 40, 35, 30, 25, 20, 15, 12, 10, 8, 6, 4, 3%), com fundo transparente. A silhueta tem fundo cinza-escuro e é só masculina (pendente, ver abaixo).
- **Trechos cortados (4.1 a 4.10):** respondidos no arquivo "Esclarecimentos da SPEC — funcionalidades incompletas", **ainda não recebido**.
- O pacote `Acompanhamento_Nutricional_Inspecao_e_Acordos_2026-10-18.zip` contém `Acordos_Funcionais_Atualizados_2026-10-18.md` (acordos ND-166 a ND-225: Fórmulas, Medicações e Auxílio da IA no editor). Esses acordos prevalecem sobre o roteiro nesses três temas.

Esclarecimentos recebidos em 20/10/2026 (`Downloads\esclarecimentos da SPEC - funcionalidades incompletas.txt`): respondem todos os trechos cortados (seção A) — Importar dieta com as 4 origens, Gerar nova dieta, Salvar como modelo, Remover refeição, leitura do PDF de bioimpedância com conferência, 4 gráficos (12 avaliações), integração de peso e altura, 9 medidas de perimetria, ficha de anamnese — e confirmam o indicador kcal não proteica/gN (fator a aprovar, não presumir). Frase do cabeçalho e rodapé mantidos. Avatar de % de gordura: mostrar só o do sexo do paciente. Uso da planilha oficial da TACO autorizado.

Aprovações da Fase 1 (20/10/2026), documento `Aprovacao Fase 1 - Base de alimentos.md`:

- 1.1 a 1.9: estrutura da base de alimentos aprovada integralmente.
- 2.1: traços da planilha oficial gravados como "Tr" — de acordo.
- 2.2: os 112 zeros sem respaldo na planilha oficial gravados como dado não disponível — de acordo.
- 3: fonte complementar = opção B, USDA FoodData Central, por correspondência aprovada alimento a alimento.
- Carga da TACO na produção liberada.

Pendências abertas:

- ~~Arquivo de esclarecimentos dos itens 4.1 a 4.10.~~ Recebido.
- ~~Silhueta com fundo transparente; versão feminina.~~ Recebidas em 20/10/2026 (`Downloads\Avatar`): silhuetas feminina e masculina e faixas de percentual em resolução maior, todas com fundo transparente. Guardadas em `public/nutricao/avatares/`.
- Respostas da TACO (planilha oficial com "Tr").

Histórico — dúvidas levantadas em 19/10/2026, respondidas acima:

- **B.1 Sexo no cadastro:** a resposta foi "aparecer todas as equações possíveis". Não diz quais opções o campo terá.
- **C.1 Zeros da TACO:** tratar todo zero do CSV como vazio também apaga zeros verdadeiros (ex.: colesterol de vegetais).
- **"5.1 aprovado tudo":** não há item 5.1 no documento; provavelmente se refere à seção 1.1 (TMB). A seção 1.2 (gasto energético total) ficou sem resposta.
- Sem resposta ainda: seção A (trechos cortados) e seção D (materiais).

## A. Trechos do roteiro cortados na conversão do Word

O texto termina no meio da frase nestes pontos. Pedir o parágrafo completo (ou confirmar que a figura basta):

| Seção do roteiro | Onde corta |
|---|---|
| AVALIAÇÃO FÍSICA — INTEGRAÇÃO DO PESO E DA ALTURA, §9 | "manter vínculo com o paciente e a consu…" |
| AVALIAÇÃO FÍSICA — PERIMETRIA CORPORAL, §10 | "aproveitar as estruturas…" |
| AVALIAÇÃO FÍSICA — BIOIMPEDÂNCIA, §4 em diante | "associá-las aos…" (falta toda a regra de extração do PDF) |
| RESULTADOS — GRÁFICOS DE EVOLUÇÃO CORPORAL, §8 | "A interface…" |
| ANAMNESE — ABERTURA, PREENCHIMENTO E SALVAMENTO, §11 | "estruturas existentes … sempre" (e o §1 do bloco seguinte) |
| ELABORAÇÃO — BLOCO 1, L1, C3: IMPORTAR DIETA | Só a opção 1 aparece; faltam "Recordatório do paciente", "Outros pacientes" e "Modelos salvos" |
| ELABORAÇÃO — BLOCO 1, L1, C4: GERAR NOVA DIETA | Para após o §2 |
| ELABORAÇÃO — BLOCO 1, L1, C6: SALVAR DIETA COMO MODELO | Para no §3 ("Observações da…") |
| ELABORAÇÃO — BLOCO 1, L2, C2: REMOVER REFEIÇÃO | Para no §2 ("uma janel…") |

## B. Decisões a confirmar

1. **Sexo no cadastro:** quais opções aparecem (ex.: Masculino, Feminino) e como tratar pacientes para quem as equações por sexo não se aplicam.
2. **Suplementos:** é um cadastro separado de Medicações e Fórmulas? (aparece na SPEC 03 e no menu do NutriDiet; o roteiro só trata Medicações e Fórmulas).
3. **Trocar o alimento de uma linha:** a SPEC diz que "redefine a quantidade conforme comportamento aprovado". Para qual valor (medida padrão do novo alimento × mesma quantidade? equivalência calórica?).
4. **Registrar evolução atual:** continua ao lado da avaliação física (registro rápido de peso) ou passa a ser substituído por ela?
5. **Dieta na área do paciente:** o paciente vê só o PDF gerado (como hoje) ou também a dieta em tela?
6. **Questionário de Rastreamento Metabólico:** aparece no menu do NutriDiet (captura de 19/10) mas não no roteiro. Está fora do escopo?
7. **E-mail de paciente sem acesso:** o cadastro precisa de um e-mail de contato mesmo sem login (os 67 importados não têm e-mail)?

## C. Dados da TACO

- **Traços:** a TACO original marca "Tr" (traço) e "NA" (não analisado). Nos CSVs recebidos os dois parecem ter virado zero ou vazio; não dá para distinguir traço de ausência. Confirmar se zero = traço, ou se há outra versão dos arquivos.
- **6 alimentos sem kcal** nos CSVs: ficam como "Dado não disponível" até o nutricionista completar.
- **Nutrientes que a TACO não traz:** vitamina B12, folato, vitaminas D e E, selênio, açúcares, fibras solúveis e insolúveis. Aparecem como "Dado não disponível" (como o roteiro prevê) até haver fonte complementar aprovada.

## D. Materiais

- Ilustrações do avatar com setas de perimetria e da escala de percentual de gordura (masculina e feminina), com direito de uso.
- Logotipo, assinatura e frase em boa resolução (os do PDF de exemplo estão em baixa resolução).
- Número do CRN e nome profissional exatos para o rodapé (o exemplo mostra "Nutri Douglas Campos CRN-3 76014/P").

## E. Privacidade

- Texto de consentimento do paciente para envio de dados de saúde à OpenAI (exames, treino, bioimpedância, anamnese, auxílio da IA). Necessário antes da Fase 7 e recomendado já para os recursos atuais.
