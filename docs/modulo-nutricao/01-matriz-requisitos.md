# 01 — Matriz de requisitos × aplicativo atual

Levantamento feito em 19/10/2026 sobre o commit `ac67057` (branch `main`).

**Situação**

- **MANTER** — já existe e atende; o módulo apenas reutiliza.
- **COMPLETAR** — existe parcialmente; falta o que está descrito em *Lacuna*.
- **CRIAR** — não existe nada equivalente.
- **NÃO VERIFICADO** — depende de informação que o código não responde (indicado em *Lacuna*).

**Fontes**: `R` = roteiro (título da seção), `S0n` = arquivo `SPEC/0n`, `EF` = especificação funcional, `FIG-n` = figura do roteiro.

---

## 1. Base do aplicativo reutilizada

| ID | Requisito | Fonte | Situação | Evidência no código | Lacuna |
|---|---|---|---|---|---|
| BAS-01 | Cadastro único de pacientes com ID usado em todo o sistema | R: início; S01 | MANTER | tabela `patients` (`banco/init/001_estrutura.sql`) | — |
| BAS-02 | Autenticação e permissões no servidor; credenciais nunca no navegador | S01 Segurança | MANTER | `lib/servidor/sessao.ts`, `lib/servidor/permissoes.ts` (regras por tabela), chaves só no `.env` do servidor | Regras novas para cada tabela do módulo |
| BAS-03 | Armazenamento seguro de arquivos com controle de acesso | R: vários | MANTER | `lib/servidor/arquivos.ts` (buckets, `podeEnviar`/`podeBaixar`), links assinados `/api/arquivos/assinar` | Buckets novos: `documentos` (PDFs gerados), `identidade` (logo/assinatura), `orientacoes` (imagens), `bioimpedancia` |
| BAS-04 | Ciclo de 33 dias iniciado no envio da dieta | R; S01; EF §10 | MANTER | função `iniciar_ciclo_dieta`, envio em `app/(nutricionista)/dietas/page.tsx` | O envio pelo editor deve chamar o mesmo fluxo |
| BAS-05 | Ciclo de acesso/pagamento independente (30 + 15 dias) | R: comandos de envio §20 | MANTER | `atualizar_acesso_apos_pagamento`, `inativar_pacientes_vencidos` | — |
| BAS-06 | Fluxo atual de envio de dieta por upload de PDF preservado | EF §10 | MANTER | `diet_deliveries`, `diet_delivery_files`, tela Dietas | — |
| BAS-07 | Indicador de novidade só na área do paciente, some ao abrir | R: comandos de envio §21 | MANTER | `patient_update_views` (tipos `dieta`, `devolutiva`) | Novos tipos se avaliação/orientação forem publicadas ao paciente |
| BAS-08 | Push ao paciente quando houver atualização | — (já entregue) | MANTER | `lib/servidor/notificacoes.ts`, `/api/notificar-dieta` | Reutilizar no envio pelo editor |
| BAS-09 | Relatórios, pagamentos, alertas e área do paciente sem mudança de comportamento | S01 §5; S04 | MANTER | rotas e telas atuais | Testes de regressão a cada fase |
| BAS-10 | Interface para computador, tablet e celular | R: FIG-002; EF 4.1 | COMPLETAR | PrimeReact + Tailwind, layout mobile-first já usado | Editor de dietas é denso; precisa de layout próprio para telas pequenas |

## 2. Navegação, ficha e consultas

