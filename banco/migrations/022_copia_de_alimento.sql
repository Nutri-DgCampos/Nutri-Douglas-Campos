-- Melhorias 01/11/2026, item 1: cópia de alimento da TACO para cadastro próprio.
--
-- - A cópia é um alimento "manual" independente, com vínculo de proveniência
--   ao original (copiado_de). O original nunca é alterado.
-- - Cada valor da cópia guarda a sua fonte em alimentos_nutrientes.fonte:
--   igual ao original (mesma unidade, mesmo valor) = fonte do original
--   ("taco"); alterado ou preenchido = "manual" (Personalizado).
-- - Excluir a cópia = arquivar (some das buscas; dietas e PDFs antigos não mudam).
--
-- Reversão: alter table public.alimentos drop column copiado_de, drop column copiado_em;

ALTER TABLE public.alimentos
    ADD COLUMN IF NOT EXISTS copiado_de uuid REFERENCES public.alimentos(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS copiado_em timestamptz;

CREATE INDEX IF NOT EXISTS idx_alimentos_copiado_de ON public.alimentos (copiado_de) WHERE copiado_de IS NOT NULL;
