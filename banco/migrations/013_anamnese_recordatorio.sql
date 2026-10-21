-- Módulo de Nutrição — Fase 5 (anamnese e recordatório alimentar).
--
-- - Modelos de anamnese (Configurações): perguntas em jsonb, segundo
--   lib/nutricao/anamnese.ts. A versão sobe quando o modelo muda depois de
--   já ter sido usado; fichas guardam cópia das perguntas da versão usada.
-- - Fichas de anamnese e recordatórios por consulta. Mesmo controle nos dois:
--   enviado ao paciente, paciente preenchendo, respondido (cópia do que o
--   paciente enviou), lido (primeiro acesso do nutricionista depois da
--   resposta: o paciente não edita mais), concluído e aviso visto (tela
--   Dietas pendentes).
-- - Link individual do paciente, sem login: o token é assinado pelo servidor
--   (HMAC do id do link); nada secreto fica no banco. Revogar = gerar outro.

CREATE TABLE IF NOT EXISTS public.modelos_anamnese (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    perguntas jsonb DEFAULT '[]'::jsonb NOT NULL,
    versao integer DEFAULT 1 NOT NULL,
    usos integer DEFAULT 0 NOT NULL,
    revisao integer DEFAULT 1 NOT NULL,
    arquivado_em timestamp with time zone,
    criado_por uuid,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT modelos_anamnese_pkey PRIMARY KEY (id),
    CONSTRAINT modelos_anamnese_criado_por_fkey FOREIGN KEY (criado_por)
        REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT modelos_anamnese_perguntas_check CHECK (jsonb_typeof(perguntas) = 'array')
);