| ID | Requisito | Fonte | Situação | Evidência no código | Lacuna |
|---|---|---|---|---|---|
| NAV-01 | Acesso ao módulo pela ficha do paciente (botão no topo) | S01; EF §10 | CRIAR → **ENTREGUE (Fase 0)** | ficha em `app/(nutricionista)/pacientes/[id]/page.tsx` não tem o botão | Botão e rota do módulo |
| NAV-02 | Acesso pela tela Dietas, com o paciente já selecionado | EF §10 | CRIAR → **ENTREGUE (Fase 0)** | "Preparar dieta" abre só o upload de PDF | Segundo comando ao lado de "Preparar dieta" |
| NAV-03 | Abertura mostra painel geral do paciente, não a consulta | S01 | CRIAR → **ENTREGUE (Fase 0)** | — | Tela inicial do módulo por paciente |
| NAV-04 | Pesquisa de pacientes no módulo (sem "Novo paciente") | R: MÓDULO DE DIETAS — INTEGRAÇÃO; FIG-002 | COMPLETAR → **ENTREGUE (Fase 0)** | busca existe em `app/(nutricionista)/pacientes/page.tsx` | Reaproveitar na home do módulo |
| NAV-05 | Configurações do módulo (menu próprio) | R: FIG-004/005 | CRIAR → **ENTREGUE (Fase 0)** | — | Área "Configurações" com as bibliotecas da seção 3 |
| CAD-01 | Data de nascimento e idade calculada | R: cadastro §1 | CRIAR → **ENTREGUE (Fase 0)** | `patients` não tem nascimento | Coluna `birth_date`; idade sempre calculada |
| CAD-02 | Sexo para cálculos e PDF | R: cadastro §1; ELABORAÇÃO — IDENTIFICAÇÃO §3 | CRIAR → **ENTREGUE (Fase 0)** | ausente em `patients` | Coluna com valores definidos pelo cliente (ver pendências) |
| CAD-03 | Altura atual sincronizada com a avaliação física | R: AVALIAÇÃO FÍSICA — PESO E ALTURA §3 | CRIAR → **ENTREGUE (Fase 0)** | ausente | Coluna de altura atual + histórico na avaliação |
| CAD-04 | E-mail no cadastro igual ao do acesso | R: FIG-008/009 | COMPLETAR → **ENTREGUE (Fase 0)** | e-mail vive em `users`; editado por `/api/pacientes/[id]/acesso` | Mostrar o e-mail de acesso no cadastro; paciente sem acesso precisa de e-mail de contato |
| CAD-05 | Peso inicial × peso atual × histórico de peso | R: cadastro §3 | COMPLETAR → **ENTREGUE (Fase 0)** | `initial_weight`, `patient_progress.weight`, `patient_reports.weight` | Visão única de histórico (relatório, evolução, avaliação física) e "peso atual" derivado |
| CAD-06 | Lembrete do cadastro | S02 Dois lembretes | MANTER | `patients.important_note` | Exibir só leitura no editor |
| CON-01 | Consulta com ID, data, tipo (primeira/retorno), status, criação/atualização, nutricionista | R: FIG-010 §1; Nova consulta §3 | CRIAR → **ENTREGUE (Fase 0)** | — | Tabela de consultas |
| CON-02 | Uma consulta em andamento por paciente, garantida no banco | R: Nova consulta §2 e §9 | CRIAR → **ENTREGUE (Fase 0)** | — | Índice único parcial |
| CON-03 | Lista de consultas e resumo por consulta (dietas, avaliações, anamneses, exames, fórmulas) | R: FIG-010, FIG-015 | CRIAR → **ENTREGUE (Fase 0)** | — | — |
| CON-04 | Finalizar consulta sem publicar nada | R: Nova consulta §7 | CRIAR → **ENTREGUE (Fase 0)** | — | — |
| CON-05 | Excluir só a consulta vigente sem registros clínicos nem documentos publicados | R: FIG-014 | CRIAR → **ENTREGUE (Fase 0)** | — | Bloqueio também no banco |
| CON-06 | Auditoria de correções em consultas antigas (o quê, antes/depois, quando, quem) | R: FIG-013 §4 | CRIAR → **ENTREGUE (Fase 0)** | não há trilha de auditoria | Tabela de auditoria genérica |
| CON-07 | Consulta não altera plano, pagamento, acesso, ciclo nem relatórios | R: Nova consulta §8 | MANTER (regra) | — | Garantir por teste |

## 3. Configurações (bibliotecas)

