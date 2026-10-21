-- Módulo de Nutrição — Fase 6, parte 3: medicações (registro do que o
-- paciente usa; não é prescrição).
--
-- - Biblioteca de medicamentos (Configurações → Medicações): dados básicos.
-- - Medicações da consulta: dados em jsonb (lib/nutricao/medicacao.ts),
--   status Em uso / Suspenso / Não confirmado, ordem manual, exclusão lógica
--   (pode ser desfeita).
-- - Receitas anexadas por consulta (bucket "receitas", só o nutricionista).
-- - Anotações sobre medicações por consulta (entram no PDF).

CREATE TABLE IF NOT EXISTS public.medicamentos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    dados jsonb DEFAULT '{}'::jsonb NOT NULL,
    usos integer DEFAULT 0 NOT NULL,
    revisao integer DEFAULT 1 NOT NULL,
    arquivado_em timestamp with time zone,
    criado_por uuid,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT medicamentos_pkey PRIMARY KEY (id),
    CONSTRAINT medicamentos_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT medicamentos_dados_check CHECK (jsonb_typeof(dados) = 'object')
);

CREATE TABLE IF NOT EXISTS public.receitas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    consulta_id uuid NOT NULL,
    file_name text NOT NULL,
    storage_path text NOT NULL,
    prescritor text DEFAULT '' NOT NULL,
    criada_por uuid,
    criada_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT receitas_pkey PRIMARY KEY (id),
    CONSTRAINT receitas_caminho_unico UNIQUE (storage_path),
    CONSTRAINT receitas_patient_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE,
    CONSTRAINT receitas_consulta_fkey FOREIGN KEY (consulta_id) REFERENCES public.consultas(id) ON DELETE CASCADE,
    CONSTRAINT receitas_criada_por_fkey FOREIGN KEY (criada_por) REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_receitas_consulta ON public.receitas USING btree (consulta_id);

CREATE TABLE IF NOT EXISTS public.medicacoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    consulta_id uuid NOT NULL,
    medicamento_id uuid,
    -- Registro da consulta anterior de onde veio (referência em cinza).
    origem_id uuid,
    ordem integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'nao_confirmado' NOT NULL,
    dados jsonb NOT NULL,
    excluida_em timestamp with time zone,
    revisao integer DEFAULT 1 NOT NULL,
    criada_por uuid,
    criada_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizada_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT medicacoes_pkey PRIMARY KEY (id),
    CONSTRAINT medicacoes_patient_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE,
    CONSTRAINT medicacoes_consulta_fkey FOREIGN KEY (consulta_id) REFERENCES public.consultas(id) ON DELETE CASCADE,
    CONSTRAINT medicacoes_medicamento_fkey FOREIGN KEY (medicamento_id) REFERENCES public.medicamentos(id) ON DELETE SET NULL,
    CONSTRAINT medicacoes_origem_fkey FOREIGN KEY (origem_id) REFERENCES public.medicacoes(id) ON DELETE SET NULL,
    CONSTRAINT medicacoes_criada_por_fkey FOREIGN KEY (criada_por) REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT medicacoes_status_check CHECK (status = ANY (ARRAY['em_uso', 'suspenso', 'nao_confirmado'])),
    CONSTRAINT medicacoes_dados_check CHECK (jsonb_typeof(dados) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_medicacoes_consulta ON public.medicacoes USING btree (consulta_id, ordem);
CREATE INDEX IF NOT EXISTS idx_medicacoes_patient ON public.medicacoes USING btree (patient_id);

CREATE TABLE IF NOT EXISTS public.medicacoes_anotacoes (
    consulta_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    texto text DEFAULT '' NOT NULL,
    revisao integer DEFAULT 1 NOT NULL,
    atualizada_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT medicacoes_anotacoes_pkey PRIMARY KEY (consulta_id),
    CONSTRAINT medicacoes_anotacoes_consulta_fkey FOREIGN KEY (consulta_id) REFERENCES public.consultas(id) ON DELETE CASCADE,
    CONSTRAINT medicacoes_anotacoes_patient_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE
);

CREATE OR REPLACE FUNCTION public.proteger_medicamento() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.usos > 0 OR EXISTS (SELECT 1 FROM public.medicacoes WHERE medicamento_id = OLD.id) THEN
    RAISE EXCEPTION 'Medicamento já usado: arquive em vez de excluir.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS proteger_medicamento_trigger ON public.medicamentos;
CREATE TRIGGER proteger_medicamento_trigger
    BEFORE DELETE ON public.medicamentos
    FOR EACH ROW EXECUTE FUNCTION public.proteger_medicamento();

CREATE OR REPLACE FUNCTION public.consulta_tem_registros(p_consulta_id uuid) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.dietas WHERE consulta_id = p_consulta_id)
      OR EXISTS (SELECT 1 FROM public.avaliacoes_fisicas WHERE consulta_id = p_consulta_id)
      OR EXISTS (SELECT 1 FROM public.anamneses WHERE consulta_id = p_consulta_id)
      OR EXISTS (SELECT 1 FROM public.recordatorios WHERE consulta_id = p_consulta_id)
      OR EXISTS (SELECT 1 FROM public.solicitacoes_exames WHERE consulta_id = p_consulta_id)
      OR EXISTS (SELECT 1 FROM public.orientacoes WHERE consulta_id = p_consulta_id AND modelo_id IS NULL)
      OR EXISTS (SELECT 1 FROM public.orientacoes o
                  WHERE o.consulta_id = p_consulta_id
                    AND (o.revisao > 1 OR EXISTS (SELECT 1 FROM public.documentos_enviados d WHERE d.tipo = 'orientacao' AND d.referencia_id = o.id)))
      OR EXISTS (SELECT 1 FROM public.medicacoes WHERE consulta_id = p_consulta_id)
      OR EXISTS (SELECT 1 FROM public.receitas WHERE consulta_id = p_consulta_id)
$$;

-- PDFs emitidos e guardados (medicações e fórmulas): ficam no histórico da
-- consulta como foram gerados; não vão para a área do paciente.
CREATE TABLE IF NOT EXISTS public.documentos_emitidos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    consulta_id uuid NOT NULL,
    tipo text NOT NULL,
    titulo text NOT NULL,
    file_name text NOT NULL,
    storage_path text NOT NULL,
    emitido_por uuid,
    emitido_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT documentos_emitidos_pkey PRIMARY KEY (id),
    CONSTRAINT documentos_emitidos_caminho_unico UNIQUE (storage_path),
    CONSTRAINT documentos_emitidos_patient_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE,
    CONSTRAINT documentos_emitidos_consulta_fkey FOREIGN KEY (consulta_id) REFERENCES public.consultas(id) ON DELETE CASCADE,
    CONSTRAINT documentos_emitidos_emitido_por_fkey FOREIGN KEY (emitido_por) REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT documentos_emitidos_tipo_check CHECK (tipo = ANY (ARRAY['medicacoes', 'formula', 'formulas']))
);

CREATE INDEX IF NOT EXISTS idx_documentos_emitidos_consulta ON public.documentos_emitidos USING btree (consulta_id, emitido_em DESC);
