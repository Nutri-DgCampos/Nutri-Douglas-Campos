-- Módulo de Nutrição — Fase 2 (editor de dietas).
--
-- - Dietas por consulta, em abas. O conteúdo é um documento (refeições,
--   opções, alimentos, substituições, observações, hidratação) validado pela
--   API em lib/nutricao/dieta.ts.
-- - Três estados do conteúdo: rascunho (salvamento automático), última
--   versão salva (botão Salvar) e versões enviadas ao paciente (imutáveis,
--   com a composição dos alimentos congelada no momento do envio).
-- - O envio reaproveita a entrega de dieta existente (diet_deliveries +
--   PDF), o ciclo de 33 dias, o indicador de novidade e o aviso no celular.

CREATE TABLE IF NOT EXISTS public.dietas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    consulta_id uuid NOT NULL,
    ordem integer DEFAULT 0 NOT NULL,
    rascunho jsonb NOT NULL,
    rascunho_em timestamp with time zone DEFAULT now() NOT NULL,
    salvo jsonb,
    salvo_em timestamp with time zone,
    -- Aumenta a cada gravação; protege contra duas abas sobrescrevendo.
    revisao integer DEFAULT 1 NOT NULL,
    arquivada_em timestamp with time zone,
    criada_por uuid,
    criada_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT dietas_pkey PRIMARY KEY (id),
    CONSTRAINT dietas_patient_id_fkey FOREIGN KEY (patient_id)
        REFERENCES public.patients(id) ON DELETE CASCADE,
    CONSTRAINT dietas_consulta_id_fkey FOREIGN KEY (consulta_id)
        REFERENCES public.consultas(id) ON DELETE CASCADE,
    CONSTRAINT dietas_criada_por_fkey FOREIGN KEY (criada_por)
        REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT dietas_rascunho_check CHECK (jsonb_typeof(rascunho) = 'object'),
    CONSTRAINT dietas_salvo_check CHECK ((salvo IS NULL) = (salvo_em IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_dietas_consulta ON public.dietas USING btree (consulta_id, ordem);
CREATE INDEX IF NOT EXISTS idx_dietas_patient ON public.dietas USING btree (patient_id);

-- Versões enviadas ao paciente. Cada envio cria uma versão nova; nenhuma é
-- alterada ou apagada depois (só some com a exclusão do paciente).
CREATE TABLE IF NOT EXISTS public.dietas_versoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dieta_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    numero integer NOT NULL,
    -- Documento enviado + composição usada + dados do paciente na emissão.
    conteudo jsonb NOT NULL,
    -- Totais calculados no envio (comparação com a "dieta anterior").
    totais jsonb NOT NULL,
    modelo_pdf text NOT NULL,
    entrega_id uuid NOT NULL,
    novo_ciclo boolean NOT NULL,
    enviada_por uuid,
    enviada_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT dietas_versoes_pkey PRIMARY KEY (id),
    CONSTRAINT dietas_versoes_numero_unico UNIQUE (dieta_id, numero),
    CONSTRAINT dietas_versoes_dieta_id_fkey FOREIGN KEY (dieta_id)
        REFERENCES public.dietas(id) ON DELETE CASCADE,
    CONSTRAINT dietas_versoes_patient_id_fkey FOREIGN KEY (patient_id)
        REFERENCES public.patients(id) ON DELETE CASCADE,
    CONSTRAINT dietas_versoes_entrega_id_fkey FOREIGN KEY (entrega_id)
        REFERENCES public.diet_deliveries(id) ON DELETE CASCADE,
    CONSTRAINT dietas_versoes_enviada_por_fkey FOREIGN KEY (enviada_por)
        REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT dietas_versoes_modelo_check CHECK (modelo_pdf = ANY (ARRAY['simples', 'detalhado']))
);

CREATE INDEX IF NOT EXISTS idx_dietas_versoes_patient ON public.dietas_versoes USING btree (patient_id, enviada_em DESC);

CREATE OR REPLACE FUNCTION public.proteger_versao_de_dieta() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Uma dieta enviada não pode ser alterada.' USING ERRCODE = 'P0001';
  END IF;

  -- Exclusão só em cascata (paciente, entrega ou dieta já excluídos).
  IF EXISTS (SELECT 1 FROM public.patients WHERE id = OLD.patient_id)
     AND EXISTS (SELECT 1 FROM public.dietas WHERE id = OLD.dieta_id)
     AND EXISTS (SELECT 1 FROM public.diet_deliveries WHERE id = OLD.entrega_id) THEN
    RAISE EXCEPTION 'Uma dieta enviada não pode ser excluída.' USING ERRCODE = 'P0001';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS proteger_versao_de_dieta_trigger ON public.dietas_versoes;
CREATE TRIGGER proteger_versao_de_dieta_trigger
    BEFORE UPDATE OR DELETE ON public.dietas_versoes
    FOR EACH ROW EXECUTE FUNCTION public.proteger_versao_de_dieta();

-- Dieta com versão enviada não é excluída (só arquivada), exceto quando o
-- paciente ou a consulta inteira estão sendo excluídos.
CREATE OR REPLACE FUNCTION public.proteger_exclusao_dieta() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.patients WHERE id = OLD.patient_id)
     OR NOT EXISTS (SELECT 1 FROM public.consultas WHERE id = OLD.consulta_id) THEN
    RETURN OLD;
  END IF;

  IF EXISTS (SELECT 1 FROM public.dietas_versoes WHERE dieta_id = OLD.id) THEN
    RAISE EXCEPTION 'A dieta já foi enviada ao paciente. Ela pode ser arquivada, não excluída.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS proteger_exclusao_dieta_trigger ON public.dietas;
CREATE TRIGGER proteger_exclusao_dieta_trigger
    BEFORE DELETE ON public.dietas
    FOR EACH ROW EXECUTE FUNCTION public.proteger_exclusao_dieta();

-- A consulta com dietas passa a ter registros clínicos (não pode ser excluída).
CREATE OR REPLACE FUNCTION public.consulta_tem_registros(p_consulta_id uuid) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$ SELECT EXISTS (SELECT 1 FROM public.dietas WHERE consulta_id = p_consulta_id) $$;

-- Nutrientes acompanhados no painel: preferência do nutricionista, usada como
-- ponto de partida nas dietas novas.
ALTER TABLE public.configuracoes_documentos
    ADD COLUMN IF NOT EXISTS nutrientes_painel text[] DEFAULT ARRAY['vitamina_c', 'calcio', 'ferro', 'sodio', 'potassio']::text[] NOT NULL;
