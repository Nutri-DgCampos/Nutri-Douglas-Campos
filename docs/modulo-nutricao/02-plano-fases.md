# 02 — Plano de implementação por fases

Cada fase é entregue, testada (fluxos novos + regressão dos existentes) e aprovada antes da seguinte. Mudanças no banco vão por migrations numeradas em `banco/migrations/`, aplicadas pelo `deploy.sh`, com backup automático antes.

Os IDs entre colchetes remetem à [matriz](01-matriz-requisitos.md).

## Andamento

Percentual por requisito da matriz que exige trabalho (COMPLETAR + CRIAR = 101). Requisitos têm tamanhos diferentes: o editor de dietas (fases 2 e 3) concentra a maior parte do esforço.

| Fase | Situação | Entregue em | Requisitos |
|---|---|---|---|
| 0 — Fundação | **Concluída** (39 verificações automáticas) | 20/10/2026 | 18 |
| 1 — Base de alimentos | **Concluída e aprovada** (19 verificações + 9 testes de cálculo); TACO carregada na produção em 20/10/2026 (597 alimentos, 20.165 valores). Pendente: correspondências USDA (F-01) | 20/10/2026 | 9 |
| 2 — Editor de dietas | **Concluída e aprovada** (53 verificações de navegação + 16 testes de cálculo); no ar desde 20/10/2026 | 20/10/2026 | 28 |
| 3 — Modelos e importações | **Concluída** (40 verificações de navegação + 19 testes de cálculo; Fase 2 retestada); aguardando aprovação do cliente | 20/10/2026 | 7 |
| 4 — Avaliação física | **Concluída** (42 verificações de navegação + testes de cálculo com os exemplos aprovados; fases 0–3 retestadas); aguardando aprovação do cliente | 20/10/2026 | 12 |
| 5 — Anamnese e recordatório | Não iniciada | — | — |
| 6 — Exames, medicações, fórmulas, orientações | Não iniciada | — | — |
| 7 — Auxílio da IA | Não iniciada | — | — |
| **Módulo** | **74 de 101 requisitos (73%)** | | |

## Fase 0 — Fundação

**Objetivo:** dar ao módulo a estrutura de que todas as outras fases dependem, sem tocar no que já funciona.

