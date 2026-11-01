# Melhorias 01/11/2026 (SPEC "Quatro melhorias")

Resposta à `SPEC_Novas_Melhorias_Claude.md` v1.0. Auditoria feita no código e no banco reais antes de cada etapa.

## Andamento

| Item | Situação | Commit | Migração | Teste |
|---|---|---|---|---|
| 1. Copiar alimento da TACO | Entregue | `2037472` | 022 | `tests/navegacao/melhorias1101.mjs` (22) |
| 2. Avisos ao nutricionista (sino + push) | Entregue | `2042303` | 023 | `tests/navegacao/avisos1101.mjs` (30) |
| 3. Fotos no link + sobreposição | Entregue | `21314b9` | 024 | `tests/navegacao/fotos1101.mjs` (26) |
| 4. Rotulagem nutricional | Planejada, aguardando referências oficiais (seção 4) | — | — | — |

As migrações só acrescentam e trazem a reversão no cabeçalho. Regressão: telas principais (21), Treino T1 (22) e T2 (40), 58 testes unitários e build.

## 1. Copiar alimento da TACO

**O que já existia:**
- a base de alimentos guarda a fonte de cada valor (`alimentos_nutrientes.fonte`);
- ausente = sem linha, nunca zero;
- traço = `traco` sem valor;
- arquivamento lógico (`alimentos.arquivado`);
- as dietas **enviadas** guardam a composição congelada (`dietas_versoes`), e os PDFs também.

**Como ficou:**
- O botão "Copiar alimento" fica ao lado do nome, como na imagem 03. Ele abre o formulário preenchido, com "(Cópia)" no nome, e nada é gravado até "Salvar cópia". "Cancelar" volta ao original.
- A cópia é um alimento próprio (`fonte = 'manual'`) com `copiado_de` apontando o original. Ela leva todos os valores (traço continua traço, ausente continua ausente), as medidas caseiras e as substituições.
- Selo de cada valor:
  - igual ao original (mesma unidade, valor exato em `numeric(12,4)`) = "TACO";
  - alterado ou preenchido = "Personalizado".
- A fonte é recalculada e gravada a cada salvamento. Restaurar o valor volta a "TACO".
- O original da TACO nunca é alterado, o que o teste confirma.
- "Excluir" a cópia = o botão "Arquivar" que já existia: o alimento some das buscas e as dietas antigas continuam.

**Divergência:** dietas em rascunho, ou salvas e ainda não enviadas, calculam com a composição atual dos alimentos. Isso já valia para todos os alimentos antes desta melhoria. O congelamento acontece no envio ao paciente, e com ele ficam preservados as dietas enviadas e os PDFs. Mantivemos assim.

## 2. Avisos ao nutricionista

**O que já existia:**
- push só para pacientes;
- a fila própria dos profissionais, criada no Módulo de Treino (T2, migração 021);
- a tela "Alertas", que lê as renovações direto da tabela, sem eventos.

**Como ficou:**
- **Origem dos avisos:** gatilhos no banco, na mesma transação do envio do paciente (outbox):
  - anamnese: quando `respondido_em` é gravado pelo paciente;
  - relatório: quando o relatório é gravado;
  - exames: por lote;
  - renovação: quando a solicitação é gravada.
  Se o envio foi gravado, o aviso existe, com ou sem push.
- **Destinatários:** um aviso por conta de nutricionista. Cada conta tem a própria leitura, sincronizada entre os aparelhos dela.
- **Contra duplicidade:** cada aviso tem uma chave (`dedup_key`). Regravar a anamnese sem novo envio não gera outro aviso.
- **Exames:** o paciente pode anexar vários arquivos de uma vez. Um lote gera um aviso só ("Enviou 3 exames."), e o push espera cerca de 20 s pelo fim do lote.
- **Texto:** o nome completo do paciente e o tipo do evento, nada clínico.
- **Sino:**
  - fica no menu lateral no computador e na barra superior no celular, com contador;
  - abrir o sino não marca nada como lido.
- **Clique em um aviso:** vai para `/avisos/[id]`, que exige login (e volta ao aviso depois), marca só aquele aviso e abre o conteúdo:
  - anamnese → a anamnese específica;
  - relatório → o relatório;
  - exames → os exames do paciente;
  - renovação → a seção Renovações de Alertas.
- **Configurações → Notificações:**
  - "Ativar alertas neste aparelho" (a permissão só é pedida no clique);
  - lista de aparelhos, com pausar e remover. Isso não apaga o histórico.
- **Push:** o mesmo provedor e as mesmas chaves VAPID, pela fila dos profissionais. O envio é imediato, e o agendador (a cada 60 s) envia o que ficar pendente.

**Limites técnicos:**
- Cada nutricionista precisa ativar o push em cada aparelho.
- No iPhone, o push só funciona com o app instalado na tela inicial (iOS 16.4 ou mais novo).
- A entrega depende do navegador e do sistema. Sem push, tudo continua no sino.

## 3. Fotos corporais no link + sobreposição

