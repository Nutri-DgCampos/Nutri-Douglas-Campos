# SPEC "Cadastro integrado, anamneses, fotos e identificação do Treino": auditoria e implementação

**SPEC:** `Downloads\SPEC_CADASTRO_ANAMNESE_FOTOS_TREINO_2026-11-06` (06/11/2026). Implementada em 10/11/2026.

Primeiro a auditoria, só leitura. Três pontos de negócio foram perguntados e decididos pelo cliente em 10/11 (seção 1). Planos, contratos, pagamentos, tolerâncias e bloqueios **não** foram tocados em nenhum dos dois módulos.

## 1. Decisões do cliente (10/11)

| Ponto | Decisão |
|---|---|
| Educador vinculado a paciente da **clínica** | Altera só **nascimento, sexo e altura**. Nome, telefone, e-mail, acesso, plano e pagamento continuam com o nutricionista. |
| Anamnese simples antiga do Treino (7 perguntas, R6, privada F2) | As 7 perguntas viram o **modelo inicial** de cada educador. As respostas antigas continuam **privadas e só para leitura**. As anamneses novas seguem a regra nova. |
| Estrela das datas de referência no Comparativo de fotos | O educador **só vê** as estrelas (a Nutrição não muda). |

## 2. Auditoria: o que já existia e o que faltava

- **Cadastro:**
  - **Já existia:** os dados pessoais comuns (`patients.birth_date`, `sex`, `height_cm`, `contact_email`) e o componente `CamposComplementares` da Nutrição, sem nada financeiro. A avaliação física já lia nascimento e sexo do cadastro e calculava a idade na data da avaliação (`lib/servidor/avaliacoes.ts`).
  - **Faltava:** o cadastro do aluno próprio (`components/treino/CadastroDoAluno.tsx`) só tinha nome, telefone e e-mail; daí o aviso "Sem data de nascimento / Sexo não cadastrado" (Imagem 01). Paciente da clínica: o educador não via nem alterava esses dados.
- **Anamnese:**
  - **Já existia:** na Nutrição, modelos (`modelos_anamnese`), fichas (`anamneses`, ligadas à consulta), link único por paciente (`formularios_links`, token assinado e revogável), página pública `/formulario/[token]`, fotos pelo link (`fotosDoLink`) e aviso de resposta por gatilho (`aviso_anamnese`).
  - **No Treino:** só a anamnese simples (`treino_anamneses`).
- **Modelos de treino:** `treino_modelos.compartilhado` faz o modelo compartilhado ficar visível a todos os profissionais do Treino. Só o autor altera ou arquiva, e usar o modelo cria uma cópia. É o alcance aplicado aos modelos de anamnese (seção 4 da SPEC).
- **Fotos:** `fotos_evolucao` (do paciente, bucket "fotos") e `ComparativoFotos`, que lia pelo cliente genérico. O educador não tinha permissão nem de leitura.
- **Barra lateral:** `Marca` em `components/Navegacao.tsx`, com "Douglas Campos" fixo.

## 3. Implementado

### Cadastro (item 2)

- **Regras comuns:** em `lib/nutricao/dadosPessoais.ts` (tela e servidor), movidas de `CamposComplementares`, que continua exportando os mesmos nomes. Validam nascimento no futuro, sexo da lista da Nutrição (masculino/feminino), altura e e-mail.
- **Aluno próprio:** cadastro e edição com `CamposComplementares` (nascimento, sexo, altura, e-mail de contato), sem plano nem pagamento. O cartão do aluno mostra os dados e avisa quando faltam nascimento ou sexo.
- **Paciente da clínica:** cartão "Dados pessoais" na ficha do Treino e rota `/api/treino/alunos/[id]/dados-fisicos`. Exige vínculo no servidor (`podeAcompanharAluno`) e altera só os três campos. O cadastro é um só: a mudança aparece para o nutricionista.

### Anamnese (itens 3 e 4)

- **Migração `036_treino_anamnese_por_link.sql`:**
  - `anamneses.consulta_id` passa a aceitar vazio;
  - colunas `modulo` (`nutricao` ou `treino`) e `treino_modelo_id`, com o check `anamneses_origem_check`;
  - tabela `treino_modelos_anamnese`;
  - gatilho de aviso: o do Treino vai para o **autor**;
  - proteção contra exclusão valendo também sem consulta;
  - tipo de aviso `formulario_treino`.