| ID | Requisito | Fonte | Situação | Evidência no código | Lacuna |
|---|---|---|---|---|---|
| CFG-01 | Modelos de anamnese com versão, arquivamento quando usados | R: FIG-020; S02 Anamnese | CRIAR → **ENTREGUE (Fase 5)** | Configurações → Anamnese (`modelos_anamnese`, migração 013): campo curto, longo, múltipla escolha (uma ou várias), texto livre; obrigatória; versão sobe ao alterar modelo já usado; excluir só o não usado, senão arquivar | — |
| CFG-02 | Modelos de solicitação de exames | R: CONFIGURAÇÕES — MODELOS DE SOLICITAÇÃO DE EXAMES | CRIAR → **ENTREGUE (Fase 6)** | Configurações → Exames (`modelos_exames`, migração 014): listas de exames; excluir só o não usado, senão arquivar | — |
| CFG-03 | Avaliação física em Configurações | R: FIG-029 | NÃO SE APLICA | — | Roteiro descarta |
| CFG-04 | Modelos de observação da dieta | R: CONFIGURAÇÕES DA DIETA — MODELOS DE OBSERVAÇÕES | CRIAR → **ENTREGUE (Fase 3)** | — | — |
| CFG-05 | Modelos de refeição | R: MODELOS DE REFEIÇÕES | CRIAR → **ENTREGUE (Fase 3)** | — | — |
| CFG-06 | Modelos de dieta completa | R: MODELOS DE DIETAS COMPLETAS | CRIAR → **ENTREGUE (Fase 3)** | — | Sem dados pessoais no modelo |
| CFG-07 | Medicações (cadastro) | R: MEDICAÇÕES E REGISTRO DE DOSAGENS | CRIAR → **ENTREGUE (Fase 6)** | Configurações → Medicações (`medicamentos`, migração 016): nome comercial, princípio ativo, apresentação, concentração; também "Salvar na biblioteca" a partir da consulta | — |
| CFG-08 | Fórmulas (modelos e ingredientes) | R: CONFIGURAÇÕES — FÓRMULAS NUTRICIONAIS | CRIAR → **ENTREGUE (Fase 6)** | Configurações → Fórmulas (`modelos_formulas`) e Ingredientes (`ingredientes`, dosagem de referência), migração 017; modelos sem dados do paciente | — |
| CFG-09 | Orientações com texto formatado, imagens e assinatura | R: MODELOS DE ORIENTAÇÕES NUTRICIONAIS | CRIAR → **ENTREGUE (Fase 6)** | Configurações → Orientações (`modelos_orientacoes`, migração 015): blocos de título, parágrafo (negrito), lista e imagem; assinatura opcional; inclusão automática em toda consulta | — |
| CFG-10 | Logotipo, assinatura, marca-d'água, frase, identificação profissional (nome, CRN), cor das linhas | R: LOGOTIPO, ASSINATURA E MARCA-D'ÁGUA; PADRONIZAÇÃO VISUAL §2–3, §30 | CRIAR → **ENTREGUE (Fase 0)** | — | — |
| CFG-11 | Suplementos | S03 | NÃO SE APLICA (decisão 19/10: suplementos entram na dieta como alimentos) | — | Aparece na matriz da SPEC e no menu do NutriDiet, mas o roteiro trata "Suplementação" como "Medicações"; confirmar se é um cadastro separado |

## 4. Alimentos (TACO)

| ID | Requisito | Fonte | Situação | Evidência no código | Lacuna |
|---|---|---|---|---|---|
| ALI-01 | Estrutura para alimentos, categorias, nutrientes, ácidos graxos, aminoácidos, com fonte e versão | R: CADASTRO DE ALIMENTOS E INTEGRAÇÃO COM A TACO | CRIAR → **ENTREGUE (Fase 1)** | — | Etapa 1: estrutura aprovada antes da carga |
| ALI-02 | Importação dos 5 CSVs com validação e sem duplicar | R: IMPORTAÇÃO DA TACO §3 | CRIAR → **ENTREGUE (Fase 1)** | CSVs recebidos e conferidos: 597 alimentos, 15 categorias, 423 com ácidos graxos, 26 com aminoácidos; todos os valores numéricos | Etapa 2 só após aprovação |
| ALI-03 | Ausente ≠ zero | R; S02 Base de alimentos | CRIAR → **ENTREGUE (Fase 1)** | CSVs usam campo vazio para ausência | 6 alimentos sem kcal; "traços" da TACO não são distinguíveis no CSV (ver pendências) |
| ALI-04 | Cadastro manual de alimentos com origem distinta da TACO | R: TACO §4 | CRIAR → **ENTREGUE (Fase 1)** | — | — |
| ALI-05 | Medidas caseiras por alimento (singular, plural, g/mL, padrão, ordem) | R: MEDIDAS CASEIRAS | CRIAR → **ENTREGUE (Fase 1)** | — | Preenchidas aos poucos pelo nutricionista |
| ALI-06 | Substituições por alimento com quantidades e conferência de macros | R: LISTA DE SUBSTITUIÇÕES | CRIAR → **ENTREGUE (Fase 1)** | — | Regra de arredondamento aprovada (S02) |
| ALI-07 | Histórico/snapshots para não alterar dietas publicadas | S02 Base de alimentos | CRIAR → **ENTREGUE (Fase 1)** | — | Dieta publicada guarda os nutrientes usados |
| ALI-08 | Densidade para converter mL ↔ g | R: MEDIDAS CASEIRAS §7 | CRIAR → **ENTREGUE (Fase 1)** | — | Sem dado na TACO; campo opcional por alimento |
| ALI-09 | Busca sem acento, por partes do nome, rápida | R: CAMPO DE BUSCA §3, §17 | CRIAR → **ENTREGUE (Fase 1)** | — | Extensão `unaccent` ou coluna normalizada + índice trigram |

