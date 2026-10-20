-- Módulo de Nutrição — Fase 0 (fundação).
--
-- - Cadastro: data de nascimento, sexo, altura atual e e-mail de contato
--   (independente do e-mail de acesso ao aplicativo).
-- - Consultas do paciente, com no máximo uma em andamento.
-- - Trilha de auditoria para correções em registros clínicos.
-- - Configurações de identidade visual dos documentos em PDF.
-- - Histórico de peso unificado (view, somente leitura).

-- ---------------------------------------------------------------------------
-- Cadastro

ALTER TABLE public.patients
    ADD COLUMN IF NOT EXISTS birth_date date,
    ADD COLUMN IF NOT EXISTS sex text,
    ADD COLUMN IF NOT EXISTS height_cm numeric(5,1),
    ADD COLUMN IF NOT EXISTS contact_email text;

ALTER TABLE public.patients DROP CONSTRAINT IF EXISTS patients_sex_check;
ALTER TABLE public.patients
    ADD CONSTRAINT patients_sex_check CHECK (sex IS NULL OR sex = ANY (ARRAY['masculino', 'feminino']));

ALTER TABLE public.patients DROP CONSTRAINT IF EXISTS patients_height_check;
ALTER TABLE public.patients
    ADD CONSTRAINT patients_height_check CHECK (height_cm IS NULL OR (height_cm > 30 AND height_cm < 260));

ALTER TABLE public.patients DROP CONSTRAINT IF EXISTS patients_birth_date_check;
ALTER TABLE public.patients
    ADD CONSTRAINT patients_birth_date_check CHECK (birth_date IS NULL OR birth_date > DATE '1900-01-01');

ALTER TABLE public.patients DROP CONSTRAINT IF EXISTS patients_contact_email_check;
ALTER TABLE public.patients
    ADD CONSTRAINT patients_contact_email_check CHECK (contact_email IS NULL OR (contact_email = lower(contact_email) AND contact_email LIKE '%_@_%._%'));

-- ---------------------------------------------------------------------------
-- Consultas

CREATE TABLE IF NOT EXISTS public.consultas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    data date NOT NULL,
    tipo text NOT NULL,
    status text DEFAULT 'em_andamento' NOT NULL,
    nutricionista_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    finalizada_em timestamp with time zone,
    CONSTRAINT consultas_pkey PRIMARY KEY (id),
    CONSTRAINT consultas_patient_id_fkey FOREIGN KEY (patient_id)
        REFERENCES public.patients(id) ON DELETE CASCADE,
    CONSTRAINT consultas_nutricionista_id_fkey FOREIGN KEY (nutricionista_id)
        REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT consultas_tipo_check CHECK (tipo = ANY (ARRAY['primeira', 'retorno'])),
    CONSTRAINT consultas_status_check CHECK (status = ANY (ARRAY['em_andamento', 'finalizada'])),
    CONSTRAINT consultas_finalizada_check CHECK ((status = 'finalizada') = (finalizada_em IS NOT NULL))
);

-- No máximo uma consulta em andamento por paciente, inclusive com
-- requisições simultâneas.
CREATE UNIQUE INDEX IF NOT EXISTS consultas_uma_em_andamento
    ON public.consultas USING btree (patient_id) WHERE (status = 'em_andamento');

CREATE INDEX IF NOT EXISTS idx_consultas_patient ON public.consultas USING btree (patient_id, data DESC);

-- Registros clínicos vinculados à consulta. As próximas fases (avaliação
-- física, dietas, anamnese, fórmulas...) redefinem esta função para incluir
-- suas tabelas.
CREATE OR REPLACE FUNCTION public.consulta_tem_registros(p_consulta_id uuid) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$ SELECT false $$;

-- Só a consulta vigente (em andamento) e sem registros clínicos pode ser
-- excluída. A exclusão do paciente inteiro (cascata) continua permitida.
CREATE OR REPLACE FUNCTION public.proteger_exclusao_consulta() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.patients WHERE id = OLD.patient_id) THEN
    RETURN OLD;
  END IF;

  IF OLD.status <> 'em_andamento' THEN
    RAISE EXCEPTION 'Somente a consulta em andamento pode ser excluída.'
      USING ERRCODE = 'P0001';
  END IF;

  IF public.consulta_tem_registros(OLD.id) THEN
    RAISE EXCEPTION 'A consulta possui registros clínicos vinculados.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS proteger_exclusao_consulta_trigger ON public.consultas;
CREATE TRIGGER proteger_exclusao_consulta_trigger
    BEFORE DELETE ON public.consultas
    FOR EACH ROW EXECUTE FUNCTION public.proteger_exclusao_consulta();

-- ---------------------------------------------------------------------------
-- Auditoria de alterações em registros clínicos

CREATE TABLE IF NOT EXISTS public.auditoria_clinica (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    tabela text NOT NULL,
    registro_id uuid NOT NULL,
    acao text NOT NULL,
    campo text,
    valor_anterior jsonb,
    valor_novo jsonb,
    usuario_id uuid,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT auditoria_clinica_pkey PRIMARY KEY (id),
    CONSTRAINT auditoria_clinica_patient_id_fkey FOREIGN KEY (patient_id)
        REFERENCES public.patients(id) ON DELETE CASCADE,
    CONSTRAINT auditoria_clinica_usuario_id_fkey FOREIGN KEY (usuario_id)
        REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT auditoria_clinica_acao_check CHECK (acao = ANY (ARRAY['criacao', 'alteracao', 'exclusao', 'finalizacao']))
);

CREATE INDEX IF NOT EXISTS idx_auditoria_registro ON public.auditoria_clinica USING btree (tabela, registro_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_patient ON public.auditoria_clinica USING btree (patient_id, criado_em DESC);

-- ---------------------------------------------------------------------------
-- Identidade visual dos documentos (uma única linha)

CREATE TABLE IF NOT EXISTS public.configuracoes_documentos (
    id smallint DEFAULT 1 NOT NULL,
    nome_profissional text,
    registro_profissional text,
    frase text,
    cor_linhas text DEFAULT '#22c55e' NOT NULL,
    logo_path text,
    assinatura_path text,
    marca_dagua_path text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT configuracoes_documentos_pkey PRIMARY KEY (id),
    CONSTRAINT configuracoes_documentos_unica CHECK (id = 1),
    CONSTRAINT configuracoes_documentos_cor_check CHECK (cor_linhas ~ '^#[0-9a-fA-F]{6}$')
);

INSERT INTO public.configuracoes_documentos (id, nome_profissional, registro_profissional, frase)
VALUES (1, 'Nutri Douglas Campos', 'CRN-3 76014/P', 'Mais que uma dieta, Um estilo de vida!')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Histórico de peso (somente leitura): peso inicial do cadastro, evoluções
-- registradas e pesos informados nos relatórios.

CREATE OR REPLACE VIEW public.historico_peso AS
    SELECT p.id AS patient_id,
           (p.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS data,
           p.initial_weight AS peso,
           'cadastro'::text AS origem,
           p.id AS referencia_id
      FROM public.patients p
     WHERE p.initial_weight IS NOT NULL
    UNION ALL
    SELECT e.patient_id, e.measured_at, e.weight, 'evolucao', e.id
      FROM public.patient_progress e
    UNION ALL
    SELECT r.patient_id, r.report_date, r.weight, 'relatorio', r.id
      FROM public.patient_reports r
     WHERE r.weight IS NOT NULL;
