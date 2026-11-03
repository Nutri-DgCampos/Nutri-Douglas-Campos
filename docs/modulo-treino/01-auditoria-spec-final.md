# Auditoria da SPEC final do Módulo de Treino (v2.0, 03/11/2026)

Resposta à Etapa 0 da `SPEC_FINAL_CONSOLIDADA.md`, feita só com leitura do código e do banco, sem alteração.

Pacote auditado: `Downloads/SPEC_FINAL_MODULO_TREINO_CLAUDE_2026-11-03`, que contém:
- a SPEC original;
- o complemento de interfaces;
- a SPEC consolidada;
- as imagens VIS-01 a VIS-05 e REL-01 a REL-07.

Base de comparação: o que está em `main` até `4623122` (T1, T7a, T2, T3 e melhorias de 01/11). As decisões anteriores do cliente (A1–J1) estão em `00-auditoria-e-plano.md`, seções 6 e 7.

## 1. Infraestrutura confirmada (não presumida)

| Item | Real no projeto |
|---|---|
| Framework | Next.js 16.3.8 (App Router, `params` como Promise), React 19.2, PrimeReact 10.9, Tailwind 4 |
| Banco | PostgreSQL em Docker, acesso por `pg` puro (`lib/servidor/banco.ts`), **sem ORM**; migrações SQL numeradas em `banco/migrations`, aplicadas pelo `deploy.sh` com `schema_migrations` |
| Autenticação | Própria: sessão por cookie e JWT (`jose`), senhas `bcryptjs`, papéis em `profiles.role` (`nutricionista`, `paciente`, `educador_fisico`) |
| Autorização | No servidor: `lib/servidor/permissoes.ts` (Nutrição) e `lib/servidor/treinoAcesso.ts` (Treino) |
| Arquivos | Disco local (`ARQUIVOS_DIR`), servidos por rota com checagem de dono (`lib/servidor/arquivos.ts`) |
| Push | `web-push` com VAPID e um `public/sw.js` só de push; fila do paciente (`notification_queue`) e fila dos profissionais (`notificacoes_profissionais`) |
| Agendador | Container `nutri-cron` chamando `/api/processar-notificacoes` a cada 60 s (já fecha as semanas do Treino) |
| PDF | `@react-pdf/renderer` (`lib/servidor/pdf/*`), com a identidade visual em Configurações → Identidade visual (uma identidade, a do nutricionista) |
| IA | OpenAI (`lib/servidor/ia.ts`), registro de uso em `ia_uso`, simulação em dev |
| Offline | **Não existe**: sem cache de páginas, sem IndexedDB, sem fila local. Só `localStorage` para preferências de tela |
| Fuso | `America/Sao_Paulo` fixo (B1); semana domingo–sábado já implementada como intervalo `[domingo, domingo seguinte)` |

## 2. Matriz por tela: elemento → existe? → onde → extensão → risco → teste

Legenda: **Existe** = pronto · **Adaptar** = existe, precisa mudar · **Criar** = não existe · **Pendente** = depende de decisão (seção 4).

### VIS-01: Painel geral do Módulo de Treino

| Elemento | Situação | Arquivo/rota | Extensão | Risco | Teste |
|---|---|---|---|---|---|
| Menu "Módulo de Treino" | Existe | `components/Navegacao.tsx`, `app/(treino)/layout.tsx` | — | — | fumaça |
| Ativar alertas neste aparelho | Existe | `components/treino/AtivarAlertas.tsx` | Mostrar o estado da permissão (concedida/negada) | Baixo | T2 |
| Relatórios semanais (pendentes, atraso) | Existe | `components/treino/PainelDeRelatorios.tsx`, `api/treino/relatorios` | Filtro por modalidade quando houver corrida e ciclismo | Baixo | T3 |
| Lista de atenção | Existe | idem, `lib/treinoRelatorio.ts` | Motivo por modalidade | Baixo | T3 + unitários |
| Relatos de desconforto | Existe | `ListaDeDesconfortos.tsx`, `lib/servidor/desconfortos.ts` | Mostrar o estado do push (pendente/enviado/falha), que já está em `notificacoes_profissionais.status` | Baixo | T2 |
| Alunos (n) e busca | Existe | `app/(treino)/treino/page.tsx`, `alunosDoProfissional` | "Com treino" por modalidade | Baixo | T2 |
| Educadores físicos | Existe | `app/(treino)/treino/educadores` | — | — | T2 |
| Contador de Notificações | Existe | `SinoDeAvisos.tsx` (sino do nutricionista) | O educador ainda não tem sino próprio | Médio | avisos1101 |

