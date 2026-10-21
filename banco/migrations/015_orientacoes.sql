-- Módulo de Nutrição — Fase 6, parte 2: orientações nutricionais.
--
-- - Modelos (Configurações → Orientações): conteúdo em blocos (título,
--   parágrafo, lista, imagem) + assinatura opcional, segundo
--   lib/nutricao/orientacao.ts. "automatica": incluída em toda nova consulta.
-- - Orientação da consulta: cópia independente do modelo, editável; o envio
--   ao paciente guarda o PDF em documentos_enviados (tipo 'orientacao').
-- - Imagens: bucket "orientacoes" (só o nutricionista); arquivos não são
--   apagados, para não quebrar cópias e documentos já emitidos.

CREATE TABLE IF NOT EXISTS public.modelos_orientacoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    conteudo jsonb NOT NULL,
    usos integer DEFAULT 0 NOT NULL,
    revisao integer DEFAULT 1 NOT NULL,
    arquivado_em timestamp with time zone,
    criado_por uuid,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT modelos_orientacoes_pkey PRIMARY KEY (id),
    CONSTRAINT modelos_orientacoes_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT modelos_orientacoes_conteudo_check CHECK (jsonb_typeof(conteudo) = 'object')
);

CREATE TABLE IF NOT EXISTS public.orientacoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    consulta_id uuid NOT NULL,
    modelo_id uuid,
    titulo text NOT NULL,
    conteudo jsonb NOT NULL,
    revisao integer DEFAULT 1 NOT NULL,
    arquivada_em timestamp with time zone,
    criada_por uuid,
    criada_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizada_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT orientacoes_pkey PRIMARY KEY (id),
    CONSTRAINT orientacoes_patient_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE,
    CONSTRAINT orientacoes_consulta_fkey FOREIGN KEY (consulta_id) REFERENCES public.consultas(id) ON DELETE CASCADE,
    CONSTRAINT orientacoes_modelo_fkey FOREIGN KEY (modelo_id) REFERENCES public.modelos_orientacoes(id) ON DELETE SET NULL,
    CONSTRAINT orientacoes_criada_por_fkey FOREIGN KEY (criada_por) REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT orientacoes_conteudo_check CHECK (jsonb_typeof(conteudo) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_orientacoes_patient ON public.orientacoes USING btree (patient_id, criada_em DESC);
CREATE INDEX IF NOT EXISTS idx_orientacoes_consulta ON public.orientacoes USING btree (consulta_id);

CREATE OR REPLACE FUNCTION public.proteger_modelo_orientacao() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.usos > 0 OR EXISTS (SELECT 1 FROM public.orientacoes WHERE modelo_id = OLD.id) THEN
    RAISE EXCEPTION 'Modelo de orientação já usado: arquive em vez de excluir.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS proteger_modelo_orientacao_trigger ON public.modelos_orientacoes;
CREATE TRIGGER proteger_modelo_orientacao_trigger
    BEFORE DELETE ON public.modelos_orientacoes
    FOR EACH ROW EXECUTE FUNCTION public.proteger_modelo_orientacao();

-- Orientação já enviada ao paciente não se exclui (arquiva).
CREATE OR REPLACE FUNCTION public.proteger_orientacao_enviada() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.consultas WHERE id = OLD.consulta_id)
     AND EXISTS (SELECT 1 FROM public.documentos_enviados WHERE tipo = 'orientacao' AND referencia_id = OLD.id) THEN
    RAISE EXCEPTION 'Orientação enviada ao paciente: arquive em vez de excluir.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS proteger_orientacao_enviada_trigger ON public.orientacoes;
CREATE TRIGGER proteger_orientacao_enviada_trigger
    BEFORE DELETE ON public.orientacoes
    FOR EACH ROW EXECUTE FUNCTION public.proteger_orientacao_enviada();

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
$$;
