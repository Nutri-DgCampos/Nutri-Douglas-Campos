# Testes de navegação (Playwright)

Rodam contra o servidor de desenvolvimento local (`next dev -p 3100`, com `IA_SIMULADA=1`) e o banco local do Docker, usando os usuários de teste locais (`teste.nutri@local.test` e `teste.paciente@local.test`, que só existem no banco de desenvolvimento).

Precisam do `playwright-core` e do Microsoft Edge instalados (o pacote não faz parte das dependências do app):

```
npm install --no-save playwright-core
node tests/navegacao/fumaca.mjs
node tests/navegacao/treinoT1.mjs --limpar
node tests/navegacao/treinoT2.mjs --limpar
node tests/navegacao/treinoT3.mjs --limpar
node tests/navegacao/treinoT7b.mjs --limpar
node tests/navegacao/treinoT4a.mjs --limpar
node tests/navegacao/treinoT4b.mjs --limpar
node tests/navegacao/treinoT4c.mjs --limpar
node tests/navegacao/treinoT3b.mjs --limpar
node tests/navegacao/treinoT6.mjs --limpar
node tests/navegacao/treinoT8.mjs --limpar
node tests/navegacao/melhorias1101.mjs --limpar
node tests/navegacao/avisos1101.mjs --limpar
ARQUIVOS_DIR=<pasta do servidor> node tests/navegacao/fotos1101.mjs --limpar
```

Rode os testes do Treino com `--limpar`: cada um cria a própria prescrição de teste, e a mais recente que sobrar vira a vigente do paciente de teste no teste seguinte.

- `fumaca.mjs`: as telas principais da Nutrição e do paciente abrem sem erro.
- `treinoT1.mjs`: Módulo de Treino, etapa T1 (prescrição × registro do aluno).
- `treinoT2.mjs`: etapas T7a e T2. Cobre o cadastro do educador físico, o vínculo, a troca da senha provisória e o bloqueio da Nutrição para o educador. Também cobre o relato de desconforto e o alerta só para o educador vinculado, além da desativação do educador. Cria o usuário `teste.educador@local.test` e o apaga ao final.

- `treinoT7b.mjs`: etapa T7b (alunos próprios do educador). O educador cadastra o aluno pela tela. O teste confere que o nutricionista não alcança esse aluno em nenhuma rota, que o aluno vê só o Treino na Área do Paciente e que o relato de desconforto avisa só o educador dono. Cria e apaga `teste.educador.t7b@local.test` e `teste.aluno.t7b@local.test`.
- `treinoT4a.mjs`: etapa T4a. O teste confere:
  - o editor de musculação: o educador monta o treino pela tela, a faixa de repetições, os detalhes (≡), a Opção e o aviso de equipamento da academia;
  - o envio cria uma versão imutável e manda o aviso ao aluno;
  - permissões e revisão, PDF, IA simulada, importação, modelos, duplicação e arquivamento;
  - o `Meu treino` do aluno mostra a faixa e esconde os detalhes do editor.

  Cria e apaga `teste.educador.t4a@local.test`, `teste.outro.t4a@local.test` e `teste.aluno.t4a@local.test`.
- `treinoT4b.mjs`: etapa T4b (corrida e pedal do aluno, tênis, bicicleta, consumo, calorias informadas, limite do tênis pelo profissional). Cria e apaga `teste.educador.t4b@local.test` e dois alunos `teste.*aluno.t4b@local.test`.
- `treinoT4c.mjs`: etapa T4c (editores de corrida e ciclismo, zonas e Coggan, ajustar volume, totais dos mockups corrigidos, sessões planejadas no Meu treino e registro ligado à sessão). Cria e apaga `teste.educador.t4c@local.test`, `teste.outro.t4c@local.test` e `teste.aluno.t4c@local.test`.
- `treinoT3b.mjs`: etapa T3b (relatório por modalidade, nota 60/25/15, pontos, reagendado R4/R4b, atenção por modalidade, relatório completo do aluno). Monta duas semanas fechadas no banco; cria e apaga `teste.educador.t3b@local.test` e `teste.aluno.t3b@local.test`.
- `treinoT5.mjs`: etapa T5 (uso sem internet: página e dados guardados, fila, envio ao voltar, sem duplicar, relato que ainda não chegou, registro recusado). Rode contra o **build de produção** (`npx next build` e `npx next start -p 3100`, com as mesmas variáveis): o modo de desenvolvimento não funciona sem rede. Cria e apaga `teste.educador.t5@local.test` e `teste.aluno.t5@local.test`.
- `treinoT6.mjs`: etapa T6 (anamnese privada do educador, avaliação física compartilhada com autor e só o autor altera, perfil e logotipo do educador nos PDFs). Usa o paciente de teste da clínica, vinculado a `teste.educador.t6@local.test`; apaga tudo com `--limpar`.
- `treinoT8.mjs`: etapa T8. Cobre planos e tolerância do educador, contrato pela ficha, comprovante do aluno e confirmação, bloqueio por profissional com o plano vencido (R9, S2) e sem alerta de desconforto (S7), pedido de renovação, desativar e reativar e a exclusão a pedido do aluno (R10). Cria e apaga `teste.educador.t8@local.test`, `teste.outro.t8@local.test` e `teste.aluno.t8@local.test`. Com a mesma `ARQUIVOS_DIR` do servidor, confere também a remoção do comprovante.
- `treinoT3.mjs`: etapa T3 (relatório semanal, devolutiva, atraso, lista de atenção e pausa). Cria duas semanas de registros do paciente de teste e apaga tudo com `--limpar`.

As capturas de tela ficam em `tests/navegacao/visual/`, fora do git.
- `melhorias1101.mjs`, `avisos1101.mjs`, `fotos1101.mjs`: melhorias de 01/11/2026 (cópia de alimento, avisos ao nutricionista, fotos no link e sobreposição). Ver `docs/melhorias-2026-11-01.md`. O de fotos precisa da mesma `ARQUIVOS_DIR` do servidor de desenvolvimento.
