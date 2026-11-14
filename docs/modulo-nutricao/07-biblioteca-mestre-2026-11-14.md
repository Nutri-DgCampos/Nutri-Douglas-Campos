# Biblioteca Mestre V3 (220 modelos): fase 1

Data: 14/11/2026. Origem: SPEC "Biblioteca Mestre V3", com 220 modelos (180 dietas e 40 treinos), e as respostas do nutricionista de 14/11.

## 1. Auditoria (só leitura)

**Modelos de dieta** ficam em `modelos_nutricao` (observação, refeição ou dieta completa). O conteúdo segue o mesmo formato do editor de dietas, e todos os nutricionistas da clínica veem a biblioteca. Antes desta fase não havia:
- código estável;
- estado bloqueado;
- campo de orientações ao nutricionista separado das observações que vão ao paciente.

**Modelos de treino** ficam em `treino_modelos`:
- modalidade musculação, corrida ou ciclismo;
- privados ou compartilhados;
- o plano é copiado ao criar o programa do aluno;
- musculação já tem `observacoes` gerais, que o aluno vê; corrida e ciclismo não têm.

**Produção** (consulta só de leitura em 14/11):
- os quatro modelos protegidos existem, cadastrados à mão, com o código no início do nome: EMG-001 e FIS-BIK-007, 008 e 009;
- há 2 observações, 11 refeições e 2 treinos dos profissionais;
- há 27 alimentos cadastrados pelo nutricionista, entre eles goma de mandioca, filé de tilápia grelhada, geleia de frutas e macarrão cozido.

**Alimentos:**
- Os ids da TACO são diferentes entre a produção e a base local. Por isso os arquivos dos modelos guardam o código TACO (`codigo_origem`), e cada base resolve o id na importação.
- Os alimentos cadastrados pelo nutricionista foram copiados para a base local com o mesmo id da produção (alimentos, nutrientes e medidas).
- Nenhum dado de paciente foi copiado.

**Ambiente isolado:** a base local (Docker `nutri-postgres`) serve de homologação. Nada foi gravado na produção.

## 2. Decisões do nutricionista (14/11)

| # | Decisão |
|---|---|
| 1 | **Opção b**: poucos cardápios-base com as gramas ajustadas por objetivo (aproveita o material antigo) |
| 2 | MUL-005 a MUL-009 são de gestação e lactação e ficam bloqueados até a revisão |
| 3 | FIS-BIK-007 = 2.100 kcal, FIS-BIK-008 = 2.300 kcal, FIS-BIK-009 = 2.000 kcal |
| 4 | Clínicos, gestação e bariátricos ficam bloqueados até a revisão individual |
| 5 | Arroz branco → "Arroz, tipo 1, cozido"; pão de forma branco → "Pão, trigo, francês"; ovo mexido → ovo inteiro cozido; tapioca → "Goma de mandioca, assada" (cadastro dele); bebida vegetal → "Soja, extrato solúvel, natural, fluido"; tilápia, geleia e macarrão cozido: cadastros dele |
| 6 | Levantamento terra romeno → "Stiff com barra"; cadastrar "Puxada neutra" e "Flexão de braços inclinada"; supino com halteres → "Supino reto com halteres" |

As trocas estão em `banco/biblioteca/decisoes.json`.

## 3. O que mudou no sistema

**Migração 038** (`banco/migrations/038_biblioteca_mestre.sql`), só aditiva:
- `modelos_nutricao` ganha:
  - `codigo`, único quando preenchido;
  - `situacao`, liberado ou bloqueado; os modelos atuais ficam liberados;
  - `orientacoes_profissional`;
  - `biblioteca`, com os dados de auditoria;
  - `liberado_em` e `liberado_por`.
- `treino_modelos` ganha `codigo`, `orientacoes_profissional` e `biblioteca`.
- Entram os dois exercícios novos na lista base.

**Servidor:**
- Modelo bloqueado não é usado. A importação para dieta é recusada com o código 409, e o uso de refeição ou observação também é recusado.
- Só o nutricionista libera um modelo bloqueado, com `PATCH { acao: "liberar" }`, que registra quem liberou e quando.
- As orientações ao profissional ficam só no modelo e nunca são copiadas para a dieta ou o treino.

**Telas:**
- A biblioteca de dietas mostra a etiqueta "Bloqueado até revisão".
- O editor do modelo tem o campo "Orientações ao nutricionista" e, quando o modelo está bloqueado, um aviso com o botão "Liberar para uso".
- Na janela "Importar", os modelos bloqueados aparecem desabilitados.
- No Treino, a janela "Usar modelo" mostra o código e o botão "Orientações ao educador".

## 4. Ferramentas da biblioteca

Todo o conteúdo fica em `banco/biblioteca/`, versionado no git:
- `catalogo.csv`: o catálogo oficial da V3;
- `controle.json`: o progresso de cada código;
- `decisoes.json`: as trocas aprovadas;
- `orientacoes/<FAMÍLIA>.json`: as orientações por categoria, com referências reais;
- `modelos/<CÓDIGO>.json`: um arquivo por modelo, no formato intermediário.

