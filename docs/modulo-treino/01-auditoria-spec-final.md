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