## 5. Editor de dietas

| ID | Requisito | Fonte | Situação | Evidência no código | Lacuna |
|---|---|---|---|---|---|
| DIE-01 | Várias dietas por consulta, em abas, com estado próprio | R: ABAS DE MÚLTIPLAS DIETAS; S02 | CRIAR → **ENTREGUE (Fase 2)** | — | — |
| DIE-02 | Identificação do paciente e da consulta no topo | R: IDENTIFICAÇÃO DO PACIENTE E DA CONSULTA | CRIAR → **ENTREGUE (Fase 2)** | — | Depende de CAD-01/02 |
| DIE-03 | Painel de informações do paciente; dois lembretes em estrelas, só leitura | R: PAINEL DE INFORMAÇÕES; S02 Dois lembretes | CRIAR → **ENTREGUE (Fase 2)** | — | Lembrete da anamnese entregue na Fase 5 |
| DIE-04 | Indicadores TMB/GET/GET+METs da avaliação de referência | R: INDICADORES DE GASTO ENERGÉTICO | CRIAR → **ENTREGUE (Fase 4)** | Painel do editor: avaliação finalizada escolhida (padrão: a mais recente), % da dieta sobre cada valor; a versão enviada guarda a referência | — |
| DIE-05 | Objetivo e título por dieta | R: BLOCO 1 L1 C1–C2 | CRIAR → **ENTREGUE (Fase 2)** | — | — |
| DIE-06 | Importar dieta (consultas, recordatório, outros pacientes, modelos) | R: BLOCO 1 L1 C3; S02 | CRIAR → **ENTREGUE (Fase 3)** | — | Consultas do paciente, outros pacientes e modelos; recordatório entregue na Fase 5 |
| DIE-07 | Gerar nova dieta, duplicar, salvar como modelo | R: BLOCO 1 L1 C4–C6 | CRIAR → **ENTREGUE (Fase 3)** | — | Gerar nova, duplicar e salvar como modelo |
| DIE-08 | Importar rotina (itens em cinza fora dos cálculos até confirmar) | R: BLOCO 1 L1 C7 | CRIAR → **ENTREGUE (Fase 3)** | — | — |
| DIE-09 | Refeições: adicionar, remover, nome, horário, mover, observação única | R: BLOCO 1 L2 C1–C8; S02 | CRIAR → **ENTREGUE (Fase 2)** | — | "Remover refeição" cortado no roteiro |
| DIE-10 | Opções alternativas da refeição ("OU"), com opção de referência | R: BLOCO 1 L2 C7; S02 | CRIAR → **ENTREGUE (Fase 2)** | — | — |
| DIE-11 | Copiar/colar refeição (área interna), salvar e importar modelo de refeição | R: BLOCO 1 L2 C9–C13 | CRIAR → **ENTREGUE (Fase 3)** | — | — |
| DIE-12 | Vitaminas e minerais da refeição | R: BLOCO 1 L2 C12 | CRIAR → **ENTREGUE (Fase 2)** | — | — |
| DIE-13 | KCAL/CHO/PTN/LIP por refeição e por alimento; kcal sem decimais, macros com 1 casa | R: BLOCO 1 L2 C14–C17, L3 C11–C14; S02 | CRIAR → **ENTREGUE (Fase 2)** | — | — |
| DIE-14 | Linha de alimento: busca, quantidade de medidas, medida, gramas ajustáveis, mover | R: BLOCO 1 L3 C1–C9 | CRIAR → **ENTREGUE (Fase 2)** | — | Coluna 7 não será implementada (roteiro) |
| DIE-15 | Nome exibido editável sem trocar nutrientes; trocar alimento redefine a quantidade | R: L3 C3 §9–13; S02 | COMPLETAR (regra) → **ENTREGUE (Fase 2)** | — | Comportamento exato de "redefine a quantidade" a confirmar |
| DIE-16 | Substituições por alimento em janela, listadas ao final da dieta | R: L3 C10; S02 | CRIAR → **ENTREGUE (Fase 2)** | — | Arredondamento: 1 g abaixo de 20 g; 10 g a partir de 20 g |
| DIE-17 | Observações gerais da dieta (busca de modelos, várias, ordenáveis) | R: BLOCO AO FINAL; S02 | CRIAR → **ENTREGUE (Fase 2)** | — | Observações livres; busca nos modelos com a Fase 3 |
| DIE-18 | Salvar, Apagar, Gerar PDF, Enviar ao paciente, independentes | R: COMANDOS SALVAR, APAGAR, GERAR PDF | CRIAR → **ENTREGUE (Fase 2)** | — | — |
| DIE-19 | Rascunho automático + salvar explícito; ao voltar, escolher rascunho ou última versão salva | S02 Dietas | CRIAR → **ENTREGUE (Fase 2)** | — | — |
| DIE-20 | Envio publica a dieta e inicia o ciclo de 33 dias | R; S01; EF §10 | COMPLETAR → **ENTREGUE (Fase 2)** | ciclo e entrega existem (BAS-04/06) | Envio pelo editor gera o PDF e registra a entrega pelo mesmo fluxo |
| DIE-21 | Versões publicadas imutáveis | R: vários | CRIAR → **ENTREGUE (Fase 2)** | — | — |
| DIE-22 | Indicação de conteúdo sugerido pela IA | R: AUXÍLIO DA IA §30 | CRIAR | — | — |