**O que já existia:**
- `fotos_evolucao`: uma foto por posição e por dia, usada pelo Comparativo de fotos e pela Área do Paciente;
- o limite de 10 MB para JPG, PNG e WEBP;
- `patients.sex`;
- as silhuetas da avaliação física: frente e costas na mesma imagem, **sem vista lateral**.

**Como ficou:**
- **Seção "Fotos Corporais" no link de anamnese e recordatório:**
  - posições Frente, Lateral e Costas, todas opcionais;
  - avatares de frente, lado e costas conforme o sexo do cadastro, recortados dos modelos aprovados (imagens 07 e 08) com fundo transparente, em `public/nutricao/avatares/fotos-corporais/`. Sem sexo, nenhum avatar é presumido e aparece um aviso neutro;
  - o servidor confere o tipo real do arquivo, pelos primeiros bytes, e o tamanho;
  - uma posição já enviada no dia não é substituída: o paciente exclui e envia de novo;
  - pelo link, o paciente vê e exclui só as fotos de hoje, porque o link não tem login e não deve expor o histórico.
- **Destino das fotos:** a mesma tabela do Comparativo (sem segunda galeria), na data do envio.
- **Ligação ao ciclo** (`ciclo_id`):
  - cada foto fica ligada ao ciclo que contém a data;
  - as fotos de antes do 1º ciclo vão para o 1º ciclo quando ele começa, mantendo a data;
  - uma foto entre dois ciclos fica sem ciclo (pendente), sem vínculo inventado;
  - nada altera início ou fim dos 33 dias, o que o teste confirma.
- **Comparativo:** mostra o número do ciclo junto da data.
- **Sobreposição:**
  - abre arrastando uma foto sobre a outra, ou pelo botão "Sobrepor as duas fotos", que funciona no celular;
  - controles: transparência, ajustar a foto de cima ou a de baixo, arrastar com mouse ou dedo, zoom, setas de alinhamento fino, trocar a ordem e reiniciar;
  - nada é salvo (opção B), e as fotos originais não mudam.

**Para o cliente:**
1. **Avatares:** vieram dos modelos 07 e 08, em resolução de tela (cerca de 190 × 530 px). Se houver os arquivos originais em resolução maior, basta substituir mantendo os nomes.
2. **Área do Paciente:** a tela "Fotos" continua com o comportamento anterior: uma nova foto no mesmo dia e posição substitui a anterior. O link não substitui, como pede a SPEC. Quer que a Área do Paciente passe a não substituir também?

## 4. Rotulagem nutricional: plano e pré-requisitos

A SPEC pede para verificar as normas da ANVISA vigentes e proíbe inventar limites, arredondamentos, porções ou alegações. Antes de programar, precisamos dos textos oficiais e de três decisões do cliente.

**Referências a obter (texto oficial e consolidado):**
- RDC 429/2020 e IN 75/2020, com as alterações posteriores. Delas saem:
  - valores diários de referência (%VD);
  - porções por grupo de alimentos;
  - regras de arredondamento e de "não significativo";
  - limites da lupa (açúcares adicionados, gorduras saturadas, sódio, sólido × líquido);
  - modelo gráfico, dimensões e fontes da tabela e da lupa;
  - exceções e dispensas.
- Normas de lista de ingredientes, alergênicos (RDC 727/2022) e glúten (Lei 10.674/2003).

Posso baixar os PDFs no portal da ANVISA, ou o cliente envia os arquivos que usa. Preciso da sua autorização para baixar.

**Decisões do cliente:**
1. **Açúcares adicionados:** a TACO não traz açúcares totais nem adicionados. Proposta: marcar no cadastro os ingredientes que são açúcar adicionado (açúcar, mel, xaropes etc.) e informar os açúcares totais quando houver fonte. Sem esses dados, a lupa de açúcar fica "verificação pendente".
2. **Cálculo pelo peso final:** composição por 100 g = soma dos nutrientes dos ingredientes ÷ peso final real medido × 100. Isso considera só a perda de água, sem fatores de retenção. Fatores de retenção só entram com fonte confiável indicada pelo cliente. Confirma?
3. **Etiqueta:** tamanhos usados com mais frequência, e se a tabela e a lupa saem juntas ou em arquivos separados.

**Etapas propostas (cada uma com migração, teste e aprovação):**
- **R1:** clientes e receitas.
  - Cadastro opcional de clientes.
  - Receitas com ingredientes da TACO e dos personalizados, quantidades em g ou medida caseira, preparo, peso final real obrigatório, porção e categoria.
  - Versões imutáveis com cópia da composição; duplicar receita.
- **R2:** cálculo por 100 g, por porção e %VD, separando o desconhecido do zero e mostrando as lacunas.
- **R3:** categoria → porção regulamentar, lupa, lista de ingredientes em ordem decrescente, e alergênicos e glúten com confirmação do nutricionista. Tudo bloqueado como "pendente" quando faltam dados.
- **R4:** PDF da tabela e da lupa nas dimensões permitidas, com prévia, preso à versão da receita.
- **R5:** testes de conformidade com exemplos tirados dos textos oficiais.
