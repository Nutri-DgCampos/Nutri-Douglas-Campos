# Correção: mudança de plano durante o ciclo ativo (auditoria e plano)

**Data:** 04/11/2026
**SPEC:** `Downloads\SPEC_Plano_Ativo_Correcao_Final\SPEC_Plano_Ativo_Correcao_Final.md`

A SPEC pede auditar antes de alterar código (seção 7). Este documento traz a auditoria, o plano, as decisões do técnico (S9 a S12, seção 5) e o que foi implementado (seção 6).

Escopo: só o acompanhamento nutricional (relatório semanal do paciente). O Módulo de Treino tem relatórios próprios (`treino_relatorios`) e não é afetado.

## 1. Onde fica cada informação

| O quê | Onde | Quem grava |
|---|---|---|
| Plano do cadastro | `patients.plan` ("Semanal", "Quinzenal" ou "Mensal") | Cadastro do paciente, edição (`pacientes/[id]/editar`), renovação |
| Plano que vale no ciclo | `diet_cycles.followup_frequency` | Só quando o ciclo nasce: `iniciar_ciclo_dieta(...)`, chamado em `app/api/nutricao/dietas/[id]/enviar/route.ts` com o plano pedido na renovação ou, sem ela, com `patients.plan` |
| Calendário dos relatórios | Calculado na hora por `segundasPrevistas()` em `lib/cronograma.ts`, a partir de `start_date` e `followup_frequency` do ciclo (e do cadastro retroativo) | Ninguém: não há tabela de calendário |
| Relatório respondido | `patient_reports` (`cycle_id`, `scheduled_week_start`, `cycle_report_number`) | O paciente, pelo formulário (`area-paciente/acompanhamento`) |
| Aviso "Seu relatório está disponível!" | `notification_queue`, `dedup_key = relatorio:<ciclo>:<segunda>:segunda` ou `:terca` | Agendador `app/api/agendar-relatorios` (segunda das 9h às 10h e terça das 18h às 19h); envio pela fila (`lib/servidor/filaDeNotificacoes.ts`) |

Quem lê o calendário, sempre a partir do ciclo:
- `app/area-paciente/page.tsx`, com `relatorioAbertoHoje` e `situacaoDosRelatorios`;
- `app/area-paciente/acompanhamento/page.tsx`, ao enviar o relatório;
- `app/(nutricionista)/relatorios/page.tsx`, para "não enviados nesta semana";
- `app/api/agendar-relatorios/route.ts`, para o push.

## 2. Causa raiz

A tela **Editar paciente** (`app/(nutricionista)/pacientes/[id]/editar/page.tsx`, linhas 99–112) grava o plano **só em `patients.plan`**. O ciclo ativo continua com a `followup_frequency` antiga, e todas as regras de relatório leem o ciclo.

Ao corrigir mensal para semanal:
- o cadastro passa a mostrar "Semanal", mas o calendário continua mensal: um relatório, ao completar 4 semanas;
- o paciente não vê relatório na segunda e na terça;
- o agendador não enfileira o push;
- a tela de relatórios não aponta pendência.

Há dois agravantes, mesmo depois de sincronizar:
1. O formulário só abre **na segunda e na terça** da semana prevista (`relatorioAbertoHoje`; e `salvarRelatorio` recusa fora desses dias). Uma correção feita na quarta só valeria na semana seguinte.
2. O push só é enfileirado pelo agendador na janela de segunda de manhã. Uma correção feita depois disso não gera aviso.

## 3. D2 e D4 conferidos no código

- **D2:** "disponibilizar o relatório" é abrir o **formulário semanal para o paciente preencher**. O registro em `patient_reports` só nasce quando ele envia. Não existe relatório consolidado automático na Nutrição.
- **D4:**
  - a **mudança comercial** já tem caminho: a renovação, em que o paciente escolhe o plano (`renewal_requests.requested_plan`) e o próximo ciclo nasce com ele;
  - a **tela de edição** é hoje o único lugar de **correção** do ciclo atual.

## 4. Plano (patch mínimo)

1. **Migração 034 (aditiva):**
   - Tabela `plano_alteracoes`: profissional, plano anterior e novo (cadastro e ciclo), data e hora, motivo, ciclo afetado e efeitos (semana liberada, aviso enfileirado).
   - Em `diet_cycles`:
     - `relatorio_liberado_semana`: segunda prevista liberada fora da janela;
     - `relatorio_liberado_ate`: até quando fica aberto.
   - A função `validar_data_relatorio_ciclo` não muda: ela já aceita qualquer semana do ciclo.
2. **Rota nova no servidor**, `POST /api/pacientes/[id]/plano`, só para o nutricionista e numa transação com bloqueio do ciclo (`for update`):
   1. grava `patients.plan` e, se houver ciclo ativo, `diet_cycles.followup_frequency`. Datas do ciclo, pagamentos, acesso, dieta e histórico ficam como estão (RF-09, CA-07, CA-13);
   2. calcula, pelo calendário real (`segundasPrevistas`), o relatório **mais recente já devido**: a maior segunda prevista que não está no futuro. Ele só é liberado se ainda não foi respondido, se não está na janela normal (segunda e terça) e se é posterior ao cadastro retroativo (Opção B, CA-12). As semanas anteriores não são liberadas;
   3. se houver um, grava a liberação no ciclo e enfileira **um** push com `dedup_key = relatorio:<ciclo>:<segunda>:liberacao`, com o mesmo texto do aviso de segunda (D3, RF-05). A fila já registra as tentativas e as falhas e reenvia sem duplicar (CA-05);
   4. registra tudo em `plano_alteracoes`;
   5. salvar de novo o mesmo plano é seguro: não libera de novo uma semana já liberada ou respondida, e o `dedup_key` impede o push duplicado (RF-07, CA-04, CA-11). Isso também serve de "reaplicar o plano ao ciclo" (RF-12, CA-15).