-- Modelo já usado não pode ser apagado (só arquivado).
CREATE OR REPLACE FUNCTION public.proteger_modelo_anamnese() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.usos > 0 OR EXISTS (SELECT 1 FROM public.anamneses WHERE modelo_id = OLD.id) THEN
    RAISE EXCEPTION 'Modelo de anamnese já usado: arquive em vez de excluir.';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TABLE IF NOT EXISTS public.anamneses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    consulta_id uuid NOT NULL,
    modelo_id uuid,
    modelo_versao integer,
    titulo text NOT NULL,
    perguntas jsonb NOT NULL,
    respostas jsonb DEFAULT '{}'::jsonb NOT NULL,
    -- Cópia do que o paciente enviou (última vez que clicou em "Enviar respostas").
    respostas_paciente jsonb,
    observacoes text DEFAULT '' NOT NULL,
    -- Lembrete importante da anamnese: aparece (só leitura) no editor de dietas.
    lembrete text DEFAULT '' NOT NULL,
    lembrete_em timestamp with time zone,
    status text DEFAULT 'rascunho' NOT NULL,
    enviado_em timestamp with time zone,
    paciente_editou_em timestamp with time zone,
    respondido_em timestamp with time zone,
    lido_em timestamp with time zone,
    aviso_visto_em timestamp with time zone,
    concluido_em timestamp with time zone,
    arquivado_em timestamp with time zone,
    revisao integer DEFAULT 1 NOT NULL,
    criado_por uuid,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT anamneses_pkey PRIMARY KEY (id),
    CONSTRAINT anamneses_patient_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE,
    CONSTRAINT anamneses_consulta_fkey FOREIGN KEY (consulta_id) REFERENCES public.consultas(id) ON DELETE CASCADE,
    CONSTRAINT anamneses_modelo_fkey FOREIGN KEY (modelo_id) REFERENCES public.modelos_anamnese(id) ON DELETE SET NULL,
    CONSTRAINT anamneses_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT anamneses_status_check CHECK (status = ANY (ARRAY['rascunho', 'concluido'])),
    CONSTRAINT anamneses_perguntas_check CHECK (jsonb_typeof(perguntas) = 'array'),
    CONSTRAINT anamneses_respostas_check CHECK (jsonb_typeof(respostas) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_anamneses_patient ON public.anamneses USING btree (patient_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_anamneses_consulta ON public.anamneses USING btree (consulta_id);

CREATE TABLE IF NOT EXISTS public.recordatorios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    consulta_id uuid NOT NULL,
    conteudo jsonb NOT NULL,
    conteudo_paciente jsonb,
    status text DEFAULT 'rascunho' NOT NULL,
    enviado_em timestamp with time zone,
    paciente_editou_em timestamp with time zone,
    respondido_em timestamp with time zone,
    lido_em timestamp with time zone,
    aviso_visto_em timestamp with time zone,
    concluido_em timestamp with time zone,
    arquivado_em timestamp with time zone,
    revisao integer DEFAULT 1 NOT NULL,
    criado_por uuid,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT recordatorios_pkey PRIMARY KEY (id),
    CONSTRAINT recordatorios_patient_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE,
    CONSTRAINT recordatorios_consulta_fkey FOREIGN KEY (consulta_id) REFERENCES public.consultas(id) ON DELETE CASCADE,
    CONSTRAINT recordatorios_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT recordatorios_status_check CHECK (status = ANY (ARRAY['rascunho', 'concluido'])),
    CONSTRAINT recordatorios_conteudo_check CHECK (jsonb_typeof(conteudo) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_recordatorios_patient ON public.recordatorios USING btree (patient_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_recordatorios_consulta ON public.recordatorios USING btree (consulta_id);

DROP TRIGGER IF EXISTS proteger_modelo_anamnese_trigger ON public.modelos_anamnese;
CREATE TRIGGER proteger_modelo_anamnese_trigger
    BEFORE DELETE ON public.modelos_anamnese
    FOR EACH ROW EXECUTE FUNCTION public.proteger_modelo_anamnese();

-- Só rascunhos que nunca foram ao paciente podem ser excluídos; o resto se arquiva.
CREATE OR REPLACE FUNCTION public.proteger_formulario_respondido() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
  -- Exclusão em cascata (paciente ou consulta removidos) segue normalmente.
  IF NOT EXISTS (SELECT 1 FROM public.consultas WHERE id = OLD.consulta_id) THEN
    RETURN OLD;
  END IF;
  IF OLD.status <> 'rascunho' OR OLD.enviado_em IS NOT NULL OR OLD.respondido_em IS NOT NULL THEN
    RAISE EXCEPTION 'Formulário enviado, respondido ou concluído: arquive em vez de excluir.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS proteger_anamnese_trigger ON public.anamneses;
CREATE TRIGGER proteger_anamnese_trigger
    BEFORE DELETE ON public.anamneses
    FOR EACH ROW EXECUTE FUNCTION public.proteger_formulario_respondido();

DROP TRIGGER IF EXISTS proteger_recordatorio_trigger ON public.recordatorios;
CREATE TRIGGER proteger_recordatorio_trigger
    BEFORE DELETE ON public.recordatorios
    FOR EACH ROW EXECUTE FUNCTION public.proteger_formulario_respondido();

-- Link individual do paciente (anamnese e recordatório sem login).
CREATE TABLE IF NOT EXISTS public.formularios_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    criado_por uuid,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    revogado_em timestamp with time zone,
    ultimo_acesso_em timestamp with time zone,
    CONSTRAINT formularios_links_pkey PRIMARY KEY (id),
    CONSTRAINT formularios_links_patient_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE,
    CONSTRAINT formularios_links_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES public.users(id) ON DELETE SET NULL
);

-- No máximo um link ativo por paciente.
CREATE UNIQUE INDEX IF NOT EXISTS idx_formularios_links_ativo ON public.formularios_links (patient_id) WHERE revogado_em IS NULL;

-- Consulta com anamnese ou recordatório também tem registros clínicos.
CREATE OR REPLACE FUNCTION public.consulta_tem_registros(p_consulta_id uuid) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.dietas WHERE consulta_id = p_consulta_id)
      OR EXISTS (SELECT 1 FROM public.avaliacoes_fisicas WHERE consulta_id = p_consulta_id)
      OR EXISTS (SELECT 1 FROM public.anamneses WHERE consulta_id = p_consulta_id)
      OR EXISTS (SELECT 1 FROM public.recordatorios WHERE consulta_id = p_consulta_id)
$$;

-- Aviso no celular quando um formulário é enviado ao paciente.
ALTER TABLE public.notification_queue DROP CONSTRAINT IF EXISTS notification_queue_notification_type_check;
ALTER TABLE public.notification_queue ADD CONSTRAINT notification_queue_notification_type_check
    CHECK (notification_type = ANY (ARRAY['relatorio'::text, 'devolutiva'::text, 'dieta'::text, 'lembrete_relatorio'::text, 'avaliacao'::text, 'formulario'::text]));