### VIS-02: Ficha de Treino do aluno

| Elemento | Situação | Arquivo/rota | Extensão | Risco | Teste |
|---|---|---|---|---|---|
| Voltar para o Módulo de Treino | Existe | `app/(treino)/treino/alunos/[id]/page.tsx` | — | — | T2 |
| Elaborar Musculação / Corrida / Ciclismo | Criar | — | 3 botões que abrem os editores (VIS-03/04/05) | — | novo |
| Acompanhamento semanal, adesão mínima, metas, pausas, relatórios | Existe | `components/treino/AcompanhamentoSemanal.tsx` | Metas por modalidade com medição automática (sessões, km, tempo) além do texto livre | Médio | T3 |
| Educadores físicos / Encerrar vínculo | Existe | mesma página | — | — | T2 |
| Estado vazio "O aluno ainda não enviou o treino" | Adaptar | mesma página | Distinguir: sem prescrição interna, sem importação, sem registros | Baixo | T2 |

### VIS-03/04/05: Editores profissionais

| Elemento | Situação | Onde se apoia | Extensão | Risco |
|---|---|---|---|---|
| Rascunho com autosave, "Salvar", "Enviar ao paciente" com versão imutável | Adaptar | Padrão do editor de dietas (`components/nutricao/editor/EditorDaDieta.tsx`: rascunho, versão salva, envio com versão) e `treino_prescricoes` (já tem `status rascunho/publicada`, trava de publicada e `origem profissional`) | Editor novo por modalidade, com o mesmo padrão e o mesmo rodapé | Médio |
| Grade da musculação (exercício, séries, reps, carga, descanso) | Criar | `PlanoDeTreino` em `lib/treino.ts` (usado pelo "Meu treino") | Repetições em **faixa** ("8–12") não existem hoje: `repeticoes` é um número. Exige acrescentar `repeticoes_max` sem quebrar o volume nem a tela do aluno | **Alto** |
| Grade de corrida e de ciclismo, cartões, totais | Criar | — | Modelo de plano por modalidade (sessões com blocos) e totais calculados das linhas (34,0 km, 230 km e 2.150 m no exemplo; TSS só com fundamento) | Médio |
| Periodização, Planilha semanal, Progressão, Zonas, Histórico, Rotas | Criar | — | Abas; zonas por FTP de Coggan (E2) e FC informada à mão (E1) | Médio |
| Importar / Importar rotina | Adaptar | Parser de musculação existente (`components/EnvioTreino.tsx`, `api/treinos/[id]/analisar`) | Reaproveitar sem duplicar; corrida e ciclismo são novos | Médio |
| Gerar novo treino, Duplicar, Salvar como modelo, Biblioteca, Modelos | Criar | Padrão das bibliotecas da Nutrição (`lib/servidor/biblioteca.ts`) | Modelos sem dados pessoais; biblioteca de exercícios inicial (C1) | Médio |
| Auxílio da IA | Adaptar | `components/nutricao/editor/AssistenteIa.tsx` | Gera rascunho, nunca publica | Médio |
| PDF / PDF detalhado | Criar | `lib/servidor/pdf/*` | Com a identidade **de quem prescreveu** (H1): o educador não tem identidade visual própria hoje | Médio |
| Arquivar | Criar | Padrão da dieta (`arquivada_em`) | Não apaga versões nem PDFs | Baixo |
| Ícones Opção, ↔, ▶, ≡, Ajustar volume | Pendente | — | Ver P1–P3 | — |
| Ver execução (vídeo) | Criar | — | Links do YouTube (C2) | Baixo |

### Registro do aluno ("Meu treino")