3. **A liberação passa a valer na regra única** (`lib/cronograma.ts`):
   - `relatorioAbertoHoje` também aceita a semana liberada até `relatorio_liberado_ate`;
   - o formulário (`salvarRelatorio`) usa a mesma regra, em vez de "só segunda e terça".
4. **Tela Editar paciente:**
   - com ciclo ativo, a troca de plano (ou "Reaplicar o plano ao ciclo atual", quando o cadastro já está certo e o ciclo não) abre uma confirmação. Ela mostra o plano anterior e o novo, o ciclo afetado, a periodicidade futura e se um relatório será liberado agora, e avisa que as semanas anteriores não serão regularizadas (RF-11);
   - a mensagem de sucesso só aparece depois da gravação; se o paciente não tiver aparelho inscrito, avisa que o push não pôde ser enviado.
   - Os demais campos continuam sendo salvos como hoje.
5. **Paciente sem acesso vigente** (CA-08): não há liberação sem ciclo ativo ou fora das datas do ciclo. A regra atual de acesso não muda.
6. **Testes:**
   - unitários da regra "mais recente devido": CA-01, CA-02, CA-09, CA-12 e CA-14 (quarta-feira), a fronteira de domingo e segunda no fuso de Brasília e o cadastro retroativo;
   - navegação: mensal para semanal na quarta, salvar de novo, semanal para mensal, reaplicar, push falhando e acesso;
   - regressão completa.
7. **Os três pacientes:** nenhum script nem correção em lote (RF-12). O nutricionista corrige pela tela depois do deploy.

## 5. Decisões do técnico (04/11/2026)

| Resposta | Decisão |
|---|---|
| S9 | A troca na edição, com ciclo ativo, é sempre correção do ciclo atual. A mudança comercial futura continua pela renovação. |
| S10 | Sem motivo: o registro guarda quem, quando, o plano anterior e o novo, o ciclo e o que foi liberado. |
| S11 | O relatório liberado fora da janela fica aberto **só no dia da correção, até 23h59** (Brasília). |
| S12 | Na segunda ou na terça da semana prevista, vale a janela normal (até terça), com o aviso enviado na hora. O lembrete de terça continua. |

## 6. Implementado

- **Migração `034_plano_ativo.sql`:** `diet_cycles.relatorio_liberado_semana` e `relatorio_liberado_ate`, e a tabela `plano_alteracoes`.
- **`lib/cronograma.ts`:**
  - `relatorioParaLiberar()` escolhe o relatório mais recente devido. Respeita as datas do ciclo e o cadastro retroativo e não devolve nada se ele já foi respondido.
  - `relatorioAbertoHoje()` aceita a semana liberada até `relatorio_liberado_ate`.
- **`lib/servidor/planoAtivo.ts` e `app/api/pacientes/[id]/plano`:**
  - GET devolve a prévia; POST grava o cadastro e o ciclo numa transação com `for update`.
  - Libera o relatório e enfileira um aviso do tipo `relatorio`, com `dedup_key = relatorio_liberado:<ciclo>:<segunda>`. O texto é o mesmo do aviso de segunda.
  - Registra a alteração.
  - Só o nutricionista, e só para paciente da clínica.
  - Uma semana já liberada num dia anterior não é reaberta: salvar de novo não estende o prazo.
- **Agendador** (`app/api/agendar-relatorios`): não repete o aviso de segunda quando o aviso da correção já saiu.
- **Área do Paciente:**
  - o cartão do início usa a liberação;
  - o envio do formulário aceita a semana liberada no dia (fora dela, a regra de segunda e terça continua).
- **Editar paciente** (componente `ConfirmarPlano`):
  - a troca de plano abre a confirmação: plano anterior e novo, ciclo e datas, periodicidade futura, relatório que será liberado e o aviso de que as semanas anteriores não são regularizadas;
  - se o cadastro e o ciclo divergem, aparece "Reaplicar o plano ao acompanhamento atual";
  - a mensagem de sucesso só aparece depois da gravação e avisa quando o paciente não tem aparelho com avisos ativados;
  - os demais campos continuam sendo salvos como antes; o plano não vai mais pela gravação genérica.

Testes:
- `tests/planoAtivo.test.mjs`: 9 casos (CA-01, CA-02, CA-03, CA-08, CA-11, CA-12, CA-14, S11, S12, retroativo e a fronteira de domingo).
- `tests/navegacao/planoAtivo1104.mjs`: 23 verificações, pela tela, com o paciente de teste. O ciclo dele é restaurado no fim.

**Os três pacientes:** depois do deploy, o nutricionista abre "Editar paciente" de cada um e troca o plano para Semanal. Se o cadastro já estiver como Semanal, usa "Reaplicar o plano ao acompanhamento atual". Não há script nem correção em lote.
