# Módulo de Nutrição — documentação

Especificação de trabalho do Módulo de Nutrição (consultas, alimentos TACO, editor de dietas, avaliação física, anamnese, fórmulas e PDFs), construída sobre o aplicativo Acompanhamento Nutricional que já está em produção.

| Documento | Conteúdo |
|---|---|
| [01-matriz-requisitos.md](01-matriz-requisitos.md) | Cada requisito da SPEC cruzado com o código atual: manter, completar, criar ou não verificado, com evidência. |
| [02-plano-fases.md](02-plano-fases.md) | Ordem de implementação, entregas de cada fase, dependências e critérios de aceite. |
| [03-pendencias-cliente.md](03-pendencias-cliente.md) | Trechos cortados do roteiro, dúvidas e materiais que dependem do cliente. |
| [04-metodos-cientificos.md](04-metodos-cientificos.md) | Registro dos métodos de cálculo propostos, com fonte, para aprovação expressa antes de codificar. |

## Fontes (fora do repositório)

Pacote do cliente de 19/10/2026 (`Nutricao_SPEC_Claude_2026-10-19`), lido nesta ordem:

1. `SPEC/01_INSTRUCOES_CLAUDE.md` a `SPEC/05_INDICE_HTML.md` — prevalecem sobre o roteiro onde divergem.
2. `Roteiro_Modulo_Nutricao.txt` — roteiro original com marcações `FIG-NNN` (186 figuras). Referências deste diretório no formato `R:linha` apontam para a versão compacta do roteiro (sem linhas vazias); os títulos de seção são citados por extenso para facilitar a busca.
3. `Especificacao_Funcional_Modulo_Nutricao.md` — pontos de acesso aprovados e capturas `VIS-001` a `VIS-012` do app atual.
4. `Acordos_Funcionais_Atualizados_2026-10-18.md` (dentro de `FONTES_ORIGINAIS/Acompanhamento_Nutricional_Inspecao_e_Acordos_2026-10-18.zip`) — acordos ND-166 a ND-225 sobre Fórmulas, Medicações e Auxílio da IA no editor; prevalecem sobre o roteiro nesses temas (ex.: PDF de Medicações sem logotipo, assinatura e marca-d'água, com aviso obrigatório; status Em uso/Suspenso/Não confirmado; somatória semanal; IA com comparação e aplicação seletiva).
5. CSVs da TACO: `food.csv`, `categories.csv`, `nutrients.csv`, `fatty-acids.csv`, `amino-acids.csv`.
6. HTMLs do NutriDiet — somente referência visual e de comportamento; nenhum código deles entra no projeto.

## Regras que valem para todo o módulo

- Nada é publicado automaticamente. Salvar, calcular, visualizar e gerar PDF não publicam.
- O ciclo de 33 dias começa no envio efetivo da dieta ao paciente; o ciclo de acesso/pagamento continua independente.
- Versões enviadas ao paciente são imutáveis; correções geram nova versão.
- Dado ausente é nulo, nunca zero. 1 mL não equivale a 1 g sem fator específico do alimento.
- Opções alternativas de refeição e substituições não entram nos totais da dieta.
- Cadastro único de pacientes: o módulo não cria pacientes nem duplica consultas.
- Todo cálculo clínico (avaliação física, fórmulas, suplementos, exames) só é codificado depois de aprovação expressa do método em [04-metodos-cientificos.md](04-metodos-cientificos.md).
- A IA só propõe; o nutricionista confere e aplica.