## 6. Painel nutricional (Bloco 2)

| ID | Requisito | Fonte | Situação | Evidência no código | Lacuna |
|---|---|---|---|---|---|
| PAI-01 | Painel lateral retrátil, largura ajustável e persistente | R: BLOCO 2; S02 | CRIAR → **ENTREGUE (Fase 2)** | — | — |
| PAI-02 | Total da dieta atual × anterior (mesmo tipo, escolha manual) | R: BLOCO 2 L1 | CRIAR → **ENTREGUE (Fase 2)** | — | — |
| PAI-03 | kcal, CHO/PTN/LIP em g e %, por kg, fibras | R: BLOCO 2 L2–L12 | CRIAR → **ENTREGUE (Fase 2)** | — | % por 4/4/9 sobre a energia registrada (S02: energia registrada é a referência) |
| PAI-04 | kcal não proteica / g de nitrogênio | S02; FIG-088 | CRIAR → **ENTREGUE (Fase 2)** | — | Fator de conversão nitrogênio/proteína a aprovar (ver 04) |
| PAI-05 | Peso de referência identificado, comum a todos os indicadores por kg | R: BLOCO 2 L6–L9 | CRIAR → **ENTREGUE (Fase 2)** | — | — |
| PAI-06 | Fibras solúveis/insolúveis | R: BLOCO 2 L11–L12 | CRIAR → **ENTREGUE (Fase 2)** | — | Sem dado na TACO: "—" até a fonte complementar (F-01) |
| PAI-07 | Vitaminas e minerais selecionados + janela "Detalhes Nutrientes" | R: VISUALIZAÇÃO DE VITAMINAS; DETALHES NUTRIENTES | CRIAR → **ENTREGUE (Fase 2)** | — | Vitaminas sem dado na TACO: "Dado não disponível" |
| PAI-08 | Hidratação mL/kg com observações | R: HIDRATAÇÃO | CRIAR → **ENTREGUE (Fase 2)** | — | — |
| PAI-09 | Sem gráficos de barras/metas | S02 | — (restrição) | — | — |

## 7. Avaliação física

