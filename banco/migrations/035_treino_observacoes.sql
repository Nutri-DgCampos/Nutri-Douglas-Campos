-- Observações do treino (SPEC complementar 06/11/2026, item 2).
--
-- Catálogo de observações reutilizáveis de cada profissional do Treino
-- (educador ou administrador). Separado do catálogo da dieta
-- (modelos_nutricao, tipo "observacao"): a SPEC pede para não misturar.
-- No treino, a observação escolhida é copiada para o plano (jsonb) da
-- versão; mudar ou arquivar o modelo não altera treinos já feitos.
--
-- Reversão: drop table treino_observacoes.

CREATE TABLE IF NOT EXISTS public.treino_observacoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profissional_id uuid NOT NULL,
    titulo text NOT NULL,
    texto text DEFAULT '' NOT NULL,
    arquivada_em timestamp with time zone,
    criada_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizada_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT treino_observacoes_pkey PRIMARY KEY (id),
    CONSTRAINT treino_observacoes_profissional_fkey FOREIGN KEY (profissional_id) REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT treino_observacoes_titulo_check CHECK (length(btrim(titulo)) BETWEEN 1 AND 120),
    CONSTRAINT treino_observacoes_texto_check CHECK (length(texto) <= 2000)
);

CREATE INDEX IF NOT EXISTS idx_treino_observacoes_profissional ON public.treino_observacoes (profissional_id) WHERE arquivada_em IS NULL;