| Elemento | Situação | Onde | Extensão | Risco |
|---|---|---|---|---|
| Modal de musculação com 4 campos, "Anterior", situação, observação, relatar desconforto | Existe | `components/PainelTreino.tsx`, `lib/servidor/treinoRegistros.ts` | Cronômetro de descanso com vibração (C6) | Baixo |
| Registro de corrida e ciclismo (distância, tempo, ritmo, FC, RPE, potência, cadência, altimetria) | Criar | — | `treino_sessoes` serve de base; faltam colunas por modalidade | Médio |
| Tênis e bicicleta (cadastro, uso por sessão, km reais) | Criar | — | Tabelas novas; km somam só as distâncias registradas | Médio |
| Consumo intra-treino (várias entradas) | Criar | — | Tabela nova, com correção auditável | Médio |
| Offline com sincronização idempotente | Criar | Só o desconforto já tem chave idempotente (`chave_cliente`) | Fila local (IndexedDB) e sincronização; D1 disse que as academias têm sinal bom | Alto |

### REL-01/02/03: Relatório semanal do aluno

| Elemento | Situação | Onde | Extensão | Risco |
|---|---|---|---|---|
| O aluno ver o relatório consolidado | Adaptar | Hoje o aluno vê **só a devolutiva** (`components/treino/DevolutivasDoTreino.tsx`); o consolidado fica com o profissional | Tela de consulta por modalidade, sem envio nem rascunho | Médio |
| Score 0–100 | Pendente | Não existe no Treino | Sem pesos aprovados (seção 4) | — |
| Indicadores (treinos, séries, volume, tempo, distância, ritmo, FC) | Adaptar | `consolidarSemana` em `lib/servidor/treinoRelatorios.ts` | Somas com origem (prescrito/informado/medido/estimado) | Médio |
| Gasto estimado (kcal) | Pendente | A importação já gera `kcal_estimadas` pela IA, sem método documentado | Ver seção 4 | — |
| Treinos da semana, ocorrências, observações, comparativo | Existe em parte | Consolidado da T3 | Ocorrências: hoje vêm só do botão "Relatar desconforto" | Baixo |
| Ver histórico de relatórios | Criar | — | Lista das semanas do aluno | Baixo |

### REL-04: Análise e devolutiva do profissional

| Elemento | Situação | Onde | Extensão | Risco |
|---|---|---|---|---|
| Uma tela por aluno, semana e **modalidade** | Adaptar | `app/(treino)/treino/relatorios/[id]` (hoje: aluno + profissional + semana, só musculação) | Acrescentar `modalidade` ao relatório (migração aditiva) | Médio |
| Status "Pendente de devolutiva", IA, devolutiva editável, envio único e travado | Existe | T3 | Registrar a **versão** da devolutiva | Baixo |
| Evolução de cargas | Existe em parte | Histórico de cargas da T1 (`registrosParaProfissional`) | Trazer para dentro do relatório | Baixo |
| Evolução de ritmo, carga (TSS), tênis e bike, consumo | Criar | — | Depende do registro de corrida e ciclismo | Médio |
| Pontos positivos e de atenção | Criar | Padrão da Nutrição (`lib/relatorios/pontos.ts`) | Regras precisam de aprovação (seção 4) | Médio |
| Ver registros originais | Criar | — | Trilha das sessões que alimentaram o relatório | Baixo |
| Excluir relatório | Pendente | — | Recomendação: **não implementar** (seção 4) | — |

## 3. Diferenças entre a SPEC final e o que já está implantado

