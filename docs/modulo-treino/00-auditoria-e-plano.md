# Módulo de Treino: auditoria e plano (Etapa 0)

Resposta à `SPEC_MODULO_TREINO.md` v1.0 (01/11/2026). Levantamento feito no código e no banco reais (commit `a93791e`), sem alterar nada.

## 1. O que existe hoje

| Área | Situação real | Onde |
|---|---|---|
| Infraestrutura | Next.js 16.3.8 (App Router), React 19, PrimeReact + Tailwind 4. PostgreSQL 17 em Docker, sem ORM (SQL direto via `pg`). VPS Hostinger Ubuntu 24.04, nginx, `deploy.sh` com migrações numeradas e backup antes. Backup externo diário para um computador do cliente. **Não há Supabase nem Vercel**: `lib/api.ts` só imita a interface antiga e chama as rotas do próprio app. | `docker-compose.yml`, `deploy.sh`, `banco/migrations` |
| Login e papéis | Sessão própria por cookie. O papel fica em `profiles.role`, com só dois valores: `nutricionista` (2 contas) e `paciente`. **Não existe personal trainer, administrador nem vínculo de aluno com vários profissionais.** Qualquer nutricionista vê todos os pacientes. | `lib/servidor/sessao.ts`, `lib/servidor/permissoes.ts` |
| Permissões | Regras por tabela no servidor (`/api/dados`, substitutas das políticas do Supabase) e rotas próprias com `exigirNutricionista`. Download de arquivo autorizado no servidor. | `lib/servidor/permissoes.ts`, `lib/servidor/arquivos.ts` |
| Treino atual | Tabela `treinos`: o **aluno** envia um arquivo ou cola um texto, e a IA organiza em `plano` (JSON: dias SEG–DOM e exercícios com séries, reps, carga, descanso e observação). Só musculação. | `banco/migrations/006`, `lib/servidor/treinos.ts`, `components/EnvioTreino.tsx` |
| "Meu treino" (IMG-01 a 03) | `components/PainelTreino.tsx`: dias, modal com Séries/Reps/Carga/Descanso, volume por grupo, tonelagem, nível e kcal estimada (`lib/treino.ts`). Ao salvar, o **próprio `plano` é sobrescrito**: hoje prescrição e registro do aluno são o mesmo dado, sem histórico de cargas. | `app/area-paciente/treino/page.tsx`, `components/PainelTreino.tsx` |
| Treino no lado profissional | A ficha do paciente mostra um resumo do treino, e `pacientes/[id]/treino` mostra o painel em modo leitura. Não há editor, prescrição nem publicação pelo profissional. | `app/(nutricionista)/pacientes/[id]/treino/page.tsx` |
| Push | Web Push (VAPID) com fila `notification_queue` e envio imediato pelo agendador. **Só para pacientes**: `push_subscriptions` e a fila são por `patient_id`. O profissional não recebe push hoje. | `lib/servidor/filaDeNotificacoes.ts`, `lib/servidor/notificacoes.ts`, `public/sw.js` |
| Alertas no painel | Tela "Alertas" com a tabela `patient_alerts` (alertas do relatório nutricional). | `app/(nutricionista)/alertas` |
| Agendador | Container `nutri-cron`. Notificações a cada 60 s, relatórios a cada 5 min e tarefas diárias. Fuso operacional: `America/Sao_Paulo`, já usado em todo o código. Serve para o fechamento semanal. | `cron/agendador.sh` |
| Relatórios e devolutiva | Só da Nutrição: questionário semanal (`patient_reports`), score, devolutiva com IA e envio manual. O cartão "Relatórios" da home do paciente acende com `patient_update_views` do tipo `devolutiva`. | `app/(nutricionista)/relatorios`, `app/area-paciente/relatorios` |
| Contratos e pagamentos | Ciclo de 33 dias (`diet_cycles`), `payments` por ciclo (comprovante anexado e confirmado são estados separados) e `renewal_requests`. Tudo da Nutrição; nada de Treino. | `lib/cronograma.ts` |
| Offline | O app é PWA (manifesto e service worker), mas o service worker **só trata push**: não guarda páginas nem dados. Não há fila offline. | `public/sw.js` |
| Reaproveitáveis | Avaliação física (com PDF e envio), fotos de evolução, anamnese por link, PDFs com identidade visual, envio de documentos ao paciente, base de IA com limite e registro de uso, bibliotecas genéricas com autosave. | Módulo de Nutrição, fases 0–7 |

