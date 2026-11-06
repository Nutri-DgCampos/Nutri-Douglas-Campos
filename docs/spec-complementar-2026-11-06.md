# SPEC complementar de 06/11/2026: auditoria e implementação

**SPEC:** `Downloads\SPEC_COMPLEMENTAR_FINAL_TREINO_NUTRICAO_MEDICACOES_2026-11-06` (v3.0, cinco melhorias).

Auditoria só de leitura primeiro; o programador mandou implementar. Nenhuma alteração em produção, nenhum dado apagado e nenhum outro PDF mexido.

## 1. Treino enviado inacessível ("Aluno não encontrado")

**Causa comprovada:**
- `rotinasDoAluno()` (`lib/servidor/treinoPrescricoes.ts`) ordenava os treinos publicados com `publicada_em.localeCompare(...)`. Só que o `pg` devolve `timestamptz` como `Date`, e `Date` não tem `localeCompare`.
- Com um treino publicado a ordenação não roda. Com dois ou mais (por exemplo, o aluno enviou o treino por arquivo mais de uma vez), `GET /api/treino/alunos/[id]/programas` respondia 500.
- A tela do editor (`PaginaDoEditor`) mostrava "Aluno não encontrado" para **qualquer** falha. A ficha abria normalmente porque usa outra rota.
- Reproduzido localmente: dois treinos externos publicados levam a `TypeError: b.publicada_em.localeCompare is not a function`.

**Correção:**
- A ordem passa a ser feita pelo banco (`order by publicada_em desc`).
- `jsonb_array_length` só é aplicado quando `dias` e `semanas` são listas: um plano importado fora do formato esperado não derruba a lista.
- O editor separa as duas situações: 404 ou 403 mostram "Aluno não encontrado ou sem acesso a este aluno", com o botão "Ir para o Módulo de Treino"; outras falhas mostram "Não foi possível carregar…", com "Tentar de novo".
- A autorização não mudou (`podeAcompanharAluno`).

**Visualizar treino enviado:**
- As abas do editor já mostravam o estado de cada treino ("Rascunho", "Enviado (vN) · alterado · vigente", "Arquivado"), e a ficha já mostra o treino vigente.
- Novidade: o botão "Ver versão enviada", ao lado do selo "Enviado: versão N", abre só para leitura a versão publicada (dias, exercícios, séries, repetições, carga, descanso e observações). Quando houver mais de uma versão, dá para escolher qual.
- Ele usa `GET /api/treino/programas/[id]?versao=N`, que só atende o autor (`versaoParaPdf`).
- O rascunho e o envio continuam como antes: salvar não muda a versão publicada, e só "Enviar ao paciente" cria uma versão nova.

## 2. Observações do treino

- **Onde ficam:** no próprio plano (`plano.observacoes`: id, título, texto e modelo de origem). Assim, cada versão enviada guarda as suas.
  - A chave só existe quando há observação. Por isso, os treinos já publicados não aparecem como "alterados".
  - O volume semanal não muda.
- **Correção encontrada no caminho:** `ordenarSessoes()`, usada no envio, reconstruía o plano só com os dias. Agora mantém o resto. Aplicar o resultado da IA ou de uma importação ("substituir") também preserva as observações.
- **Catálogo do treino** (migração `035_treino_observacoes.sql`, tabela `treino_observacoes`):
  - cada profissional tem o seu, separado do catálogo da dieta;
  - API `/api/treino/observacoes` (busca sem acento) e `/api/treino/observacoes/[id]` (alterar, arquivar);
  - aba "Observações" na Biblioteca do Treino.
- **No editor** (`ObservacoesDoTreino`, entre "Adicionar treino (dia)" e "Volume semanal", como nas Imagens 03 e 05):
  - busca no catálogo e inclusão (cópia editável) e "+ Observação";
  - por observação: subir, descer, guardar no catálogo e remover.
- **Onde aparecem:** na tela do aluno (`PainelTreino`, abaixo dos dias), na janela da versão enviada, na ficha e no PDF do treino. O PDF da dieta não mudou.

## 3. Cronômetro de descanso (aluno)