1. **Relatório por modalidade.** A T3 gera um relatório por aluno, profissional e semana, só de musculação. A SPEC pede um por modalidade. A migração seria aditiva: coluna `modalidade` (padrão `musculacao`) e a chave única passando a incluir a modalidade. Os relatórios existentes continuam válidos.
2. **O aluno vê o consolidado.** Hoje a API do aluno não entrega o consolidado (decisão de segurança da T3). A SPEC pede a tela REL-01/02/03. É preciso definir o que o aluno vê, por exemplo se vê a meta marcada pelo profissional e a adesão mínima.
3. **Adesão mínima.** A SPEC diz "não impor 60% global". Hoje 60% é só o valor inicial, editável por aluno (resposta B4 do cliente). Está coerente, a menos que o cliente prefira o campo vazio.
4. **Offline.** A SPEC pede offline completo. Na resposta D1, o cliente disse que os alunos treinam com sinal bom, e o offline ficou depois de corrida e ciclismo. A SPEC final não revoga isso, mas trata como obrigatório: precisa de confirmação.
5. **Reagendado.** A T3 só conta como feito quando o aluno confirma. A SPEC repete "regra aprovada para reagendamento" sem detalhar. Está pendente de confirmação desde 01/11.
6. **Alunos próprios do educador (T7b).** A SPEC fala em vínculo, contrato e isolamento entre profissionais. A T7b continua sendo a base de F1, G e H1 e não foi feita.

## 4. Ambiguidades para aprovação (não codificar antes)

Do complemento (P1–P5), com a recomendação:
- **P1, "Opção":** recomendação: alternativa por exercício (ex.: sem o aparelho, use X). O aluno vê "Opção" no modal; o profissional escolhe se publica ou não.
- **P2, ícones ↔ ▶ ≡:** recomendação: ↔ = substituir por alternativa da biblioteca; ▶ = ver execução (vídeo/instruções), só quando houver; ≡ = detalhes avançados (aquecimento, intervalos, RPE, cadência). Todos com legenda.
- **P3, "Ajustar volume" (ciclismo):** recomendação: ajuste proporcional (ex.: −10%) de distância e duração da semana, com prévia e confirmação, só no rascunho.
- **P4, equipamento:** recomendação da própria SPEC: um tênis ou uma bicicleta por sessão, cadastro livre, correção permitida, km somados só das distâncias registradas.
- **P5, horário do intra-treino:** recomendação da SPEC: aceitar horário ou tempo decorrido; nada obrigatório para concluir o treino.

Da SPEC final e desta auditoria:
- **Q1, score 0–100:** nenhuma das SPECs define os pesos. É um cálculo novo que precisa de regra aprovada (ex.: adesão X%, metas Y%, evolução Z%). Sem regra, a tela mostra "N/A".
- **Q2, gasto estimado (kcal):** precisa de método com fonte (ex.: MET do Compêndio de Atividades Físicas × peso × tempo) e aprovação. Sem isso, "Não disponível". A estimativa da IA na importação atual também fica sem método.
- **Q3, pontos positivos e de atenção:** quais regras? Recomendação: só fatos calculados (adesão abaixo do mínimo, meta marcada, desconforto, sessão não concluída, carga acima do prescrito), sem conclusões clínicas.
- **Q4, Excluir relatório:** recomendação: não implementar para o profissional. Se necessário, "arquivar" só pelo administrador, com motivo e registro, sem apagar nada.
- **Q5, aluno multimodal:** um relatório por modalidade (como a SPEC pede) e, no painel, o aluno aparece uma vez, com as modalidades pendentes. A lista de atenção conta cada modalidade separada?
- **Q6, o que o aluno vê:** o consolidado completo; e a marcação das metas e a adesão mínima?
- **Q7, repetições em faixa** ("8–12") na musculação: o aluno vê a faixa, e o volume usa qual valor (mínimo, máximo ou média)?
- **Q8, offline:** obrigatório agora, ou mantém a resposta D1 (depois de corrida e ciclismo)?
- **Q9, ordem das etapas:** a da seção 5, com a T7b primeiro.

As perguntas foram enviadas ao técnico em `Downloads/Arquivos/Perguntas para o tecnico - SPEC final do Treino 2026-11-03.md`.

## 5. Plano incremental proposto (cada etapa com migração aditiva, teste e aprovação)