| ID | Requisito | Fonte | Situação | Evidência no código | Lacuna |
|---|---|---|---|---|---|
| AVF-01 | Avaliação vinculada a paciente e consulta, rascunho, autosave, finalizar | R: SALVAMENTO AUTOMÁTICO, FINALIZAÇÃO | CRIAR → **ENTREGUE (Fase 4)** | `avaliacoes_fisicas` (migração 012); resultados congelados na finalização; reabrir para correção | — |
| AVF-02 | Peso e altura pré-preenchidos e sincronizados com o cadastro | R: PESO E ALTURA | COMPLETAR → **ENTREGUE (Fase 4)** | Peso mais recente do histórico; altura do cadastro; ao finalizar a avaliação mais recente, a altura volta ao cadastro e o peso entra em `historico_peso` | — |
| AVF-03 | TMB por protocolo + valor manual | R: PROTOCOLOS DE CÁLCULO DA TMB | CRIAR → **ENTREGUE (Fase 4)** | Harris-Benedict 1984, Mifflin, FAO 1985 (peso; peso e altura), Cunningham; manual com método e observação | — |
| AVF-04 | NAF e METs sem dupla contagem | R: NAF E GASTO POR METs | CRIAR → **ENTREGUE (Fase 4)** | DRIs 2023 por categoria; TMB × NAF (faixas FAO); METs do Compendium 2024 (60+: Older Adult, com reserva adulta sinalizada); GET + METs só na categoria Inativo | Atividades sem valor 60+ no Older Adult usam o MET adulto com aviso (confirmar com o cliente) |
| AVF-05 | Dobras cutâneas por protocolo | R: PROTOCOLOS DE DOBRAS CUTÂNEAS | CRIAR → **ENTREGUE (Fase 4)** | JP7, JP3, Faulkner, Slaughter (maturação e etnia), Petroski (feminino versão B); Siri | — |
| AVF-06 | Perimetria (9 medidas) | R: PERIMETRIA | CRIAR → **ENTREGUE (Fase 4)** | 9 regiões com o valor anterior ao lado | — |
| AVF-07 | Bioimpedância manual + PDF com leitura automática | R: BIOIMPEDÂNCIA | COMPLETAR → **ENTREGUE (Fase 4)** | `lib/servidor/bioimpedancia.ts`: leitura por IA com conferência antes de aplicar; PDF anexado | — |
| AVF-08 | Resultados: avatar com setas, avatares de % gordura, 4 gráficos (12 últimas), tabela de perimetria | R: RESULTADOS…; FIG-074–079 | CRIAR → **ENTREGUE (Fase 4)** | `components/nutricao/avaliacao/ResultadosDaAvaliacao.tsx` | — |
| AVF-09 | Faixa de referência de gordura com fonte | R: IDENTIFICAÇÃO E REFERÊNCIAS §6–9 | CRIAR → **ENTREGUE (Fase 4)** | Gallagher et al. 2000 (20–79 anos), com "?" da fonte | — |
| AVF-10 | PDF da avaliação e envio opcional ao paciente | R: SALVAMENTO … ENVIO §6–8 | CRIAR → **ENTREGUE (Fase 4)** | PDF com avatares e evolução; envio por versão (`avaliacoes_envios`, imutável), aviso no celular, tela "Avaliações físicas" na área do paciente | — |
| AVF-11 | Relação com "Registrar evolução" atual | — | CRIAR → **ENTREGUE (Fase 4)** | Botão removido da ficha; registros antigos continuam no histórico de peso | — |

## 8. Anamnese e recordatório

