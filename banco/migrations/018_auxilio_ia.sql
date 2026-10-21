-- Módulo de Nutrição — Fase 7 (auxílio da IA).
--
-- - Registro de cada chamada à IA (recurso, modelo, tokens e paciente). Nada
--   do conteúdo enviado fica guardado aqui. Serve ao limite diário de pedidos
--   do assistente (validação 7.7: 200 por dia) e ao futuro painel de uso e
--   custo. Os recursos que já existiam (exame de sangue, treino,
--   bioimpedância) também registram, sem limite (validação 7.5, opção B).
-- - Resumo da anamnese feito pela IA (validação 7.4, opção C), guardado na
--   ficha para não gerar de novo a cada leitura.

CREATE TABLE IF NOT EXISTS public.ia_uso (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recurso text NOT NULL,
    modelo text NOT NULL,
    tokens_entrada integer,
    tokens_saida integer,
    sucesso boolean DEFAULT true NOT NULL,
    patient_id uuid,
    usuario_id uuid,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ia_uso_pkey PRIMARY KEY (id),
    CONSTRAINT ia_uso_recurso_check CHECK (recurso = ANY (ARRAY[
        'assistente_dieta', 'resumo_anamnese', 'exame', 'treino', 'bioimpedancia', 'devolutiva'])),
    CONSTRAINT ia_uso_patient_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE SET NULL,
    CONSTRAINT ia_uso_usuario_fkey FOREIGN KEY (usuario_id) REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ia_uso_criado ON public.ia_uso USING btree (criado_em DESC);

ALTER TABLE public.anamneses ADD COLUMN IF NOT EXISTS resumo_ia text;
ALTER TABLE public.anamneses ADD COLUMN IF NOT EXISTS resumo_ia_em timestamp with time zone;