```
# 1. Converter o material antigo (fora do repositório) para o formato intermediário
python -I -X utf8 scripts/biblioteca/converter.py <pasta-dos-json-antigos> EMG-003 EMG-004 ...

# 2. Ajustar as gramas à meta de energia (fator único, arredondamento de 5 g)
node scripts/biblioteca/biblioteca.mjs ajustar EMG-003 EMG-004

# 3. Validar com as funções do próprio aplicativo
node scripts/biblioteca/biblioteca.mjs validar EMG-003 EMG-004     # --notas mostra lacunas da TACO

# 4. Importar na base local: uma transação por modelo, nunca sobrescreve
node scripts/biblioteca/biblioteca.mjs importar EMG-003 EMG-004 --autor <e-mail dono dos treinos>

# Reverter: só apaga modelo nunca usado
node scripts/biblioteca/biblioteca.mjs reverter EMG-003
```

**Proteções da ferramenta:**
- Recusa qualquer banco que não seja local. Só funciona fora dele com `--producao` e `BIBLIOTECA_PRODUCAO=CONFIRMO`, depois da autorização expressa do cliente.
- Não gera nem importa os quatro modelos protegidos.
- O catálogo decide o bloqueio: um modelo que o catálogo bloqueia não entra liberado.

**O que o validador confere:**
- **Dietas:**
  - alimentos existentes e não arquivados, com gramas maiores que zero;
  - refeições sem horário;
  - as duas orientações (ao paciente e ao nutricionista);
  - energia calculada contra a meta nominal: desvio acima de 10% gera aviso;
  - termos de risco nos modelos de fisiculturismo.
- **Musculação:**
  - exercícios da lista base;
  - séries positivas e faixa de repetições em ordem;
  - carga em branco;
  - um dia por sessão.
- **Corrida e ciclismo:**
  - número de semanas igual à duração do programa;
  - soma dos blocos igual ao tempo da sessão;
  - zonas Z1 a Z5;
  - nenhuma métrica absoluta preenchida.

## 5. Pilotos (os quatro testes da SPEC)

| Código | Resultado na base local |
|---|---|
| EMG-002 | ajustado com fator 0,859: 1.501 kcal para a meta de 1.500; 98,5 g de proteína, 192 g de carboidrato, 39,5 g de lipídio, 18,3 g de fibras |
| MUS-002 | 4 sessões, 22 exercícios e 44 séries, sem carga |
| COR-001 | 8 semanas, 24 sessões e 775 min; blocos conferidos |
| CIC-001 | 4 semanas, 12 sessões e 650 min; blocos conferidos |

**Idempotência:** a segunda importação pulou os quatro modelos, sem sobrescrever. **Reversão:** removeu os quatro, e a reimportação seguinte entrou limpa.

**Testes:**
- teste de navegação `tests/navegacao/biblioteca1114.mjs`: 27 itens OK;
- 135 testes unitários;
- regressão sem falhas: treinoT2, T4a, T4c, T6, fumaça, melhorias1101 e cadastroAnamnese1110.

## 6. Pendências e pontos de atenção

1. **Pão de forma branco.** O nutricionista escolheu o pão francês, mas também cadastrou "pão de forma branco tradicional" na produção. Vale confirmar com ele qual dos dois usar.
2. **Orientações ao aluno em corrida e ciclismo.** O plano dessas modalidades não tem observações gerais. Por enquanto, as orientações ao aluno vão junto das orientações ao educador, com a indicação "Para repassar ao aluno". Para que cheguem ao aluno direto, seria preciso um campo próprio no editor de endurance, o que é uma proposta de mudança de tela.
3. **Modelos bloqueados** (5 bariátricos, 5 clínicos e MUL-005 a 009). A V3 pede rascunhos novos e específicos, sem reaproveitar o cardápio antigo. Os bariátricos não podem ter cardápio completo sem um protocolo validado.
4. **FIS-BIK-007 a 009:** conferir as calorias dos cadastros manuais da produção contra as decididas (2.100, 2.300 e 2.000) antes de qualquer ajuste. Nada é alterado automaticamente.
5. **Implantação:** a migração 038 entra pelo `deploy.sh`. A carga dos modelos na produção depende de autorização expressa do cliente.

## 7. Andamento

| Fase | % da fase | Situação |
|---|---|---|
| 1. Infraestrutura, importador, validador e pilotos | 100% | concluída |
| 2. Dietas liberadas (cerca de 160: orientações por família, conversão, ajuste e validação) | 1% | EMG-002 feito |
| 3. Treinos restantes (36) | 8% | 3 de 39 feitos |
| 4. Bloqueados: rascunhos específicos (15) | 0% | — |
| 5. Relatório final e pedido de autorização para a produção | 0% | — |

**Módulo Biblioteca Mestre: cerca de 20%.** A infraestrutura pesa mais que o volume de conteúdo, que agora corre por script.