| ID | Requisito | Fonte | Situação | Evidência no código | Lacuna |
|---|---|---|---|---|---|
| ANA-01 | Ficha por consulta a partir de modelo, com cópia da versão | R: ANAMNESE — SELEÇÃO; ABERTURA | CRIAR → **ENTREGUE (Fase 5)** | Seção Anamnese da consulta: escolha do modelo, cópia das perguntas e da versão na ficha (`anamneses`); aviso de ficha existente do mesmo modelo | — |
| ANA-02 | Presencial e online na mesma ficha, autosave | S02 Anamnese | CRIAR → **ENTREGUE (Fase 5)** | Mesma ficha no consultório e online, salvamento automático com controle de revisão; enquanto está com o paciente, o nutricionista só lê as respostas | — |
| ANA-03 | Link individual seguro sem login, por paciente, para anamnese e recordatório | S01 Segurança; S02 | CRIAR → **ENTREGUE (Fase 5)** | Link `/formulario/<token>` por paciente: token assinado (HMAC) pelo servidor, revogável (gerar novo link), só os formulários do próprio paciente; também na área do paciente | — |
| ANA-04 | Copiar link e abrir WhatsApp com mensagem pronta | S02 | CRIAR → **ENTREGUE (Fase 5)** | Janela "Link do paciente": copiar e abrir `wa.me` com mensagem pronta | — |
| ANA-05 | Paciente edita até o 1º acesso do nutricionista; depois só leitura | S02 | CRIAR → **ENTREGUE (Fase 5)** | `lido_em`: o primeiro acesso do nutricionista após a resposta encerra a edição pelo paciente (423); respostas originais guardadas em `respostas_paciente` | — |
| ANA-06 | Observações profissionais separadas das respostas; lembrete da anamnese | S02 | CRIAR → **ENTREGUE (Fase 5)** | Observações profissionais e lembrete da anamnese na ficha; lembrete aparece na estrela do editor de dietas | — |
| ANA-07 | Avisos "Anamnese online recebida" / "Recordatório alimentar recebido" na tela Dietas pendentes | S02 Avisos | COMPLETAR → **ENTREGUE (Fase 5)** | Avisos sob o nome do paciente na tela Dietas pendentes; "Preparar dieta" marca como vistos | — |
| ANA-08 | Recordatório: refeições, horários, alimentos em texto livre, rascunho, exemplo "MODELO" | S02 Recordatório | CRIAR → **ENTREGUE (Fase 5)** | Recordatório (`recordatorios`): refeições, horários, alimento e quantidade em texto livre, observações; exemplo MODELO não salvo; rascunho e "Enviar respostas" | — |
| ANA-09 | Importar recordatório para a dieta em cinza | S02; R: ANAMNESE — ENVIO §10 | CRIAR → **ENTREGUE (Fase 5)** | Importar → Recordatório do paciente: itens em cinza com o texto do paciente, fora dos totais até escolher o alimento na base | — |
| ANA-10 | Recordatório ≠ relatório semanal | R: §8 | MANTER (regra) | `patient_reports` | — |

## 9. Exames, medicações, fórmulas, orientações

| ID | Requisito | Fonte | Situação | Evidência no código | Lacuna |
|---|---|---|---|---|---|
| EXA-01 | Exames enviados pelo paciente na ficha e na consulta | R: EXAMES — INTEGRAÇÃO | COMPLETAR → **ENTREGUE (Fase 6)** | `blood_exams` ganha nome/data do exame e vínculo opcional com consulta e solicitação (sem copiar arquivo); seção Exames da consulta e lista na ficha (recentes e mais de 90 dias) | — |
| EXA-02 | Análise por IA visível só ao nutricionista | — (já entregue) | MANTER | `lib/servidor/exames.ts` | — |
| EXA-03 | Solicitação de exames a partir de modelo, PDF, envio opcional | R: MODELOS DE SOLICITAÇÃO DE EXAMES §3–6 | CRIAR → **ENTREGUE (Fase 6)** | Solicitação por consulta (`solicitacoes_exames`): cópia ajustável do modelo, prévia em PDF, emissão congelada e envio opcional à área do paciente (Documentos) | — |
| MED-01 | Registro de medicações com receita anexa e aviso obrigatório | R: MEDICAÇÕES | CRIAR → **ENTREGUE (Fase 6)** | `medicacoes` por consulta: status Em uso/Suspenso/Não confirmado, filtros e pesquisa, trazer da consulta anterior em cinza, receitas anexadas e vinculadas (`receitas`, ZIP), anotações, aviso obrigatório | — |
| MED-02 | Calculadora auxiliar (mL × mg/mL, total semanal) | R: MEDICAÇÕES §3–5; ELABORAÇÃO — MEDICAÇÃO | CRIAR → **ENTREGUE (Fase 6)** | `lib/nutricao/medicacao.ts`: somatória semanal aprovada (M-07), sem conversões; PDF sem logotipo com o aviso (ND-193/194), emitido e guardado; copiar resumo | — |
| FOR-01 | Fórmulas por consulta: importar, nova, salvar como modelo | R: BOTÃO "FÓRMULAS" | CRIAR → **ENTREGUE (Fase 6)** | Fórmulas da consulta (`formulas`): nova, importar (modelos, consultas do paciente em cinza, outros pacientes só a estrutura), duplicar, salvar como modelo, ordem | — |
| FOR-02 | Campos: nome (autocomplete), ingredientes, dosagem/unidade, excipiente, posologia, observação | R: FÓRMULAS: CAMPOS INTERNOS | CRIAR → **ENTREGUE (Fase 6)** | Nome com sugestões, ingredientes da biblioteca (dosagem sugerida e editável), unidade, por unidade ou por dose, excipiente, apresentação, dose, posologia, orientações para farmácia e paciente, observação, dispensação (M-08) | — |
| FOR-03 | Salvar, Apagar, PDF independente | R: FÓRMULAS: COMANDOS | CRIAR → **ENTREGUE (Fase 6)** | Salvar (rascunho automático + salvar explícito), Apagar (confirmação do roteiro), PDF individual e consolidado "Manipulados" com seleção, emitidos guardados | — |
| ORI-01 | Orientação por consulta a partir de modelo, enviada ao paciente | R: MODELOS DE ORIENTAÇÕES §5–6 | CRIAR → **ENTREGUE (Fase 6)** | Orientação por consulta (`orientacoes`): cópia do modelo com {paciente}/{data_consulta}, PDF e envio à área do paciente (PDF da versão guardado) | — |