| Etapa | Conteúdo | Depende de |
|---|---|---|
| **T7b** | Alunos próprios do educador: dono do cadastro, isolamento, Área do Paciente só com Treino | já aprovada (A7) |
| **T4a** | Editor de musculação (VIS-03): rascunho, versão, envio, arquivar, PDF; biblioteca inicial de exercícios; academias (C5); "Ver execução" com YouTube (C2) | P1, P2, Q7 |
| **T4b** | Registro do aluno em corrida e ciclismo, tênis, bicicleta e consumo intra-treino, no "Meu treino" atual | P4, P5 |
| **T4c** | Editores de corrida e ciclismo (VIS-04/05), zonas (E1, E2), totais calculados | P2, P3 |
| **T3b** | Relatório por modalidade, REL-01/02/03 do aluno, REL-04 completo, histórico, registros originais | Q1–Q6 |
| **T5** | Offline com fila local e sincronização idempotente | Q8 |
| **T6** | Anamnese, avaliações e PDFs por profissional; IA no editor | — |
| **T8** | Planos, contratos, pagamentos e bloqueio do Treino | G1–G5 |

Testes de regressão em toda etapa: telas principais da Nutrição (`fumaca.mjs`), T1–T3, melhorias de 01/11, testes unitários e build.

## 6. Correções dos mockups que o sistema vai respeitar

Nenhuma constante das imagens será copiada. O sistema vai respeitar estes pontos:
- semana de domingo a sábado (ex.: 01/11 a 07/11/2026, relatório no domingo 08/11);
- totais calculados das linhas:
  - musculação: 18 séries em VIS-03;
  - corrida: 34,0 km em VIS-04;
  - ciclismo: 230 km e 2.150 m em VIS-05;
- TSS só com potência e FTP;
- o mesmo score na tela do aluno e na do profissional;
- "nenhum desconforto" nunca aparece quando houver relato na semana.

## 7. Respostas do técnico (03/11/2026)

- **Q1, score 0–100:** aprovada a sugestão: 60% adesão, 25% metas e 15% evolução. Sem dado de uma parte, a tela mostra "N/A" em vez de inventar.
- **Q2, calorias:** o aluno informa as calorias e o ganho de altitude, medidos pelos equipamentos dele. O sistema não estima kcal. Sem informação, a tela mostra "Não informado". Entra na T4b como campo opcional do registro.
- **Q4, Excluir relatório:** de acordo. O botão não será implementado.
- **Q8, offline:** a maioria treina com bom sinal, mas o sinal pode cair em horário de pico na academia ou em área sem cobertura. O registro do aluno precisa funcionar sem internet e sincronizar depois (T5, na ordem aprovada).
- **Q9, ordem:** aceita como na seção 5. Começa pela T7b.
- **Sem resposta ainda:** P1–P5, Q3, Q5, Q6 e Q7. Cada uma bloqueia só a etapa indicada na seção 5. A T7b não depende delas.
- **Nova rodada (03/11/2026):** as pendentes foram reenviadas com as decisões que faltam até o fim do módulo, em `Downloads/Arquivos/Perguntas para o tecnico - Concluir o Treino 2026-11-03.md`:
  - R1: km padrão do aviso do tênis;
  - R2: percentuais de Coggan (E2);
  - R3: TSS informado pelo aluno;
  - R4: reagendado;
  - R5: o que funciona sem internet;
  - R6: anamnese do educador;
  - R7: avaliação física do educador;
  - R8: identidade dos PDFs;
  - R9: bloqueio por pagamento vencido;
  - R10: desativar ou excluir o aluno próprio.
- **Segunda resposta (03/11/2026, arquivo antigo P/Q):**
  - aprovados P2, P3, P4, P5, Q1, Q3 e Q4;
  - Q5: aprovada, e cada modalidade conta separadamente na lista de atenção;
  - Q6: o aluno vê o relatório completo e se a meta foi atingida;
  - Q7: o aluno vê a faixa, e o volume usa o **maior** valor da faixa;
  - Q8 e Q9: mantidas a ordem e o offline na T5.
- **Ainda falta (reenviado no arquivo "Concluir o Treino"):**
  - P1, sem resposta;
  - C1: a Q2 veio "aprovado", o que contradiz a primeira resposta (o aluno informa as kcal) — até confirmar, vale a primeira;
  - C2: volume realizado com as repetições registradas pelo aluno;
  - C3: o aluno vê a adesão mínima?;
  - R1–R10.