- **Componentes:** `lib/cronometro.ts` (regras puras) e `components/treino/CronometroDeDescanso.tsx`, no cartão de cada exercício do "Meu treino".
- **Valor inicial:** o descanso **prescrito** (`descanso_segundos`, de 1 a 900 s). Vazio ou inválido mostra "Sem descanso prescrito… o cronômetro não se aplica", sem inventar valor.
- **Controles:** Iniciar, Pausar ou Retomar, Reiniciar, −15 s e +15 s (ajuste manual que não altera a prescrição) e fechar. Um cronômetro por vez: iniciar outro substitui o anterior.
- **Contagem:** pelo instante final (relógio). Trocar de aba ou a tela apagar não atrasa nem adianta a contagem, e não há nenhuma chamada ao servidor.
- **Fim:** aviso na tela ("Descanso concluído") e **uma** vibração curta (`navigator.vibrate`) quando houver suporte. A vibração pode ser desligada (preferência só no aparelho).
- **Sem áudio:** é opcional na SPEC e não foi incluído.
- **O que não faz:** não grava nada, não conclui séries e não mexe nos campos nem na fila sem internet.
- **Limitações por plataforma:**
  - o iPhone/Safari não tem `navigator.vibrate`: fica só o aviso visual;
  - com a tela bloqueada ou em segundo plano, o navegador pode pausar a página. Ao voltar, a contagem é recalculada pelo relógio.
  - Testado no Edge (Chromium) com o relógio controlado e a vibração observada. **Falta o teste manual num Android e num iPhone de verdade.**

## 4. Hidratação pré-preenchida (Nutrição)

- **O que já existia:** os dois campos ficam no painel nutricional do editor. O ml/kg já era editável e recalculava na hora (`hidratacaoDiaria`), e o texto já era editável e saía no PDF da dieta.
- **Mudança** (`lib/nutricao/dieta.ts`):
  - `ORIENTACAO_HIDRATACAO_PADRAO`, com o texto exato da SPEC;
  - `documentoVazio()` (dieta nova, inclusive a gerada pela anamnese) já nasce com esse texto. O ml/kg continua vazio: não há padrão de ml/kg (o 40 da imagem é só um exemplo);
  - a cópia preserva a orientação da origem, mesmo vazia; a "rotina anterior" (dieta nova sem a hidratação anterior) recebe o padrão;
  - o texto padrão sozinho não conta como "conteúdo" da dieta, então não dispara o aviso de substituição na importação nem na IA.
- **Sem migração:** dietas existentes não mudam. O padrão só entra quando a dieta nasce, então um texto apagado e salvo continua vazio.

## 5. PDF de medicações

- **Causa:**
  - o gerador (`lib/servidor/pdf/medicacoes.tsx`, exclusivo deste PDF) nunca exibia as datas de início e término de cada registro;
  - o nome e o CRN vinham de `carregarIdentidade()` e eram impressos no cabeçalho, no rodapé e no autor do arquivo.
- **Correção:**
  - cada linha mostra `textoDoPeriodo(inicio, termino)` (`lib/nutricao/medicacao.ts`), com os dados do próprio registro:
    - com as duas datas: "Período de uso: DD/MM/AAAA a DD/MM/AAAA";
    - só uma: "Início: …" ou "Término: …";
    - nenhuma: nada;
    - datas validadas como data civil, sem deslocamento por fuso.
  - o cabeçalho e o rodapé ficam sem nome, título e CRN; o rodapé fica só com "N / total". O autor do arquivo também saiu, e a rota não carrega mais a identidade.
  - continuam no PDF: paciente, consulta, emissão, tabela, totais e aviso informativo. O cálculo semanal e os dados gravados não mudaram. Cada linha continua sem quebra entre páginas (`wrap={false}`).
  - os outros PDFs não mudaram.

## Testes

- **Unitários:**
  - `tests/cronometro.test.mjs` (5);
  - `tests/hidratacao.test.mjs` (5);
  - `tests/medicacao.test.mjs` (período);
  - `tests/treinoEditor.test.mjs` (observações).
- **Navegação:** `tests/navegacao/complementar1106.mjs` (30 verificações). Ele:
  - reproduz o erro com 2 treinos enviados por arquivo;
  - cobre o acesso sem permissão, o link inválido e "Ver versão enviada";
  - cobre as observações (posição, catálogo, nova versão, aluno e PDF);
  - roda o cronômetro com relógio controlado e conta as vibrações;
  - confere a dieta nova;
  - confere o PDF de medicações pelo texto extraído com `pypdf`.

## Deploy

Uma migração nova, a **035**, aditiva: aplicada pelo `deploy.sh`, sem variável de ambiente nova.
