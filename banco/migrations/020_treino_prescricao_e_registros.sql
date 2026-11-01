-- Módulo de Treino, etapa T1: prescrição separada do registro do aluno.
--
-- - treino_prescricoes: o treino que vale para o aluno. Publicada, não muda
--   (nova versão = nova linha). origem "externa": treino importado pelo aluno
--   (arquivo ou texto organizado pela IA); "profissional": prescrito no app
--   (etapa T4). As duas coexistem e a origem fica identificada.
-- - treino_sessoes: o que o aluno registrou num dia de treino da semana
--   (domingo a sábado, horário de Brasília): situação (concluído, parcial,
--   não concluído, reagendado), motivo e observação livre. Uma por dia
--   planejado: salvar de novo atualiza, não duplica.
-- - treino_exercicios_registro: séries, reps, carga e descanso que o aluno
--   informou em cada exercício daquela sessão. Salvar não significa que foi
--   executado: isso só vem da situação escolhida pelo aluno.
-- - O treino atual de cada aluno vira uma prescrição externa publicada (sem
--   perda; ele já inclui os ajustes feitos pelo aluno até hoje).

CREATE TABLE IF NOT EXISTS public.treino_prescricoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    origem text NOT NULL,
    -- Envio do aluno que deu origem (prescrição externa).
    treino_id uuid,
    versao integer DEFAULT 1 NOT NULL,
    modalidade text DEFAULT 'musculacao' NOT NULL,
    plano jsonb NOT NULL,
    status text DEFAULT 'publicada' NOT NULL,
    publicada_em timestamp with time zone DEFAULT now() NOT NULL,
    criada_por uuid,
    criada_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT treino_prescricoes_pkey PRIMARY KEY (id),
    CONSTRAINT treino_prescricoes_patient_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE,
    CONSTRAINT treino_prescricoes_treino_fkey FOREIGN KEY (treino_id) REFERENCES public.treinos(id) ON DELETE SET NULL,
    CONSTRAINT treino_prescricoes_criada_por_fkey FOREIGN KEY (criada_por) REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT treino_prescricoes_origem_check CHECK (origem = ANY (ARRAY['externa', 'profissional'])),
    CONSTRAINT treino_prescricoes_status_check CHECK (status = ANY (ARRAY['rascunho', 'publicada'])),
    CONSTRAINT treino_prescricoes_modalidade_check CHECK (modalidade = ANY (ARRAY['musculacao', 'corrida', 'ciclismo'])),
    CONSTRAINT treino_prescricoes_plano_check CHECK (jsonb_typeof(plano) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_treino_prescricoes_patient ON public.treino_prescricoes USING btree (patient_id, publicada_em DESC);
CREATE INDEX IF NOT EXISTS idx_treino_prescricoes_treino ON public.treino_prescricoes USING btree (treino_id);

-- Publicada não muda (o conteúdo; a exclusão do paciente leva junto).
CREATE OR REPLACE FUNCTION public.proteger_prescricao_publicada() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'publicada' AND (NEW.plano IS DISTINCT FROM OLD.plano OR NEW.status <> OLD.status) THEN
    RAISE EXCEPTION 'Prescrição publicada não pode ser alterada: publique uma nova versão.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS proteger_prescricao_publicada_trigger ON public.treino_prescricoes;
CREATE TRIGGER proteger_prescricao_publicada_trigger BEFORE UPDATE ON public.treino_prescricoes
    FOR EACH ROW EXECUTE FUNCTION public.proteger_prescricao_publicada();

CREATE TABLE IF NOT EXISTS public.treino_sessoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    prescricao_id uuid NOT NULL,
    dia text NOT NULL,
    data_planejada date NOT NULL,
    situacao text,
    -- Reagendado: nova data; parcial/não concluído/reagendado: motivo opcional.
    data_efetiva date,
    motivo text,
    observacao text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT treino_sessoes_pkey PRIMARY KEY (id),
    CONSTRAINT treino_sessoes_patient_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE,
    CONSTRAINT treino_sessoes_prescricao_fkey FOREIGN KEY (prescricao_id) REFERENCES public.treino_prescricoes(id) ON DELETE CASCADE,
    CONSTRAINT treino_sessoes_dia_check CHECK (dia = ANY (ARRAY['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'])),
    CONSTRAINT treino_sessoes_situacao_check CHECK (situacao IS NULL OR situacao = ANY (ARRAY['concluido', 'parcial', 'nao_concluido', 'reagendado'])),
    CONSTRAINT treino_sessoes_reagendada_check CHECK (situacao IS DISTINCT FROM 'reagendado' OR data_efetiva IS NOT NULL),
    CONSTRAINT treino_sessoes_unica UNIQUE (patient_id, prescricao_id, dia, data_planejada)
);

CREATE INDEX IF NOT EXISTS idx_treino_sessoes_patient ON public.treino_sessoes USING btree (patient_id, data_planejada DESC);

CREATE TABLE IF NOT EXISTS public.treino_exercicios_registro (
    sessao_id uuid NOT NULL,
    indice integer NOT NULL,
    nome text NOT NULL,
    -- Nome normalizado: liga a mesma atividade entre semanas e prescrições
    -- (carga anterior e histórico de cargas).
    chave text NOT NULL,
    series numeric(6,1),
    repeticoes numeric(6,1),
    carga_kg numeric(7,2),
    descanso_segundos integer,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT treino_exercicios_registro_pkey PRIMARY KEY (sessao_id, indice),
    CONSTRAINT treino_exercicios_registro_sessao_fkey FOREIGN KEY (sessao_id) REFERENCES public.treino_sessoes(id) ON DELETE CASCADE,
    CONSTRAINT treino_exercicios_registro_valores_check CHECK (
        (series IS NULL OR series BETWEEN 0 AND 10000) AND (repeticoes IS NULL OR repeticoes BETWEEN 0 AND 10000)
        AND (carga_kg IS NULL OR carga_kg BETWEEN 0 AND 10000) AND (descanso_segundos IS NULL OR descanso_segundos BETWEEN 0 AND 10000))
);

CREATE INDEX IF NOT EXISTS idx_treino_exercicios_registro_chave ON public.treino_exercicios_registro USING btree (chave);

-- Treinos já organizados viram prescrição externa publicada.
INSERT INTO public.treino_prescricoes (patient_id, origem, treino_id, plano, publicada_em, criada_em)
SELECT t.patient_id, 'externa', t.id, t.plano, coalesce(t.analisado_em, t.created_at), t.created_at
  FROM public.treinos t
 WHERE t.status = 'concluido' AND t.plano IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.treino_prescricoes p WHERE p.treino_id = t.id);
