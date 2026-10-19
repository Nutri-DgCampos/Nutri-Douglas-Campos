# 03 — Pendências que dependem do cliente

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