- **Terceira resposta (03/11/2026, arquivo "Concluir o Treino"):**
  - **P1:** aprovada (Opção = alternativa por exercício, o profissional decide se o aluno vê).
  - **C1:** calorias e ganho de altitude são informados pelo aluno no registro, conforme o equipamento dele. O sistema não estima.
  - **C2:** confirmado. Prescrito = maior valor da faixa; realizado = repetições registradas; sem registro = maior valor.
  - **C3:** o aluno vê a adesão mínima combinada.
  - **R1:** "concordo", mas sem o valor em km. **Falta o número** (bloqueia só o aviso do tênis, T4b).
  - **R2:** percentuais de Coggan aprovados como na tabela enviada.
  - **R3:** TSS informado pelo aluno; o sistema não calcula.
  - **R4:** o reagendado só conta se o treino for feito **na mesma semana**. Feito em outra semana, não conta em nenhuma. Continua exigindo a confirmação do aluno.
  - **R5:** offline aprovado como sugerido.
  - **R6:** anamnese do educador com as perguntas abertas sugeridas.
  - **R7:** mesmos métodos da Nutrição. Aluno compartilhado (educador + nutricionista): os dois usam **a mesma** avaliação física.
  - **R8:** PDF com nome, CREF, contato e logotipo opcional do educador.
  - **R9:** com pagamento vencido após a tolerância, fica só o histórico; sem treino novo nem registro.
  - **R10:** desativar (reversível), excluir de vez só a pedido do aluno, com confirmação; o educador só encerra a conta sem alunos ativos.
- **Últimos detalhes (03/11/2026):**
  - **R1:** aviso do tênis em 500 km, editável por aluno e por tênis.
  - **R4b:** o reagendado feito em outra semana fica no histórico, com as cargas, mas não conta na adesão de nenhuma semana. No relatório aparece "Reagendado e feito em outra semana".
  - **R7b:** na avaliação física compartilhada, os dois profissionais veem tudo, com data e autor. Cada um corrige ou apaga só o que lançou. As observações privadas continuam separadas (F3).
- **Todas as decisões do módulo estão tomadas.** Não há pergunta pendente com o técnico.
- **Publicação:** o cliente publica o módulo só quando estiver 100% pronto. As migrações 021 em diante ficam acumuladas até lá.

## 8. T7b entregue: alunos próprios do educador (03/11/2026)

Migração `026_treino_alunos_proprios.sql` (só acrescenta):
- `patients.educador_dono_id`: vazio = paciente da clínica (todos os existentes); preenchido = aluno próprio daquele educador.
- O dono não muda depois do cadastro (gatilho `proteger_dono_do_aluno`), e a conta do educador não pode ser apagada enquanto tiver alunos. Assim o aluno nunca "cai" para a clínica.
- `plan` deixa de ser obrigatório só para o aluno próprio.
- `avisar_nutricionistas` ignora os alunos próprios.

Educador:
- **Módulo de Treino › Cadastrar aluno:** nome, telefone, e-mail e senha provisória. O vínculo é criado na hora e o aluno aparece como "aluno próprio" na lista.
- **Ficha do aluno:** cartão "Cadastro do aluno", com Editar e Nova senha provisória, só para o educador dono.
- **Sem exclusão nesta etapa:** apagar um aluno envolve LGPD e histórico de treino. Fica para a T8, com regra aprovada.

Nutricionista (administrador), isolamento no servidor:
- **API genérica `/api/dados`:** pacientes e todas as tabelas da Nutrição (relatórios, ciclos, dietas, pagamentos, renovações, exames, treinos, fotos, consultas, auditoria, histórico de peso) filtram os pacientes da clínica, na leitura e na gravação. `iniciar_ciclo_dieta` recusa o aluno próprio.
- **Rotas que recebem o id do paciente:** nova consulta, exclusão, acesso, exames, formulários, link de formulários e importação de dietas devolvem 404 para o aluno próprio. O engajamento e o push personalizado deixam o aluno de fora.
- **Arquivos:** as pastas de exames, treinos e fotos do aluno próprio não abrem para o nutricionista.
- **Módulo de Treino do admin:** o aluno próprio não aparece na lista, no painel, nos registros, nos relatos de desconforto nem nos relatórios. A contagem de alunos de cada educador mostra só os da clínica. O relato do aluno avisa só o educador dono, nunca o administrador.

