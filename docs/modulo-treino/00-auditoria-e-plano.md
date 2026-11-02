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

**T7a e T2 entregues em 01/11/2026** (migração `021_treino_educadores_e_desconforto.sql`, só acrescenta):

- Papéis (respostas D1–D2 do cliente):
  - o nutricionista é o administrador: vê todos os alunos no Módulo de Treino, cadastra educadores físicos e faz os vínculos;
  - o educador físico tem login próprio (papel `educador_fisico`, senha provisória trocada no primeiro acesso). Ele vê só o Módulo de Treino, e só dos alunos vinculados a ele;
  - qualquer outra tela ou rota continua exigindo o papel de nutricionista, e o educador é recusado também pela API (teste automático);
  - desativar o educador corta o acesso na hora; vínculos e histórico ficam guardados;
  - um aluno pode ter mais de um educador.
- Navegação:
  - "Módulo de Treino" no menu, abaixo de Nutrição;
  - o cartão Treino da ficha abre o painel geral do aluno (`/treino/alunos/[id]`): treino vigente, registros, histórico de cargas, relatos de desconforto e educadores vinculados;
  - o endereço antigo `pacientes/[id]/treino` redireciona para o painel.
- Relato de desconforto (T2):
  - botão "Relatar desconforto" no modal do dia, sem sair dele;
  - campos: região, intensidade 0–10, exercício (opcional), percepção ("Desconforto leve: continuei o exercício" / "Incômodo mais acentuado: parei o exercício") e comentário;
  - orientação de segurança no topo;
  - o relato é gravado na hora. Reenviar o mesmo relato não duplica (chave gerada no aparelho, base para o offline da T5);
  - sem conexão, o app diz que o relato ainda não foi enviado.
- Alerta ao profissional:
  - push imediato aos educadores vinculados e ativos; sem educador vinculado, vai aos administradores;
  - inscrições e fila próprias dos profissionais, com as mesmas chaves VAPID e o mesmo service worker do push do paciente; a fila do paciente não muda;
  - o profissional ativa os alertas em "Ativar alertas neste aparelho", no início do Módulo de Treino;
  - o relato fica sempre listado no painel, mesmo sem push, com "Marcar como visto" e quem viu;
  - no aviso da tela bloqueada vão só o primeiro nome e a intensidade.
- Testes:
  - `tests/navegacao/treinoT2.mjs`: 40 verificações;
  - `treinoT1.mjs`: 22 verificações;
  - `fumaca.mjs`: 21 telas;
  - 58 testes unitários.

## 6. Decisões do cliente (01/11/2026)

- **D1:** de acordo com a ordem.
  - Desconforto: pela percepção do aluno. Leve, ele continua; mais acentuado, ele para o exercício.
  - Relatório: a devolutiva chega no cartão Relatórios ("Chegou a devolutiva do seu Personal Trainer"). O personal responde os relatórios do Treino na área Relatórios, a mesma em que o nutricionista responde, com a indicação "Nutricional" ou "Treino".
- **D2:** o nutricionista é o admin e também prescreve. Haverá cadastro de outros educadores físicos, com acesso só ao Módulo de Treino.
- **D3:** sem resposta. Mantido como entregue (situação e observação no modal do dia). Confirmado depois na resposta A5.

## 7. Respostas do técnico (01/11/2026)

Perguntas em `Downloads/Arquivos/Perguntas para o tecnico - Treino e Melhorias 2026-11-01.md`.

**A. O que já está pronto**
- **A1:** aprovado o texto das três linhas de orientação de segurança.
- **A2:** se o aluno tem educador, o alerta vai só para o educador. Já era assim.
- **A3:** push só para os relatos mais fortes. Confirmado pelo técnico: mais forte = o aluno parou o exercício **ou** deu intensidade 7 ou mais. Os demais relatos ficam só no painel, sem push.
- **A4:** regiões do corpo mantidas.
- **A5:** situação e observações no modal do dia, confirmado.
- **A6:** personal e educador físico são a mesma função, um perfil só.
- **A7:** o educador pode cadastrar alunos próprios:
  - esses alunos **não** aparecem na lista de pacientes do nutricionista;
  - eles têm acesso à Área do Paciente.
  
  Ainda não implementado: é uma etapa nova (T7b, seção 9).

**B. Relatório semanal e lista de atenção (T3)**
- **B1:** horário de Brasília para todos.
- **B2:** cada educador envia a própria devolutiva (opção a).
- **B3:** só os alunos marcados pelo profissional como "com acompanhamento" (opção b).
- **B4:** aprovadas as sugestões:
  - parcial = meia sessão;
  - reagendado e feito = feito;
  - baixa adesão < 60%, padrão inicial editável por aluno.
