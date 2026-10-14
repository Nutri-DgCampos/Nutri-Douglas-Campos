# Como preencher a planilha de pacientes

Abra o arquivo `modelo-pacientes.csv` no Excel ou no Google Planilhas. Cada linha é um paciente.

As duas linhas de exemplo (Maria e João) mostram o formato. **Apague as duas** antes de devolver a planilha.

## Colunas

| Coluna | Obrigatória | Como preencher |
|---|---|---|
| nome | Sim | Nome completo do paciente. |
| email | Sim | E-mail que o paciente vai usar para entrar no aplicativo. Um e-mail diferente para cada paciente. |
| telefone | Não | Com DDD. Ex.: (14) 99999-0001 |
| plano | Sim | Exatamente uma destas palavras: **Semanal**, **Quinzenal** ou **Mensal**. |
| inicio_acompanhamento | Não | Data em que começou o acompanhamento atual (dd/mm/aaaa). Deixe em branco se o paciente ainda vai começar; o acompanhamento passa a contar quando você enviar a primeira dieta. |
| objetivo | Não | Ex.: Emagrecimento, Ganho de massa, Definição. |
| peso_inicial_kg | Não | Só o número, com vírgula. Ex.: 72,5 |
| treinos_por_semana | Não | Número de 0 a 14. Use 0 se não treina. |
| aerobicos_por_semana | Não | Número de 0 a 14. Use 0 se não faz aeróbico. |
| meta_individual | Não | Meta combinada com o paciente. Em branco, o sistema usa: "Planejar e organizar as refeições do dia seguinte com antecedência." |
| status_pagamento | Não | **Ativo**, **Pendente** ou **Cancelado**. Em branco, fica Ativo. |
| lembrete_importante | Não | Anotação que só você vê. Ex.: Realizar exame de sangue em 12/12 |

## Cuidados

- Não mude os nomes nem a ordem das colunas da primeira linha.
- Não use ponto e vírgula (;) dentro dos textos.
- Ao salvar no Excel, escolha **CSV UTF-8 (separado por vírgulas)**. Se aparecer um aviso sobre manter o formato, mantenha.
- No Google Planilhas: *Arquivo → Fazer download → Valores separados por vírgula (.csv)*.

## Depois da importação

Todos os pacientes recebem a mesma senha provisória, que será informada à parte. Cada paciente troca a senha no primeiro acesso.