## 10. PDFs, IA e publicação

| ID | Requisito | Fonte | Situação | Evidência no código | Lacuna |
|---|---|---|---|---|---|
| PDF-01 | Gerador de PDF no servidor, A4 vertical, paginação, cabeçalho repetido, rodapé com CRN | R: PADRONIZAÇÃO … DIETA ALIMENTAR; FIG-184–186 | CRIAR → **ENTREGUE (Fase 0)** | app só armazena PDFs enviados | Biblioteca de geração a escolher na Fase 0 |
| PDF-02 | Dieta: modelo #DGteam, simples ou detalhado, observações antes das substituições | S02; FIG-184–186 | CRIAR → **ENTREGUE (Fase 2)** | — | — |
| PDF-03 | Fórmulas, medicação, avaliação física, solicitação de exames, orientações | R | CRIAR → **ENTREGUE (Fase 6)** | PDFs de fórmulas, medicações, solicitação de exames e orientações (a avaliação física veio na Fase 4) | — |
| PDF-04 | Nomes "Dieta - Nome - dd-mm-aaaa.pdf" etc. | R: COMANDOS §10–12 | CRIAR → **ENTREGUE (Fase 2)** | — | — |
| PDF-05 | PDF emitido preservado por versão | R | CRIAR → **ENTREGUE (Fase 2)** | — | — |
| IA-01 | Auxílio da IA no editor com prévia, confirmação e vínculo a alimentos da base | R: AUXÍLIO DA INTELIGÊNCIA ARTIFICIAL | CRIAR | integração OpenAI no servidor já existe (`lib/servidor/exames.ts`, `treinos.ts`) | Termo de consentimento para envio de dados de saúde |
| IA-02 | Leitura de bioimpedância e de anamnese pela IA sem dados identificáveis | R; S01 | COMPLETAR | padrão de envio de arquivo à OpenAI já usado | Minimização de dados |
| PUB-01 | Área do paciente mostra a dieta enviada (e as opções/observações) | R: COMANDOS §18; ABAS §7 | COMPLETAR → **ENTREGUE (Fase 2)** | `app/area-paciente/dietas/page.tsx` lista PDFs das 2 últimas entregas | Decidir se o paciente vê só o PDF gerado ou também uma versão em tela |

---

## Resumo

| Situação | Quantidade |
|---|---|
| MANTER | 13 |
| COMPLETAR | 12 |
| CRIAR | 88 |
| NÃO VERIFICADO | 2 |
| Não se aplica / restrição | 2 |

O que já existe e será reutilizado: cadastro de pacientes, autenticação e permissões, armazenamento de arquivos, ciclo de 33 dias, entregas de dieta, push, indicadores de novidade, envio de exames com análise por IA e a integração com a OpenAI no servidor. Todo o restante do módulo é novo.