- **B5:** meta em texto livre, marcada à mão como atingida ou não.
- **B6:** a pausa é registrada só pelo profissional, com início e fim (opção a).
- **B7:** a lista de atenção aparece só para o educador, só no painel, sem push.
- **B8:** o atraso de devolutiva aparece só para o educador.
- **B9:** IA escreve o rascunho da devolutiva, como na Nutrição. O profissional revisa antes de enviar.
- **B10:** o push ao aluno tem o mesmo texto do cartão.

**C. Editor e biblioteca**
- **C1:** nós montamos a lista inicial de exercícios, para revisão do cliente.
- **C2:** vídeos são links do YouTube gravados pelo próprio cliente, que tem o direito de uso.
- **C3:** aprovada a sugestão. O aluno vê séries, repetições, carga, descanso e observação; cadência, RPE, RIR, aquecimento e técnicas ficam no editor.
- **C4:** aprovada a sugestão. O publicado por último é o vigente, e o anterior vai para o histórico.
- **C5:** academias e equipamentos entram **agora**, na etapa do editor.
- **C6:** fim do descanso só vibra o celular.

**D. Offline**
- **D1:** treinam em academias com sinal bom. O offline perde prioridade.
- **D2:** celular compartilhado não é comum.

**E. Corrida e ciclismo**
- **E1:** o profissional informa as zonas de FC de cada aluno. Sem fórmula.
- **E2:** zonas por FTP, 7 zonas de Coggan, e o profissional também pode informar à mão. Antes de programar, conferir os percentuais de Coggan em fonte publicada e mostrar ao cliente.
- **E3:** controle de quilometragem dos tênis, com aviso em km como padrão editável.
- **E4:** Garmin e Strava: estrutura pronta agora, integração depois.

**F. Vários profissionais**
- **F1:**
  - aluno compartilhado (cadastrado com os dois profissionais): o educador vê toda a avaliação física, sem autorização extra;
  - o educador também faz avaliação física, e o nutricionista vê a dele quando o aluno é compartilhado.
- **F2:** cada profissional tem a própria anamnese, que os outros não veem.
- **F3:** as observações privadas de um profissional ficam invisíveis para os outros, inclusive o nutricionista.

**G. Planos e pagamentos**
- **G1:** cada profissional cria os próprios planos e preços.
- **G2:** cada profissional confirma o pagamento dos próprios alunos.
- **G3:** formas de pagamento iguais às da Nutrição.
- **G4:** tolerância após o vencimento: padrão editável por profissional.
- **G5:** Nutrição e Treino são pagos e renovados separadamente.

**H. PDFs**
- **H1:** cada PDF sai com a identidade de quem prescreveu.

**J. Ordem**
- **J1:** mantida.

## 8. Próxima etapa: T3 (relatório semanal)

Com as respostas B1–B10:
- Fechamento no domingo 00:00, horário de Brasília, só para os alunos marcados "com acompanhamento".
- Consolidação dos registros, observações e desconfortos da semana. Adesão com parcial = 0,5 e reagendado feito = 1; baixa adesão abaixo de 60% por padrão, editável por aluno.
- Metas em texto livre, marcadas à mão.
- Pausas registradas pelo profissional (início e fim) tiram o aluno da lista de atenção.
- Uma devolutiva por educador vinculado, na área Relatórios, com a indicação Nutricional/Treino e rascunho da IA.
- Aviso ao aluno no cartão Relatórios e por push, com o mesmo texto.
- Lista de atenção e atraso (2 relatórios sem resposta): só para o profissional responsável, só no painel, sem push. Sem educador vinculado, o responsável é o nutricionista.

## 9. Mudanças de escopo trazidas pelas respostas

- **T7b, alunos próprios do educador (A7):** o educador cadastra alunos que pertencem só a ele. Isso pede um dono por cadastro de paciente. A lista do nutricionista, a busca, os relatórios, os avisos e todas as rotas da Nutrição passam a filtrar por dono, e o aluno do educador entra na Área do Paciente vendo só o Treino. É a mudança de maior risco até aqui. Sugestão: fazer logo depois da T3, antes do editor, porque F1, G1–G5 e H1 dependem do mesmo conceito de "profissional dono".
- **Editor (T4):** inclui academias e equipamentos (C5), links do YouTube (C2) e vibração no fim do descanso (C6).
- **Offline (T5):** mantido na ordem, com escopo mínimo (D1).
- **Planos (T8):** um plano por profissional, cada um com preço, confirmação de pagamento e tolerância próprios (G1–G5).