- **Rotas da ficha:** as da Nutrição (`lib/servidor/formulariosNutricionista.ts`) passaram a receber a regra de acesso.
  - **Nutrição:** a regra de sempre; a anamnese do Treino é só leitura, preenchida e de paciente da clínica.
  - **Treino:** `ACESSO_TREINO` em `lib/servidor/treinoFormularios.ts`. Só o **autor** altera. Quem tem **vínculo** lê as **preenchidas** (Treino e Nutrição), sem as observações nem o lembrete do autor, e sem encerrar a edição pelo paciente.
- **Modelos:**
  - cada profissional tem os seus, com o modelo inicial "Anamnese do treino" (7 perguntas);
  - são privados por padrão, e "Compartilhar com os profissionais do Treino" fica no editor;
  - o compartilhado aparece só para leitura aos outros; usar cria a ficha com cópia das perguntas;
  - revogar impede novos usos sem mudar fichas;
  - editar um modelo já usado cria uma nova versão.
  - Tela: aba "Anamneses" na Biblioteca do Treino e editor `/treino/anamneses/[id]`, que é o mesmo da Nutrição.
- **Ficha do aluno no Treino:**
  - o cartão "Anamneses" tem modelo, "Nova anamnese", lista (as suas e as dos outros, só leitura) e "Link do aluno";
  - a anamnese antiga aparece só para o autor;
  - a ficha `/treino/alunos/[id]/anamnese/[anamneseId]` é a mesma ficha da Nutrição;
  - a gravação da anamnese antiga responde 410.
- **Link:**
  - é o **mesmo link** do paciente;
  - o aluno vê a anamnese do Treino marcada "Treino";
  - para o aluno só do Treino, a marca no link é "Solução Fit DLC";
  - gerar um link novo invalida o anterior para todos os profissionais, e a janela avisa isso;
  - o aluno próprio ganhou o atalho "Formulários" na área dele.
- **Nutrição:**
  - a lista "Anamneses e recordatórios" da ficha mostra as anamneses do Treino **preenchidas** ("Treino · educador", "Só leitura"), em `/nutricao/[pacienteId]/anamnese-treino/[id]`;
  - os avisos de "respondeu", o assistente da dieta, o resumo por IA e o lembrete do editor de dietas usam só as anamneses da Nutrição.

### Fotos (item 5)

- **Rotas:** `/api/treino/alunos/[id]/fotos` e `/fotos/[fotoId]`. Exigem vínculo, servem as mesmas fotos do cadastro (sem cópia) e não expõem o caminho no disco. A foto precisa ser do aluno.
- **Tela Treino:** o `ComparativoFotos` (modo `treino`) aparece depois das avaliações físicas. Frente, lado, costas, datas, ciclo, comparação e sobreposição funcionam como na Nutrição; as estrelas aparecem só para ver.
- **Envio:** as fotos chegam pelo link de sempre (`FotosCorporais`).

### Identidade visual (item 6)

- "Solução Fit DLC" no lugar de "Douglas Campos", só na barra do educador (computador e celular). Nome, perfil e autorias não mudam, e a barra do nutricionista continua igual.

## 4. Testes

- **Unitário:** `tests/dadosPessoais.test.mjs` (4).
- **Navegação:** `tests/navegacao/cadastroAnamnese1110.mjs` (36 verificações). Cobre a barra lateral, o cadastro e a avaliação, os dados físicos da clínica com vínculo e sem vínculo, o modelo inicial, a criação e a reordenação de perguntas, o compartilhamento privado e compartilhado, o envio pelo link, a resposta e o aviso ao autor, a leitura cruzada sem as notas, a recusa de alteração, a versão do modelo, o aluno próprio, as fotos com e sem vínculo, e os planos intactos.
- **T6 ajustado:** a anamnese antiga agora é só leitura.

## 5. Deploy

- Migração **036** (aditiva; as anamneses existentes ficam `modulo = 'nutricao'`).
- Nenhuma variável de ambiente nova.