- Cadastro: data de nascimento, sexo, altura atual; idade calculada; e-mail de acesso visível no cadastro [CAD-01 a CAD-04].
- Histórico de peso unificado (leitura): peso inicial, evoluções, relatórios e, depois, avaliações físicas; "peso atual" derivado [CAD-05].
- Consultas: criar, listar, abrir, finalizar, excluir a vigente; uma em andamento por paciente garantida no banco [CON-01 a CON-07].
- Trilha de auditoria para correções em registros clínicos [CON-06].
- Entrada do módulo: botão no topo da ficha e comando na tela Dietas; painel geral do paciente [NAV-01 a NAV-04].
- Configurações: estrutura do menu e identidade visual (logo, assinatura, marca-d'água, frase, nome e CRN, cor das linhas) [NAV-05, CFG-10].
- Motor de PDF no servidor com o cabeçalho e o rodapé do modelo #DGteam, testado com um documento simples [PDF-01].

**Aceite:** paciente existente abre o módulo pelos dois pontos de acesso; consulta criada não altera plano, pagamento, acesso nem ciclo; segunda consulta em andamento é recusada mesmo com cliques simultâneos; regressão de relatórios, pagamentos, alertas e área do paciente sem diferenças.

## Fase 1 — Base de alimentos

1. **Etapa 1 (estrutura):** tabelas de categorias, alimentos (origem TACO ou manual, versão da fonte), nutrientes, ácidos graxos, aminoácidos, medidas caseiras, substituições, densidade opcional [ALI-01, ALI-05, ALI-06, ALI-08]. Apresentada para aprovação antes da carga.
2. **Etapa 2 (carga):** script de importação dos 5 CSVs com relatório de validação (contagens, chaves, vazios, unidades); vazio → nulo [ALI-02, ALI-03].
3. Tela de alimentos em Configurações: busca sem acento, cadastro manual, medidas caseiras (+/−, subir/descer, padrão), substituições com conferência de kcal e macros [ALI-04 a ALI-09].
4. Módulo central de cálculo nutricional (`lib/nutricao/`), com testes numéricos: porção por 100 g, medidas caseiras, ausente ≠ zero, totais parciais sinalizados.

**Carga na produção (só depois da aprovação do nutricionista):** o `deploy.sh` aplica a migration 008 (estrutura vazia). A carga é separada: `node scripts/importar-taco.mjs <pasta dos 5 CSVs> <planilha oficial .xlsx> > banco/importacao/taco.sql`, enviar o arquivo à VPS e rodar `docker exec -i nutri-postgres psql -v ON_ERROR_STOP=1 -U nutri -d nutri < /tmp/taco.sql`. Pode rodar de novo sem duplicar.

**Aceite:** 597 alimentos importados, contagens batendo com os CSVs; um alimento com nutriente ausente aparece como "Dado não disponível"; medida caseira de 25 g × 2 = 50 g reflete nos nutrientes; nenhum valor ausente vira zero.

## Fase 2 — Editor de dietas (núcleo)

- Dietas em abas por consulta; objetivo, título; refeições (adicionar, remover, nome, horário, mover, observação única); opções "OU" com opção de referência; linhas de alimento completas; indicadores por alimento e refeição [DIE-01 a DIE-05, DIE-09, DIE-10, DIE-13 a DIE-15].
- Substituições em janela e listadas ao final; arredondamento aprovado [DIE-16].
- Observações gerais da dieta [DIE-17]; hidratação [PAI-08].
- Painel lateral: atual × anterior, g/%/por kg, kcal não proteica/gN (fator 6,25 aprovado, M-06), fibras, vitaminas e minerais, Detalhes Nutrientes [PAI-01 a PAI-07].
- Lembretes nas duas estrelas [DIE-03, CAD-06].
- Rascunho automático, Salvar, escolha entre rascunho e última versão; Apagar rascunho [DIE-18, DIE-19].
- PDF da dieta (simples e detalhado) [PDF-02, PDF-04].
- Enviar ao paciente: versão imutável, PDF gerado vira a entrega de dieta pelo fluxo atual, ciclo de 33 dias, indicador de novidade e push [DIE-20, DIE-21, PDF-05, PUB-01].

**Aceite:** dieta com 6 refeições e opções alternativas tem totais iguais à soma só das opções de referência; salvar e gerar PDF não publicam; enviar publica uma única vez mesmo com cliques repetidos, inicia o ciclo e aparece na área do paciente; envio por upload de PDF continua funcionando.

**Entregue (20/10/2026)** — migration `009_editor_de_dietas.sql`:

- Abas por consulta (Consulta → Dietas → "Elaborar dietas"); cada dieta tem objetivo, título, refeições, opções, observações, hidratação e peso de referência próprios.
- Conteúdo em três estados: rascunho gravado automaticamente (1,2 s após cada alteração), última versão salva (botão Salvar) e versões enviadas, imutáveis no banco, com a composição dos alimentos congelada. Ao reabrir com rascunho diferente do salvo, o editor pergunta qual usar. Duas janelas editando a mesma dieta: a segunda gravação é recusada (sem sobrescrever).
- Linha de alimento: busca na base, nome exibido editável (nutrientes continuam os do alimento da base), medida padrão pré-selecionada, nº de medidas × medida = g/mL, ajuste manual sinalizado e reversível, troca de alimento zera a quantidade (B.3).
- Substituições em janela: quantidade só por ação do nutricionista (botões "Proporcional ao cadastro" e "Mesma energia", ou digitação), com diferença de kcal e macros; substituto sem quantidade não sai para o paciente.
- Painel lateral retrátil e com largura ajustável: atual × anterior (escolha manual), g/%/por kg, kcal não proteica/gN (6,25), fibras, vitaminas e minerais escolhidos em "Detalhes Nutrientes", hidratação mL/kg. No celular, o painel fica abaixo do editor.
- PDF: modelo "simples" (prescrição) e "detalhado" (acrescenta kcal e macros por opção e o total da dieta). Gerar PDF não publica.
- Enviar ao paciente: confere pendências; o nutricionista escolhe "novo ciclo de 33 dias" ou "manter o ciclo atual" (sugerido quando outra dieta da mesma consulta já foi enviada no ciclo). Tudo numa transação: entrega com o PDF (mesmo registro do upload), ciclo, versão e auditoria; o aviso no celular sai depois. Cliques repetidos não duplicam.
- Apagar só dieta nunca enviada; enviada é arquivada (sai das abas, histórico mantido). Consulta com dietas não pode ser excluída.
- Área do paciente: as dietas do ciclo da entrega mais recente aparecem em tela (abas, opções, trocas, observações, hidratação), além do PDF. Lembretes nunca aparecem.
- Ficam para outras fases: indicadores TMB/GET (DIE-04, Fase 4), lembrete da anamnese (Fase 5), busca nos modelos de observação, importações, duplicar e modelos (Fase 3), IA (Fase 7).

## Fase 3 — Modelos e importações

Modelos de observação, refeição e dieta [CFG-04 a CFG-06]; gerar nova, duplicar, salvar como modelo [DIE-07]; importar dieta das quatro origens [DIE-06]; importar rotina em cinza [DIE-08]; copiar/colar e modelos de refeição [DIE-11, DIE-12].

**Aceite:** importar de outro paciente não leva dados pessoais; modelo editado não altera dietas já criadas a partir dele; itens em cinza não entram nos totais.

**Entregue (20/10/2026)** — migration `010_modelos_de_dieta.sql`:

- Configurações → Dieta: três bibliotecas (observações, modelos de refeição, modelos de dieta), com busca, edição no mesmo editor das dietas, excluir (nunca usado) ou arquivar (já usado). Arquivado sai das buscas.
- Usar um modelo copia o conteúdo com identificadores novos: editar o modelo depois não muda as dietas, e editar a dieta não muda o modelo. Modelos não guardam o peso do paciente.
- No editor da dieta: Importar (consultas do paciente, outros pacientes, modelos salvos; o recordatório aparece como "chega com a Fase 5"), Importar rotina, Gerar nova dieta, Duplicar e Salvar como modelo. Quando a dieta aberta já tem conteúdo, a importação pergunta se cria uma nova dieta (padrão) ou substitui; nada é sobrescrito sem escolha. Título e objetivo da origem só entram quando preenchidos.
- Importar rotina: refeições, horários, alimentos, quantidades e substituições de uma dieta anterior do mesmo paciente, com os alimentos em cinza — fora dos totais, do PDF e da área do paciente até "Confirmar na dieta". Observações e hidratação não vêm.
- Por refeição: copiar, colar (área de transferência interna, vale entre dietas e pacientes na sessão), salvar como modelo e importar modelo. Colar e importar modelo perguntam "Adicionar como nova opção" ou "Substituir conteúdo" quando o destino tem conteúdo; nome e horário do destino ficam, salvo escolha.
- Observações da dieta: busca nos modelos pelo título; a mesma observação não entra duas vezes; o texto copiado pode ser ajustado só naquela dieta.
- Cada dieta registra a origem (duplicação, importação, modelo, rotina) na coluna `dietas.origens` e na auditoria.

## Fase 4 — Avaliação física

Formulário com autosave, peso/altura sincronizados [AVF-01, AVF-02]; substitui o "Registrar evolução" [AVF-11]; perimetria [AVF-06]; bioimpedância manual e por PDF [AVF-07]; TMB, NAF/METs, dobras e faixas de referência **somente com métodos aprovados** [AVF-03 a AVF-05, AVF-09]; tela de resultados [AVF-08]; PDF e envio [AVF-10]; indicadores no editor [DIE-04].

**Aceite:** cada equação com teste numérico contra exemplo da fonte aprovada; avaliação histórica não muda quando o cadastro muda; ausência de medida aparece como "—".

## Fase 5 — Anamnese e recordatório

Modelos versionados [CFG-01]; ficha presencial/online única [ANA-01, ANA-02, ANA-06]; link seguro sem login e WhatsApp [ANA-03, ANA-04]; bloqueio após o primeiro acesso do nutricionista [ANA-05]; avisos na tela Dietas [ANA-07]; recordatório e importação em cinza [ANA-08, ANA-09].

**Aceite:** link de um paciente não dá acesso a outro; respostas sincronizam sem importação manual; edição simultânea não sobrescreve.

## Fase 6 — Exames, medicações, fórmulas, orientações

Exames na ficha e na consulta [EXA-01]; solicitação de exames [CFG-02, EXA-03]; medicações e calculadora (M-07 aprovado) [CFG-07, MED-01, MED-02]; fórmulas [CFG-08, FOR-01 a FOR-03]; orientações [CFG-09, ORI-01]; PDFs correspondentes [PDF-03].

## Fase 7 — Auxílio da IA

Assistente no editor com saída estruturada, vínculo a alimentos da base, prévia e confirmação [IA-01, DIE-22]; leitura de bioimpedância e anamnese [IA-02]. Pré-requisito: termo de consentimento para envio de dados de saúde à OpenAI.

## Dependências entre fases

```
Fase 0 ─┬─ Fase 1 ── Fase 2 ── Fase 3
        │                └──── Fase 7
        ├─ Fase 4 (indicadores entram no editor da Fase 2)
        ├─ Fase 5 (importação do recordatório usa o editor da Fase 2)
        └─ Fase 6
```

As fases 4, 5 e 6 podem andar em paralelo com as fases 2 e 3 depois da Fase 0, desde que os métodos científicos já estejam aprovados.
