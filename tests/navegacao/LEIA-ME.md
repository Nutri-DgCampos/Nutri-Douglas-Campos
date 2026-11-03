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
node tests/navegacao/melhorias1101.mjs --limpar
node tests/navegacao/avisos1101.mjs --limpar
ARQUIVOS_DIR=<pasta do servidor> node tests/navegacao/fotos1101.mjs --limpar
```

Rode os testes do Treino com `--limpar`: cada um cria a própria prescrição de teste, e a mais recente que sobrar vira a vigente do paciente de teste no teste seguinte.

- `fumaca.mjs`: as telas principais da Nutrição e do paciente abrem sem erro.
- `treinoT1.mjs`: Módulo de Treino, etapa T1 (prescrição × registro do aluno).
- `treinoT2.mjs`: etapas T7a e T2. Cobre o cadastro do educador físico, o vínculo, a troca da senha provisória e o bloqueio da Nutrição para o educador. Também cobre o relato de desconforto e o alerta só para o educador vinculado, além da desativação do educador. Cria o usuário `teste.educador@local.test` e o apaga ao final.

- `treinoT7b.mjs`: etapa T7b (alunos próprios do educador). O educador cadastra o aluno pela tela. O teste confere que o nutricionista não alcança esse aluno em nenhuma rota, que o aluno vê só o Treino na Área do Paciente e que o relato de desconforto avisa só o educador dono. Cria e apaga `teste.educador.t7b@local.test` e `teste.aluno.t7b@local.test`.
- `treinoT3.mjs`: etapa T3 (relatório semanal, devolutiva, atraso, lista de atenção e pausa). Cria duas semanas de registros do paciente de teste e apaga tudo com `--limpar`.

As capturas de tela ficam em `tests/navegacao/visual/`, fora do git.
- `melhorias1101.mjs`, `avisos1101.mjs`, `fotos1101.mjs`: melhorias de 01/11/2026 (cópia de alimento, avisos ao nutricionista, fotos no link e sobreposição). Ver `docs/melhorias-2026-11-01.md`. O de fotos precisa da mesma `ARQUIVOS_DIR` do servidor de desenvolvimento.
