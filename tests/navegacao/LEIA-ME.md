# Testes de navegação (Playwright)

Rodam contra o servidor de desenvolvimento local (`next dev -p 3100`, com `IA_SIMULADA=1`) e o banco local do Docker, usando os usuários de teste locais (`teste.nutri@local.test` e `teste.paciente@local.test`, que só existem no banco de desenvolvimento).

Precisam do `playwright-core` e do Microsoft Edge instalados (o pacote não faz parte das dependências do app):

```
npm install --no-save playwright-core
node tests/navegacao/fumaca.mjs
node tests/navegacao/treinoT1.mjs --limpar
node tests/navegacao/treinoT2.mjs --limpar
```

Rode os testes do Treino com `--limpar`: cada um cria a própria prescrição de teste, e a mais recente que sobrar vira a vigente do paciente de teste no teste seguinte.

- `fumaca.mjs`: as telas principais da Nutrição e do paciente abrem sem erro.
- `treinoT1.mjs`: Módulo de Treino, etapa T1 (prescrição × registro do aluno).
- `treinoT2.mjs`: etapas T7a e T2. Cobre o cadastro do educador físico, o vínculo, a troca da senha provisória e o bloqueio da Nutrição para o educador. Também cobre o relato de desconforto e o alerta só para o educador vinculado, além da desativação do educador. Cria o usuário `teste.educador@local.test` e o apaga ao final.

As capturas de tela ficam em `tests/navegacao/visual/`, fora do git.
