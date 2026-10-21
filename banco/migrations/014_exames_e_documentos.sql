-- Módulo de Nutrição — Fase 6, parte 1: exames.
--
-- - Exames enviados pelo paciente (blood_exams, já existente): passam a ter
--   nome/tipo e data do exame (opcionais), vínculo opcional com a consulta e
--   com a solicitação correspondente. O arquivo original não é copiado.
-- - Modelos de solicitação de exames (Configurações → Exames) e solicitações
--   por consulta: cópia da lista do modelo, editável só para o paciente.
-- - Documentos enviados ao paciente (solicitação de exames, orientações):
--   PDF guardado no envio, imutável; o paciente abre só os dele.

ALTER TABLE public.blood_exams ADD COLUMN IF NOT EXISTS exam_name text;
ALTER TABLE public.blood_exams ADD COLUMN IF NOT EXISTS exam_date date;
ALTER TABLE public.blood_exams ADD COLUMN IF NOT EXISTS consulta_id uuid;
ALTER TABLE public.blood_exams ADD COLUMN IF NOT EXISTS solicitacao_id uuid;

CREATE TABLE IF NOT EXISTS public.modelos_exames (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    -- [{ id, nome }]
    exames jsonb DEFAULT '[]'::jsonb NOT NULL,
    usos integer DEFAULT 0 NOT NULL,
    revisao integer DEFAULT 1 NOT NULL,
    arquivado_em timestamp with time zone,
    criado_por uuid,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT modelos_exames_pkey PRIMARY KEY (id),
    CONSTRAINT modelos_exames_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT modelos_exames_lista_check CHECK (jsonb_typeof(exames) = 'array')
);