## 2. Diferenças entre a SPEC e o sistema real (decisões para o cliente)

1. **Profissionais e papéis.** A SPEC pressupõe administrador, nutricionista, personal trainer e alunos ligados a vários profissionais, com dados separados. Hoje só existe o papel `nutricionista`, que vê tudo. Antes de tudo, precisamos saber:
   - quem vai prescrever o treino;
   - se haverá outras contas de personal trainer;
   - se cada um verá só os próprios alunos.

   Essa é a mudança de maior risco: ela mexe na regra de acesso de todo o sistema.
2. **Push para o profissional.** O alerta imediato de desconforto exige push para o profissional, que hoje não existe (só pacientes recebem). Reaproveitamos o mesmo provedor e a mesma fila, só que o profissional precisa ativar as notificações no navegador ou celular dele. O alerta fica sempre gravado no painel.
3. **Prescrição × registro.** Hoje o aluno edita o próprio `plano`. Separar prescrição e registro é necessário (SPEC 3.1). O treino atual de cada aluno vira uma "prescrição de origem externa", sem perda.
4. **Contratos, planos e bloqueio do Treino** (SPEC 12) são um sistema novo de assinaturas por profissional. Ele não reaproveita direto o ciclo de 33 dias, que é da Nutrição.
5. **Metas e limiares de baixa adesão** não têm número universal (SPEC 4 e 17): o profissional configura por aluno e por modalidade.

## 3. Matriz: recurso existente × extensão × arquivos × risco × teste

| Recurso existente | Extensão proposta | Arquivos impactados | Risco | Teste de regressão |
|---|---|---|---|---|
| `treinos.plano` editado pelo aluno | Prescrição versionada separada do registro do aluno; o treino atual vira prescrição externa | migração nova, `lib/treino.ts`, `PainelTreino.tsx`, `app/area-paciente/treino` | Médio: dados atuais migrados | Ver meu treino, Novo arquivo e Colar texto iguais; o volume não muda |
| Modal Séries/Reps/Carga/Descanso | "Anterior: X kg", Ver execução, cronômetro, situação da sessão, observação, relatar desconforto | `PainelTreino.tsx` (acréscimos, sem refazer) | Baixo | Layout e edição dos 4 campos iguais |
| Importação por IA (musculação) | Corrida e ciclismo com validação humana e origem identificada | `lib/servidor/treinos.ts`, `EnvioTreino.tsx` | Médio: prompt | Parser de musculação com os mesmos arquivos de teste |
| Ficha e treino no lado profissional | Módulo de Treino no menu (abaixo de Nutrição), painel geral do aluno, editor, biblioteca, publicar com "Enviar treino" | `Navegacao.tsx`, novas rotas `app/(nutricionista)/treino/*` | Baixo (novo) | Navegação e ficha atuais |
| `profiles.role` com 2 papéis | Papéis personal e admin; vínculo aluno × profissional; regras por vínculo | `sessao.ts`, `permissoes.ts`, rotas `exigirNutricionista` | **Alto** | Acesso de todas as telas da Nutrição (`nav/acesso.mjs`) |
| Push só para pacientes | Push para profissionais (inscrição por usuário), mesma fila | migração, `filaDeNotificacoes.ts`, `sw.js` | Médio | Push da Nutrição (dieta, devolutiva, documentos) |
| Agendador | Fechamento semanal no domingo 00:00 (America/Sao_Paulo), idempotente | `cron/agendador.sh` (uma rota nova), rota de tarefa | Baixo | Tarefas atuais do agendador |
| Relatórios da Nutrição | Relatório de Treino próprio (sem questionário), devolutiva, pendências, atraso, lista de atenção; cartão Relatórios com "Chegou a devolutiva do seu Personal Trainer" | novas tabelas, `app/area-paciente/relatorios`, `app/area-paciente/page.tsx` | Médio: o cartão é compartilhado | Devolutiva da Nutrição e indicador iguais |
| PWA sem offline | Rascunho local e fila de sincronização idempotente no "Meu treino" | `sw.js`/IndexedDB, rotas com chave de idempotência | Médio | Edição online igual; troca de usuário limpa os dados locais |
| Avaliação física, fotos, anamnese, PDFs | Reaproveitar com permissão por vínculo; anamnese de treino própria | módulos da Nutrição (leitura) | Médio | Fases 4–6 |
| Pagamentos da Nutrição | Planos e contratos de Treino separados; bloqueio só do Treino | novas tabelas e telas | Alto (regras novas) | Ciclo de 33 dias e pagamentos iguais |
| IA (limite e registro de uso) | IA no editor de treino, sempre com aceite do profissional | `lib/servidor/ia.ts` (reuso) | Baixo | Fase 7 |

