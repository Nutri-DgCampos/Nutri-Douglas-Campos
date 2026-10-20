-- Módulo de Nutrição — Fase 3 (modelos e importações).
--
-- - Biblioteca de modelos do nutricionista: observação, refeição e dieta
--   completa. O conteúdo é o mesmo formato do editor (lib/nutricao/dieta.ts),
--   sem dados de paciente. Usar um modelo copia o conteúdo: editar o modelo
--   depois não muda dietas já feitas com ele.
-- - Modelo nunca usado pode ser excluído; usado é arquivado.
-- - Cada dieta registra de onde veio (duplicação, importação, modelo, rotina).

CREATE TABLE IF NOT EXISTS public.modelos_nutricao (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tipo text NOT NULL,
    nome text NOT NULL,
    conteudo jsonb NOT NULL,
    usos integer DEFAULT 0 NOT NULL,
    revisao integer DEFAULT 1 NOT NULL,
    arquivado_em timestamp with time zone,
    criado_por uuid,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT modelos_nutricao_pkey PRIMARY KEY (id),
    CONSTRAINT modelos_nutricao_tipo_check CHECK (tipo = ANY (ARRAY['observacao', 'refeicao', 'dieta'])),
    CONSTRAINT modelos_nutricao_nome_check CHECK (length(btrim(nome)) > 0 AND length(nome) <= 200),
    CONSTRAINT modelos_nutricao_conteudo_check CHECK (jsonb_typeof(conteudo) = 'object'),
    CONSTRAINT modelos_nutricao_criado_por_fkey FOREIGN KEY (criado_por)
        REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_modelos_nutricao_busca
    ON public.modelos_nutricao USING gin (public.normalizar_texto(nome) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_modelos_nutricao_tipo ON public.modelos_nutricao USING btree (tipo, nome);

-- Modelo já usado não é excluído (o banco também garante).
CREATE OR REPLACE FUNCTION public.proteger_exclusao_modelo() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD.usos > 0 THEN
    RAISE EXCEPTION 'O modelo já foi usado em dietas. Ele pode ser arquivado, não excluído.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS proteger_exclusao_modelo_trigger ON public.modelos_nutricao;
CREATE TRIGGER proteger_exclusao_modelo_trigger
    BEFORE DELETE ON public.modelos_nutricao
    FOR EACH ROW EXECUTE FUNCTION public.proteger_exclusao_modelo();

-- Origem da dieta: {"tipo": "duplicacao" | "dieta" | "modelo" | "rotina", "id": ..., "em": ...}
-- (lista, porque uma dieta pode receber mais de uma importação).
ALTER TABLE public.dietas
    ADD COLUMN IF NOT EXISTS origens jsonb DEFAULT '[]'::jsonb NOT NULL;
