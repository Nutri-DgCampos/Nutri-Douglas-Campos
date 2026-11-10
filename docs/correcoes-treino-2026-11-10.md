# Correções do Módulo de Treino (10/11/2026)

Origem: `SPEC_Correcoes_Modulo_Treino.md` (pasta `SPEC_Correcoes_Modulo_Treino_2026-11-10`). Nenhuma operação destrutiva em produção. Planos, contratos e pagamentos não mudam, e a integração Nutrição/Treino continua igual.

## 001 — Treino publicado pelo profissional não aparecia na Área do Paciente

**Causa:** o cartão de treino da página inicial do paciente (`components/EnvioTreino.tsx`) só consultava a tabela antiga `treinos`, que guarda o arquivo enviado pelo próprio paciente. O treino publicado pelo profissional fica em `treino_prescricoes` (e as planilhas de corrida/ciclismo em outra tabela), e o cartão não olhava para lá. A página `/area-paciente/treino` já mostrava tudo certo, mas faltava o caminho para chegar até ela.

**Correção:**
- Nova rota `GET /api/area-paciente/treino/resumo`, só do aluno conectado. Ela diz se existe musculação vigente e de onde ela veio, e se existe planilha publicada. Usa as mesmas regras da tela de treino: `prescricaoVigente` e os bloqueios de contrato (`bloqueiosDoAluno`).
- Quando há treino do profissional, o cartão mostra "Seu treino enviado pelo profissional está disponível." e o botão "Ver meu treino". O envio de arquivo e a opção de colar texto continuam disponíveis.

## 002 — "Cadastrar aluno" abria com e-mail e senha preenchidos

**Causa:** o formulário começava vazio, mas havia dois problemas:
- o diálogo não era limpo ao fechar;
- o navegador autopreenchia o par e-mail + senha com o login salvo do próprio educador.

**Correção** (`components/treino/CadastroDoAluno.tsx`):
- Os campos usam `autoComplete="off"` e a senha usa `autoComplete="new-password"`.
- Fechar ou cancelar descarta o que foi digitado, então cada abertura começa vazia.

## 003 — "Solicitar vínculo" quando o e-mail já é de um aluno

Regra (Opção A da SPEC): quem cadastrou o aluno decide.

| Situação | Para quem vai o pedido |
| --- | --- |
| Aluno próprio de um educador (`patients.educador_dono_id`) | O educador dono |
| Paciente da clínica (cadastrado pelo nutricionista ou por conta própria) | O nutricionista (decisão do cliente em 10/11) |
| Educador dono inativo | Nenhum. O pedido não é criado e a tela mostra "O profissional responsável por este aluno está inativo. Fale com o administrador." (decisão do cliente em 10/11) |

**Fluxo:**
- Ao cadastrar um e-mail que já existe, `POST /api/treino/alunos` responde 409 com `codigo: "email_existente"`.
- O diálogo passa para "Solicitar vínculo", com uma mensagem opcional de até 1000 caracteres.
- Nenhum dado do aluno aparece antes da aprovação. Quem pediu vê só o e-mail que digitou.
- O destinatário recebe um aviso (tipo `vinculo`) e vê o cartão "Pedidos de vínculo" na tela inicial do Treino, onde pode Aprovar ou Recusar, sempre com confirmação.
- Ao aprovar, o sistema usa o mesmo `vincular()` do vínculo manual. O cadastro, os outros vínculos, os planos e os pagamentos não mudam.
- Quem pediu é avisado da decisão e acompanha a situação em "Seus pedidos".

**Recusas:**
- já vinculado;
- pedido pendente repetido;
- e-mail de profissional ou inexistente (mensagem genérica, sem revelar a conta);
- pedido feito por administrador.

**Autorização (no servidor):** só o destinatário decide. Para paciente da clínica, quem decide é o nutricionista. Para qualquer outra pessoa, inclusive quem pediu, o pedido "não existe" (404). Não há autoaprovação.

**Arquivos:**
- `lib/servidor/pedidosVinculo.ts`;
- `app/api/treino/pedidos-vinculo/route.ts` (GET, POST);
- `app/api/treino/pedidos-vinculo/[id]/route.ts` (PATCH `{acao: "aprovar" | "recusar"}`);
- `components/treino/PedidosDeVinculo.tsx`;
- ajustes em `app/api/treino/alunos/route.ts`, `components/treino/CadastroDoAluno.tsx`, `components/SinoDeAvisos.tsx` e `lib/servidor/pushProfissional.ts`.

**Migração 037** (`banco/migrations/037_treino_pedidos_vinculo.sql`), aditiva:
- Cria a tabela `treino_pedidos_vinculo`.
- Garante um único pedido pendente por aluno e solicitante.
- Garante que a data de decisão exista só quando o pedido já foi decidido.
- Acrescenta o tipo `vinculo` aos avisos dos profissionais.

## 004 — Título da janela "Olá, [nome]" para o educador

**Causa:** o título da janela do app instalado é o `document.title`, que vinha fixo do layout raiz ("Acompanhamento Nutricional").

**Correção:** `generateMetadata` em `app/(treino)/layout.tsx` usa "Olá, [nome do educador]" só quando quem está conectado é educador. O nutricionista e o paciente continuam com o título de antes. O logo e "Solução Fit DLC / Módulo de Treino" na barra lateral não mudam.

## Testes

- `tests/navegacao/correcoes1110.mjs` cobre os quatro itens: 32 verificações, incluindo as recusas e as tentativas de decidir sem permissão.
- A regressão completa (20 testes de navegação e os testes unitários) e o T5 no build de produção passaram.
