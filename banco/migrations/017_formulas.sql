-- Módulo de Nutrição — Fase 6, parte 4: fórmulas manipuladas.
--
-- - Biblioteca de ingredientes (nome, dosagem de referência, unidade) e de
--   modelos de fórmula (sem dados de paciente), em Configurações → Fórmulas.
-- - Fórmulas da consulta: conteúdo em jsonb (lib/nutricao/formula.ts), ordem
--   manual, vínculo opcional com uma dieta, origem registrada. Fórmula
--   copiada de consulta anterior chega "pendente de revisão" (em cinza).
-- - PDFs emitidos ficam em documentos_emitidos (tipos 'formula'/'formulas').

CREATE TABLE IF NOT EXISTS public.ingredientes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    dados jsonb DEFAULT '{}'::jsonb NOT NULL,
    usos integer DEFAULT 0 NOT NULL,
    revisao integer DEFAULT 1 NOT NULL,
    arquivado_em timestamp with time zone,
    criado_por uuid,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ingredientes_pkey PRIMARY KEY (id),
    CONSTRAINT ingredientes_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT ingredientes_dados_check CHECK (jsonb_typeof(dados) = 'object')
);

CREATE TABLE IF NOT EXISTS public.modelos_formulas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    conteudo jsonb NOT NULL,
    usos integer DEFAULT 0 NOT NULL,
    revisao integer DEFAULT 1 NOT NULL,
    arquivado_em timestamp with time zone,
    criado_por uuid,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT modelos_formulas_pkey PRIMARY KEY (id),
    CONSTRAINT modelos_formulas_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT modelos_formulas_conteudo_check CHECK (jsonb_typeof(conteudo) = 'object')
);

CREATE TABLE IF NOT EXISTS public.formulas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    consulta_id uuid NOT NULL,
    dieta_id uuid,
    ordem integer DEFAULT 0 NOT NULL,
    conteudo jsonb NOT NULL,
    -- De onde veio: { tipo: 'modelo' | 'consulta' | 'outro_paciente' | 'duplicada', id }.
    origem jsonb,
    pendente_revisao boolean DEFAULT false NOT NULL,
    salva_em timestamp with time zone,
    revisao integer DEFAULT 1 NOT NULL,
    criada_por uuid,
    criada_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizada_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT formulas_pkey PRIMARY KEY (id),
    CONSTRAINT formulas_patient_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE,
    CONSTRAINT formulas_consulta_fkey FOREIGN KEY (consulta_id) REFERENCES public.consultas(id) ON DELETE CASCADE,
    CONSTRAINT formulas_dieta_fkey FOREIGN KEY (dieta_id) REFERENCES public.dietas(id) ON DELETE SET NULL,
    CONSTRAINT formulas_criada_por_fkey FOREIGN KEY (criada_por) REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT formulas_conteudo_check CHECK (jsonb_typeof(conteudo) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_formulas_consulta ON public.formulas USING btree (consulta_id, ordem);
CREATE INDEX IF NOT EXISTS idx_formulas_patient ON public.formulas USING btree (patient_id);

-- Biblioteca: o que já foi usado não se apaga (arquiva).
CREATE OR REPLACE FUNCTION public.proteger_item_de_formula() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.usos > 0 THEN
    RAISE EXCEPTION 'Já usado em fórmulas: arquive em vez de excluir.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS proteger_ingrediente_trigger ON public.ingredientes;
CREATE TRIGGER proteger_ingrediente_trigger BEFORE DELETE ON public.ingredientes
    FOR EACH ROW EXECUTE FUNCTION public.proteger_item_de_formula();
DROP TRIGGER IF EXISTS proteger_modelo_formula_trigger ON public.modelos_formulas;
CREATE TRIGGER proteger_modelo_formula_trigger BEFORE DELETE ON public.modelos_formulas
    FOR EACH ROW EXECUTE FUNCTION public.proteger_item_de_formula();

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
      OR EXISTS (SELECT 1 FROM public.formulas WHERE consulta_id = p_consulta_id)
      OR EXISTS (SELECT 1 FROM public.documentos_emitidos WHERE consulta_id = p_consulta_id)
$$;