## 4. Plano incremental proposto

A ordem foi ajustada ao que existe: primeiro o que gera valor sem depender da mudança de papéis.

| Etapa | Conteúdo | Depende de |
|---|---|---|
| **T1** | Prescrição × registro: tabelas de prescrição (versão publicada imutável) e de registro do aluno; o treino atual migra como prescrição externa. No "Meu treino": "Anterior: X kg", situação da sessão (concluído, parcial, não concluído, reagendado), observação livre e histórico de cargas só para o profissional. | — |
| **T2** | Relatar desconforto: alerta gravado no painel, push ao profissional (inscrição por usuário) e orientação de segurança | T1 |
| **T3** | Relatório semanal automático: fechamento no domingo 00:00, consolidação, devolutiva no cartão Relatórios, pendências, atraso de 2 relatórios e lista de atenção (sem registros, baixa adesão, meta), com metas configuráveis por aluno | T1 |
| **T4** | Módulo de Treino no menu e na ficha; biblioteca de exercícios (catálogo inicial); editor de musculação com rascunho, prévia e "Enviar treino"; modelos | T1 |
| **T5** | Offline: rascunho local, fila idempotente, indicador de sincronização e alerta tardio | T1, T2 |
| **T6** | Corrida e ciclismo: sessões, diário, métricas, zonas, importação | T3, T4 |
| **T7** | Papéis e vínculos (personal trainer, admin, vários profissionais) e regras de acesso por vínculo | decisão 2.1 |
| **T8** | Planos, contratos, renovação e bloqueio do Treino | T7 |
| **T9** | Anamnese de treino, avaliação compartilhada, PDFs de treino, IA no editor | T4, T7 |

Cada etapa sai com:
- uma migração que só acrescenta, com plano de reversão;
- teste de navegação próprio e a regressão completa da Nutrição;
- entrega separada para aprovação.

## 5. Andamento

**T1 entregue em 01/11/2026** (migração `020_treino_prescricao_e_registros.sql`, só acrescenta):

- Prescrição e registro do aluno separados:
  - `treino_prescricoes` é a prescrição, publicada e imutável (trava no banco). O treino importado vira prescrição de origem "externa"; um "Ler novamente" com resultado diferente gera uma nova versão;
  - `treino_sessoes` e `treino_exercicios_registro` guardam o que o aluno registra. A semana vai de domingo a sábado, no horário de Brasília, com uma sessão por dia planejado: salvar de novo não duplica;
  - o aluno não altera mais o treino pela API.
- "Meu treino", com o mesmo layout:
  - os campos partem da prescrição, e o que o aluno já registrou na semana aparece por cima;
  - "Anterior: X kg" abaixo da carga, só quando existe uma carga registrada antes;
  - nova seção "Como foi este treino?": concluído, parcial, não concluído ou reagendado (com nova data), motivo opcional e observação livre;
  - salvar os números não marca o treino como feito;
  - a lista de dias mostra a situação;
  - as tabelas de volume usam os valores mais recentes registrados.
- Profissional (tela de treino do paciente):
  - origem da prescrição;
  - registros do aluno (situação, motivo, observação e números);
  - histórico completo de cargas por exercício.
- Testes:
  - `tests/treino.test.mjs` (3 testes);
  - `tests/navegacao/treinoT1.mjs` (22 verificações);
  - `tests/navegacao/fumaca.mjs` (18 telas da Nutrição e do paciente).

## 6. Para seguir (T2 em diante), precisamos de

- **D1:** de acordo com a ordem acima (T2: relatar desconforto com push ao profissional; T3: relatório semanal)?
- **D2:** quem prescreve o treino hoje (o mesmo login do nutricionista, ou outra pessoa e outro login)? Isso define se T7 vem antes de T4.
- **D3:** na T1, a situação da sessão e a observação ficaram no próprio modal do dia, abaixo dos exercícios (sem tela nova). Confirma?