Aluno próprio, na Área do Paciente:
- **Telas:** só Início, Treino e Relatórios. As outras telas voltam ao início.
- **Início próprio:** Meu treino, Relatórios, envio do treino e notificações da devolutiva.
- **Relatórios:** só as devolutivas do Personal Trainer.
- **Bloqueios no servidor:** não envia relatório nutricional, renovação, comprovante, exames nem fotos.

Teste: `tests/navegacao/treinoT7b.mjs`, com 49 verificações. Regressão OK: fumaça, T1, T2, T3, melhorias, avisos, fotos, 64 testes unitários e build.

## 9. T4a entregue: editor de musculação, biblioteca, academias e modelos (03/11/2026)

Migração `027_treino_editor_musculacao.sql` (só acrescenta):
- **Programas no editor:** `treino_prescricoes` ganha `programa_id`, `titulo`, `objetivo`, `revisao`, `arquivada_em` e `importacao`. Cada programa tem:
  - um rascunho editável;
  - as versões enviadas ao aluno (1, 2, 3...), que o gatilho da migração 020 mantém imutáveis.
- **Biblioteca:** `treino_exercicios`, com a lista inicial de 70 exercícios (C1), para revisão do cliente.
- **Academias:** `treino_academias` e `treino_academia_do_aluno` (C5).
- **Modelos:** `treino_modelos`.
- **Novos tipos:** aviso `treino_novo` ao aluno e uso da IA `assistente_treino` / `importacao_treino`.

Editor (Módulo de Treino › ficha do aluno › **Elaborar Musculação**, VIS-03):
- **Abas e barra:**
  - abas por programa ("Novo treino" cria outro, sem mexer nos existentes) e arquivados à parte;
  - barra com Importar, Importar rotina, Gerar novo treino, Duplicar, Salvar como modelo, Modelos e Auxílio da IA.
- **Sessões:**
  - cada sessão tem dia, nome, mover, Opção, orientação ao aluno, copiar, colar (também entre treinos) e salvar como modelo;
  - totais calculados das linhas: séries e tonelagem só quando todas as linhas têm carga.
- **Linhas:**
  - exercício com busca na biblioteca ou texto livre;
  - séries, repetições em número ou faixa (Q7), carga e descanso;
  - **↔** troca por uma alternativa do mesmo grupo, primeiro as que a academia comporta;
  - **▶** vídeo do YouTube;
  - **≡** detalhes (P2): grupo, secundários, técnica, cadência, RPE, RIR, aquecimento, observação ao aluno, notas privadas, Opção e vídeo.
- **Opção (P1):** alternativa por exercício; o profissional marca se o aluno vê.
- **Aviso de equipamento:** quando a academia do aluno não tem o que o exercício exige. O profissional pode prescrever mesmo assim.
- **Volume semanal por grupo:** secundário = 0,5 série por padrão, ajustável na tela (SPEC, seção 6), rotulado como aproximação.
- **Rodapé:**
  - Salvar e o salvamento automático gravam só o rascunho;
  - PDF e PDF detalhado mostram a versão enviada ou, se houver alteração depois, o rascunho marcado como tal. O PDF leva a identidade de quem prescreveu (H1); o logotipo do educador entra na T6;
  - Arquivar não apaga nada e tira o treino do aluno; Reativar devolve;
  - Enviar ao paciente confere título, sessões, exercícios, séries e um dia por sessão, pede confirmação e cria a versão nova, com aviso no celular do aluno.
- **Importar:** a IA organiza o arquivo ou o texto para revisão, sem publicar. O original fica guardado (arquivo na pasta do aluno, texto no rascunho).
- **Auxílio da IA:**
  - usa só dados do Treino (objetivo, idade, sexo, academia, biblioteca e rascunho);
  - devolve a sugestão com avisos, que só entra no rascunho se o profissional aceitar;
  - entra no limite diário da IA.

