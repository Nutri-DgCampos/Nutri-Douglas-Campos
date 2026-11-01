# Testes de navegação (Playwright)

Rodam contra o servidor de desenvolvimento local (`next dev -p 3100`, com `IA_SIMULADA=1`) e o banco local do Docker, usando os usuários de teste locais (`teste.nutri@local.test` e `teste.paciente@local.test`, que só existem no banco de desenvolvimento).

Precisam do `playwright-core` e do Microsoft Edge instalados (o pacote não faz parte das dependências do app):

```
npm install --no-save playwright-core
node tests/navegacao/fumaca.mjs
node tests/navegacao/treinoT1.mjs --limpar
```

- `fumaca.mjs`: as telas principais da Nutrição e do paciente abrem sem erro.
- `treinoT1.mjs`: Módulo de Treino, etapa T1 (prescrição × registro do aluno).

As capturas de tela ficam em `tests/navegacao/visual/`, fora do git.
