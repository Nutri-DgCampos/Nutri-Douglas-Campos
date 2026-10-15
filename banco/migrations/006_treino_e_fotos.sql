-- Treino enviado pelo paciente (organizado por IA) e fotos de evolução
-- (frente, lado e costas) para o comparativo do nutricionista.

CREATE TABLE IF NOT EXISTS public.treinos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    -- Arquivo enviado (PDF, imagem, Word, Excel ou texto) ou texto colado.
    file_name text,
    storage_path text,
    texto_enviado text,
    status text DEFAULT 'pendente' NOT NULL,
    erro text,
    -- Treino organizado: { dias: [{ dia, titulo, kcal_estimadas, exercicios: [...] }] }
    plano jsonb,
    comentario_ia text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    analisado_em timestamp with time zone,
    atualizado_em timestamp with time zone,
    CONSTRAINT treinos_pkey PRIMARY KEY (id),
    CONSTRAINT treinos_patient_id_fkey FOREIGN KEY (patient_id)
        REFERENCES public.patients(id) ON DELETE CASCADE,
    CONSTRAINT treinos_status_check CHECK (
        status = ANY (ARRAY['pendente', 'processando', 'concluido', 'falhou'])
    ),
    CONSTRAINT treinos_origem_check CHECK (storage_path IS NOT NULL OR texto_enviado IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_treinos_patient ON public.treinos USING btree (patient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.fotos_evolucao (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    perfil text NOT NULL,
    -- Dia em que o paciente anexou a foto (fuso de Brasília).
    data date NOT NULL,
    storage_path text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fotos_evolucao_pkey PRIMARY KEY (id),
    CONSTRAINT fotos_evolucao_patient_id_fkey FOREIGN KEY (patient_id)
        REFERENCES public.patients(id) ON DELETE CASCADE,
    CONSTRAINT fotos_evolucao_perfil_check CHECK (perfil = ANY (ARRAY['frente', 'lado', 'costas'])),
    CONSTRAINT fotos_evolucao_unica UNIQUE (patient_id, perfil, data)
);

-- Datas que o nutricionista marcou como favoritas no comparativo.
CREATE TABLE IF NOT EXISTS public.fotos_datas_favoritas (
    patient_id uuid NOT NULL,
    data date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fotos_datas_favoritas_pkey PRIMARY KEY (patient_id, data),
    CONSTRAINT fotos_datas_favoritas_patient_id_fkey FOREIGN KEY (patient_id)
        REFERENCES public.patients(id) ON DELETE CASCADE
);
