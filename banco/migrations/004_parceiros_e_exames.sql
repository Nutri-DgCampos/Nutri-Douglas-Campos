-- Parceiros (cadastrados pelo nutricionista e exibidos ao paciente) e
-- exames de sangue (enviados pelo paciente, analisados por IA só para o
-- nutricionista).

CREATE TABLE IF NOT EXISTS public.parceiros (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    contato text,
    descricao text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT parceiros_pkey PRIMARY KEY (id),
    CONSTRAINT parceiros_nome_preenchido CHECK (length(trim(nome)) > 0)
);

CREATE TABLE IF NOT EXISTS public.blood_exams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    file_name text NOT NULL,
    storage_path text NOT NULL,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    -- Análise feita por IA, visível somente ao nutricionista.
    analysis_status text DEFAULT 'pendente' NOT NULL,
    analysis_text text,
    analysis_error text,
    analyzed_at timestamp with time zone,
    CONSTRAINT blood_exams_pkey PRIMARY KEY (id),
    CONSTRAINT blood_exams_patient_id_fkey FOREIGN KEY (patient_id)
        REFERENCES public.patients(id) ON DELETE CASCADE,
    CONSTRAINT blood_exams_analysis_status_check CHECK (
        analysis_status = ANY (ARRAY['pendente', 'processando', 'concluida', 'falhou'])
    )
);

CREATE INDEX IF NOT EXISTS idx_blood_exams_patient ON public.blood_exams USING btree (patient_id);
CREATE INDEX IF NOT EXISTS idx_blood_exams_uploaded ON public.blood_exams USING btree (uploaded_at DESC);