CREATE TABLE IF NOT EXISTS public.solicitacoes_exames (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    consulta_id uuid NOT NULL,
    modelo_id uuid,
    titulo text NOT NULL,
    exames jsonb DEFAULT '[]'::jsonb NOT NULL,
    observacoes text DEFAULT '' NOT NULL,
    -- Emitida = enviada ao paciente (conteúdo e PDF congelados).
    emitida_em timestamp with time zone,
    revisao integer DEFAULT 1 NOT NULL,
    criada_por uuid,
    criada_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizada_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT solicitacoes_exames_pkey PRIMARY KEY (id),
    CONSTRAINT solicitacoes_exames_patient_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE,
    CONSTRAINT solicitacoes_exames_consulta_fkey FOREIGN KEY (consulta_id) REFERENCES public.consultas(id) ON DELETE CASCADE,
    CONSTRAINT solicitacoes_exames_modelo_fkey FOREIGN KEY (modelo_id) REFERENCES public.modelos_exames(id) ON DELETE SET NULL,
    CONSTRAINT solicitacoes_exames_criada_por_fkey FOREIGN KEY (criada_por) REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT solicitacoes_exames_lista_check CHECK (jsonb_typeof(exames) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_solicitacoes_exames_patient ON public.solicitacoes_exames USING btree (patient_id, criada_em DESC);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_exames_consulta ON public.solicitacoes_exames USING btree (consulta_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'blood_exams_consulta_fkey') THEN
    ALTER TABLE public.blood_exams ADD CONSTRAINT blood_exams_consulta_fkey
      FOREIGN KEY (consulta_id) REFERENCES public.consultas(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'blood_exams_solicitacao_fkey') THEN
    ALTER TABLE public.blood_exams ADD CONSTRAINT blood_exams_solicitacao_fkey
      FOREIGN KEY (solicitacao_id) REFERENCES public.solicitacoes_exames(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_blood_exams_consulta ON public.blood_exams USING btree (consulta_id);

-- Modelo já usado não pode ser apagado (só arquivado).
CREATE OR REPLACE FUNCTION public.proteger_modelo_exames() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.usos > 0 OR EXISTS (SELECT 1 FROM public.solicitacoes_exames WHERE modelo_id = OLD.id) THEN
    RAISE EXCEPTION 'Modelo de exames já usado: arquive em vez de excluir.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS proteger_modelo_exames_trigger ON public.modelos_exames;
CREATE TRIGGER proteger_modelo_exames_trigger
    BEFORE DELETE ON public.modelos_exames
    FOR EACH ROW EXECUTE FUNCTION public.proteger_modelo_exames();

-- Solicitação emitida não muda nem se apaga (exceto em cascata).
CREATE OR REPLACE FUNCTION public.proteger_solicitacao_emitida() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.emitida_em IS NOT NULL AND EXISTS (SELECT 1 FROM public.consultas WHERE id = OLD.consulta_id) THEN
      RAISE EXCEPTION 'Solicitação emitida não pode ser excluída.';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.emitida_em IS NOT NULL AND (NEW.exames IS DISTINCT FROM OLD.exames OR NEW.observacoes IS DISTINCT FROM OLD.observacoes
      OR NEW.titulo IS DISTINCT FROM OLD.titulo OR NEW.emitida_em IS DISTINCT FROM OLD.emitida_em) THEN
    RAISE EXCEPTION 'Solicitação emitida não pode ser alterada.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS proteger_solicitacao_emitida_trigger ON public.solicitacoes_exames;
CREATE TRIGGER proteger_solicitacao_emitida_trigger
    BEFORE UPDATE OR DELETE ON public.solicitacoes_exames
    FOR EACH ROW EXECUTE FUNCTION public.proteger_solicitacao_emitida();

-- Documentos enviados à área do paciente (PDF guardado no envio).
CREATE TABLE IF NOT EXISTS public.documentos_enviados (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    tipo text NOT NULL,
    referencia_id uuid NOT NULL,
    titulo text NOT NULL,
    file_name text NOT NULL,
    storage_path text NOT NULL,
    enviado_por uuid,
    enviado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT documentos_enviados_pkey PRIMARY KEY (id),
    CONSTRAINT documentos_enviados_caminho_unico UNIQUE (storage_path),
    CONSTRAINT documentos_enviados_patient_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE,
    CONSTRAINT documentos_enviados_enviado_por_fkey FOREIGN KEY (enviado_por) REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT documentos_enviados_tipo_check CHECK (tipo = ANY (ARRAY['solicitacao_exames', 'orientacao']))
);

CREATE INDEX IF NOT EXISTS idx_documentos_enviados_patient ON public.documentos_enviados USING btree (patient_id, enviado_em DESC);

CREATE OR REPLACE FUNCTION public.proteger_documento_enviado() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM public.patients WHERE id = OLD.patient_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Documento enviado ao paciente não pode ser alterado nem excluído.';
END;
$$;

DROP TRIGGER IF EXISTS proteger_documento_enviado_trigger ON public.documentos_enviados;
CREATE TRIGGER proteger_documento_enviado_trigger
    BEFORE UPDATE OR DELETE ON public.documentos_enviados
    FOR EACH ROW EXECUTE FUNCTION public.proteger_documento_enviado();

CREATE OR REPLACE FUNCTION public.consulta_tem_registros(p_consulta_id uuid) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.dietas WHERE consulta_id = p_consulta_id)
      OR EXISTS (SELECT 1 FROM public.avaliacoes_fisicas WHERE consulta_id = p_consulta_id)
      OR EXISTS (SELECT 1 FROM public.anamneses WHERE consulta_id = p_consulta_id)
      OR EXISTS (SELECT 1 FROM public.recordatorios WHERE consulta_id = p_consulta_id)
      OR EXISTS (SELECT 1 FROM public.solicitacoes_exames WHERE consulta_id = p_consulta_id)
$$;

ALTER TABLE public.notification_queue DROP CONSTRAINT IF EXISTS notification_queue_notification_type_check;
ALTER TABLE public.notification_queue ADD CONSTRAINT notification_queue_notification_type_check
    CHECK (notification_type = ANY (ARRAY['relatorio'::text, 'devolutiva'::text, 'dieta'::text, 'lembrete_relatorio'::text,
                                          'avaliacao'::text, 'formulario'::text, 'documento'::text]));

-- Aviso de novidade dos documentos na área do paciente.
ALTER TABLE public.patient_update_views DROP CONSTRAINT IF EXISTS patient_update_views_update_type_check;
ALTER TABLE public.patient_update_views ADD CONSTRAINT patient_update_views_update_type_check
    CHECK (update_type = ANY (ARRAY['dieta'::text, 'devolutiva'::text, 'avaliacao'::text, 'documento'::text]));