Biblioteca do Treino (Módulo de Treino › **Biblioteca**):
- **Exercícios:**
  - busca, cadastro, edição, arquivamento e vídeo;
  - os da lista inicial só o administrador altera;
  - nome repetido é recusado.
- **Academias:** equipamentos marcados numa lista fixa. A academia do aluno é escolhida na ficha.

Aluno ("Meu treino"):
- **Faixa:** o modal mostra "Faixa: 8–12", e o campo começa vazio. O volume usa o que o aluno registrou ou, sem registro, o maior valor (C2).
- **O que o aluno vê:** a Opção marcada como visível, "Ver execução" e a orientação da sessão.
- **O que o aluno não recebe:** detalhes, notas privadas e a Opção oculta, filtrados no servidor (C3).

Ficha do aluno:
- **Treino vigente:** de qualquer origem, com versão, autor e data. O treino enviado pelo aluno, quando não é o vigente, fica recolhido.
- **Vazio:** quando não há treino nenhum, a ficha explica que o aluno não enviou e nenhum foi prescrito.

Fora desta etapa:
- **Estimativa de tempo da sessão:** não entra, porque exige um tempo por série que ninguém aprovou.
- **Pedido de troca de academia pelo aluno:** fica para a etapa do registro.
- **Calorias:** o card "Gasto estimado" do aluno continua mostrando só o que a importação antiga trazia. Na T4b passa a mostrar as calorias informadas pelo aluno (C1).

## 10. T4b entregue: registro de corrida e ciclismo pelo aluno (03/11/2026)

Migração `028_treino_corrida_ciclismo_registro.sql` (só acrescenta):
- `treino_sessoes.kcal`: calorias da sessão de musculação informadas pelo aluno (C1).
- `treino_equipamentos`: tênis e bicicletas do aluno (P4).
  - Quilometragem = km inicial + distâncias registradas com o equipamento.
  - Tênis com aviso de troca em 500 km por padrão (R1), alterável pelo profissional por aluno e por tênis.
  - Bicicleta sem aviso de desgaste.
- `treino_atividades`: corrida e pedal registrados pelo aluno.
  - Distância, tempo, FC média e máxima, RPE, calorias, ganho de altitude e, no pedal, potência média e normalizada, cadência e TSS do aparelho.
  - Tudo é informado; nada é estimado.
  - `chave_cliente` torna o reenvio idempotente (base do uso sem internet, T5).
- `treino_consumos`: hidratação, alimentação e suplementação durante a atividade (P5).
  - Várias entradas, com horário ou minuto de treino, sem nada obrigatório nem calculado.
  - Correções ficam registradas.

Aluno (Meu treino):
- **Musculação:** o modal do dia ganhou "Calorias do seu relógio ou app". O card "Gasto estimado" virou "Calorias informadas na semana" (musculação, corrida e pedal). A Nutrição continua vendo a estimativa antiga da importação.
- **Corrida e ciclismo:**
  - "Registrar corrida" e "Registrar pedal", com data, tênis ou bicicleta (dá para cadastrar ali mesmo), situação, números e consumo;
  - o ritmo ou a velocidade aparecem como conta do que ele informou;
  - tem observação e relato de desconforto;
  - registros desta semana e da anterior podem ser corrigidos ou apagados.
- **Meus tênis e bicicletas:** quilometragem, aviso de troca do tênis, editar, aposentar e reativar.

Profissional (ficha do aluno › registros):
- **Registros:** corridas e pedais com todos os números, consumo e observações, e as calorias de cada sessão de musculação.
- **Equipamentos:** tênis e bicicletas com quilometragem e o campo "Avisar em … km" de cada tênis.

Regras conferidas no teste `treinoT4b.mjs`:
- trocar o tênis de uma corrida move os km sem duplicar;
- o reenvio com a mesma chave atualiza, não duplica;
- data no futuro ou de semana fechada é recusada;
- um aluno não usa equipamento nem chave de outro.

Ligação com sessões prescritas de corrida e ciclismo: entra com os editores (T4c). As colunas `prescricao_id` e `sessao_indice` já existem.