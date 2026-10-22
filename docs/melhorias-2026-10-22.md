# Melhorias de 22/10/2026: relatórios, devolutiva e documentos ao paciente

Origem: `SPEC_Melhorias_Acompanhamento_Nutricional_2026-10-22_v1.1.md`, diagnóstico enviado ao cliente e decisões D1 a D10 (todas respondidas em 22/10/2026).

## Decisões do cliente

| | Decisão |
|---|---|
| D1 | Remover um ponto ligado a uma parte do score devolve a parte ao máximo, só naquele relatório. Ponto sem parte do score não muda o score. |
| D2 | Respostas como "não tive" ou "nenhuma" nos campos de dificuldade não geram ponto nos relatórios novos. |
| D3 | O paciente vê o score corrigido e não vê o ponto removido. O score original fica guardado. |
| D4 | A devolutiva é gravada como rascunho, com versões recuperáveis. |
| D5 | A nova pergunta de hormônios não desconta pontos. "Sim, falhei no uso" e "Não, porém parei há menos de 6 meses" geram ponto de atenção. |
| D6 | A IA recebe só o primeiro nome do paciente. O peso segue a regra que já existia. |
| D7 | Fórmulas e Avaliações Físicas ficam dentro da aba Dietas. O atalho "Avaliações" sai. |
| D8 | Podem ser enviados os PDFs de fórmulas já emitidos (individual e "Manipulados"). |
| D9 | Não há "retirar acesso". O **paciente** exclui da área dele um documento enviado por engano, e o remover foto fica visível ao lado de cada foto. |
| D10 | Cada envio também gera o aviso no celular (push). |

## O que mudou

### Regra única de pontos e score (`lib/relatorios/pontos.ts`)

A regra que monta pontos positivos e pontos de atenção estava repetida em várias telas. Agora existe uma só, com um código por ponto, usada por:
- "Responder relatório";
- a visão de relatórios do paciente;
- a devolutiva.

A conta do score é a mesma do envio. `scoreCorrigido` devolve ao máximo as partes dos pontos removidos e recalcula pela mesma fórmula, com teto de 100. Os campos `regras_versao` e `hormonios_uso` separam os relatórios novos dos antigos, que continuam como foram respondidos.

### Remover ponto de atenção (`POST /api/relatorios/[id]/pontos`)

- Só vale para relatório pendente.
- Remover o mesmo ponto de novo não muda nada, nem regenera a devolutiva.
- Grava `pontos_removidos` (código, data e quem removeu) e `adherence_score_original`, e atualiza `adherence_score`.
- Um gatilho zera esses campos quando o relatório é criado, para que o paciente não consiga gravá-los.
- Se já existe devolutiva, ela é regenerada. Se a IA falhar, o rascunho fica marcado como desatualizado e a tela oferece "Tentar de novo".

### Devolutiva (`lib/servidor/devolutiva.ts`, `/api/relatorios/[id]/devolutiva`)

- O prompt é montado no servidor. Ele recebe:
  - os pontos de atenção, sem os removidos;
  - o score corrigido;
  - a variação de peso em kg, sem julgar se é boa ou ruim. A regra é a de antes: o último relatório enviado com peso ou, sem ele, o peso inicial;
  - o consumo de álcool (sim, não ou sem resposta);
  - só o primeiro nome do paciente.
- Rascunho e versões ficam em `devolutivas_rascunho` e `devolutivas_versoes`, que só o nutricionista acessa:
  - cada geração da IA vira uma versão;
  - o texto editado à mão vira versão antes de ser substituído;
  - restaurar uma versão também cria uma versão.
- Proteção contra corrida:
  - `revisao` impede que uma gravação antiga apague um texto mais novo;
  - `geracao` descarta a resposta atrasada de uma geração anterior.
- O envio ao paciente continua manual (`feedback_text`).
- A rota antiga `/api/gerar-devolutiva` foi removida.

### Documentos ao paciente (`lib/servidor/publicacoes.ts`)

- A tabela `publicacoes_paciente` guarda um registro por envio ou reenvio, sempre apontando para o mesmo arquivo, sem cópia.
- As avaliações já enviadas antes (`avaliacoes_envios`) foram migradas com o mesmo id, e os avisos já vistos continuam vistos.
- **Lado profissional:**
  - componente `EnvioAoPaciente`, com confirmação (paciente e tipo do documento) e histórico. Cada envio mostra "aberto", "não aberto" ou "excluído pelo paciente em…";
  - nas Fórmulas, ele aparece em cada PDF emitido;
  - na Avaliação Física, a confirmação mostra o paciente e o tipo, e depois do envio aparece "Reenviar".
- **Paciente:**
  - a aba Dietas tem três seções;
  - cada documento aparece uma vez, com a data do envio mais recente;
  - o aviso some só ao abrir aquele documento;
  - o paciente pode "Excluir" um documento.
- **Download:** é autorizado só se existir um envio ativo do arquivo para aquele paciente (`lib/servidor/arquivos.ts`). Um documento excluído é recusado mesmo pelo caminho antigo.
- **Ciclo de 33 dias e pagamentos:** nada aqui mexe neles.

## Banco

A migração `banco/migrations/019_relatorios_e_publicacoes.sql` é aplicada pelo `deploy.sh` e **só acrescenta**:
- colunas em `patient_reports`;
- as tabelas `devolutivas_rascunho`, `devolutivas_versoes` e `publicacoes_paciente`;
- os tipos `publicacao` e `formula` nos avisos.

Nada é apagado.

## Testes

- **Unidade:** `tests/relatorios.test.mjs` (5 testes), dentro da suíte com 54 testes.
- **Navegação, com a IA simulada:** 47 verificações cobrindo os critérios de aceite das seções 1.5, 2.3, 3.4 e 4.8 da SPEC, menos "retirar acesso", que foi substituído por D9.
- **Regressão:** fases 0 a 7, melhorias de 21/10, acesso e bugs.

## Reversão

1. Voltar o código para o commit anterior.
2. As colunas e tabelas novas podem ficar no banco, porque o código antigo as ignora.
3. Uma única ressalva: as avaliações enviadas depois da mudança também ficam em `avaliacoes_envios`, então continuam visíveis na tela antiga.

## Pendências e observações

- A tela `app/(nutricionista)/pacientes/[id]/relatorio` (relatório preenchido pelo nutricionista) não tem link em lugar nenhum e não tem permissão de gravar. Ela não recebeu a pergunta nova. Sugestão: remover.
- O score continua sendo calculado no navegador do paciente, no envio. Isso já era assim e não mudou. Vale tratar na fase de segurança.
