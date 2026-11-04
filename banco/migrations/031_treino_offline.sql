-- Módulo de Treino, etapa T5: uso sem internet (resposta R5).
--
-- O aluno registra sem sinal; o aparelho guarda e envia quando a conexão
-- volta. Para não perder a hora real (SPEC: "preservar hora real"), o
-- registro leva o momento em que foi feito no aparelho:
-- - treino_sessoes.registrada_em: sessão de musculação (a semana também vai
--   no envio, para um registro de sábado enviado no domingo não cair na
--   semana seguinte).
-- - treino_desconfortos.registrado_em: relato de desconforto (a data do
--   relato passa a ser a do aparelho, não a da chegada). O aviso ao
--   profissional sai quando o relato chega ao servidor.
-- treino_atividades já tem registrada_em (migração 028).
--
-- Só acrescenta colunas que podem ficar vazias. Reversão: drop das duas.

ALTER TABLE public.treino_sessoes ADD COLUMN IF NOT EXISTS registrada_em timestamp with time zone;
ALTER TABLE public.treino_desconfortos ADD COLUMN IF NOT EXISTS registrado_em timestamp with time zone;
