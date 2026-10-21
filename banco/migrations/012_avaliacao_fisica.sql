-- Módulo de Nutrição — Fase 4 (avaliação física).
--
-- - Avaliação por consulta: rascunho com salvamento automático e finalização.
--   O documento segue lib/nutricao/avaliacaoDocumento.ts; os resultados
--   calculados ficam congelados na finalização (mudanças posteriores no
--   cadastro ou nas fórmulas não alteram avaliações finalizadas).
-- - Envio ao paciente: PDF por versão, imutável.
-- - O peso das avaliações finalizadas entra no histórico de peso.

CREATE TABLE IF NOT EXISTS public.avaliacoes_fisicas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    consulta_id uuid NOT NULL,
    data date NOT NULL,
    status text DEFAULT 'rascunho' NOT NULL,
    documento jsonb NOT NULL,
    -- Resultados no momento da finalização (nulo em rascunho).
    resultados jsonb,
    revisao integer DEFAULT 1 NOT NULL,
    finalizada_em timestamp with time zone,
    criada_por uuid,
    criada_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizada_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT avaliacoes_fisicas_pkey PRIMARY KEY (id),
    CONSTRAINT avaliacoes_fisicas_patient_id_fkey FOREIGN KEY (patient_id)
        REFERENCES public.patients(id) ON DELETE CASCADE,
    CONSTRAINT avaliacoes_fisicas_consulta_id_fkey FOREIGN KEY (consulta_id)
        REFERENCES public.consultas(id) ON DELETE CASCADE,
    CONSTRAINT avaliacoes_fisicas_criada_por_fkey FOREIGN KEY (criada_por)
        REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT avaliacoes_fisicas_status_check CHECK (status = ANY (ARRAY['rascunho', 'finalizada'])),
    CONSTRAINT avaliacoes_fisicas_finalizada_check CHECK ((status = 'finalizada') = (finalizada_em IS NOT NULL AND resultados IS NOT NULL)),
    CONSTRAINT avaliacoes_fisicas_documento_check CHECK (jsonb_typeof(documento) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_avaliacoes_patient ON public.avaliacoes_fisicas USING btree (patient_id, data DESC);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_consulta ON public.avaliacoes_fisicas USING btree (consulta_id);

-- PDFs enviados à área do paciente (um por envio; nunca alterados).
CREATE TABLE IF NOT EXISTS public.avaliacoes_envios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    avaliacao_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    numero integer NOT NULL,
    file_name text NOT NULL,
    storage_path text NOT NULL,
    enviada_por uuid,
    enviada_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT avaliacoes_envios_pkey PRIMARY KEY (id),
    CONSTRAINT avaliacoes_envios_numero_unico UNIQUE (avaliacao_id, numero),
    CONSTRAINT avaliacoes_envios_avaliacao_fkey FOREIGN KEY (avaliacao_id)
        REFERENCES public.avaliacoes_fisicas(id) ON DELETE CASCADE,
    CONSTRAINT avaliacoes_envios_patient_fkey FOREIGN KEY (patient_id)
        REFERENCES public.patients(id) ON DELETE CASCADE,
    CONSTRAINT avaliacoes_envios_enviada_por_fkey FOREIGN KEY (enviada_por)
        REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_avaliacoes_envios_patient ON public.avaliacoes_envios USING btree (patient_id, enviada_em DESC);

CREATE OR REPLACE FUNCTION public.proteger_envio_de_avaliacao() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Um PDF de avaliação enviado não pode ser alterado.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.avaliacoes_fisicas WHERE id = OLD.avaliacao_id) THEN
    RAISE EXCEPTION 'Um PDF de avaliação enviado não pode ser excluído.' USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS proteger_envio_de_avaliacao_trigger ON public.avaliacoes_envios;
CREATE TRIGGER proteger_envio_de_avaliacao_trigger
    BEFORE UPDATE OR DELETE ON public.avaliacoes_envios
    FOR EACH ROW EXECUTE FUNCTION public.proteger_envio_de_avaliacao();

-- Avaliação finalizada não é excluída (só a consulta inteira, em cascata,
-- ou o paciente).
CREATE OR REPLACE FUNCTION public.proteger_exclusao_avaliacao() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.patients WHERE id = OLD.patient_id)
     OR NOT EXISTS (SELECT 1 FROM public.consultas WHERE id = OLD.consulta_id) THEN
    RETURN OLD;
  END IF;
  IF OLD.status = 'finalizada' THEN
    RAISE EXCEPTION 'A avaliação finalizada fica no histórico e não pode ser excluída.' USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS proteger_exclusao_avaliacao_trigger ON public.avaliacoes_fisicas;
CREATE TRIGGER proteger_exclusao_avaliacao_trigger
    BEFORE DELETE ON public.avaliacoes_fisicas
    FOR EACH ROW EXECUTE FUNCTION public.proteger_exclusao_avaliacao();

-- Consulta com dietas ou avaliações tem registros clínicos.
CREATE OR REPLACE FUNCTION public.consulta_tem_registros(p_consulta_id uuid) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.dietas WHERE consulta_id = p_consulta_id)
      OR EXISTS (SELECT 1 FROM public.avaliacoes_fisicas WHERE consulta_id = p_consulta_id)
$$;

-- Histórico de peso: passa a incluir as avaliações finalizadas.
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
     WHERE r.weight IS NOT NULL
    UNION ALL
    SELECT a.patient_id, a.data, (a.documento->>'peso')::numeric, 'avaliacao', a.id
      FROM public.avaliacoes_fisicas a
     WHERE a.status = 'finalizada' AND (a.documento->>'peso') IS NOT NULL;

-- O paciente marca como vista a avaliação recebida (aviso de novidade).
ALTER TABLE public.patient_update_views DROP CONSTRAINT IF EXISTS patient_update_views_update_type_check;
ALTER TABLE public.patient_update_views ADD CONSTRAINT patient_update_views_update_type_check
    CHECK (update_type = ANY (ARRAY['dieta'::text, 'devolutiva'::text, 'avaliacao'::text]));

-- Aviso no celular quando o resultado da avaliação é enviado.
ALTER TABLE public.notification_queue DROP CONSTRAINT IF EXISTS notification_queue_notification_type_check;
ALTER TABLE public.notification_queue ADD CONSTRAINT notification_queue_notification_type_check
    CHECK (notification_type = ANY (ARRAY['relatorio'::text, 'devolutiva'::text, 'dieta'::text, 'lembrete_relatorio'::text, 'avaliacao'::text]));
