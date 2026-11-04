-- Módulo de Treino, etapa T6: anamnese do educador (R6), avaliação física
-- compartilhada (R7/R7b) e identidade nos PDFs do educador (R8).
--
-- Só acrescenta (e afrouxa um NOT NULL):
-- - avaliacoes_fisicas.consulta_id passa a aceitar vazio: a avaliação feita
--   pelo educador no Módulo de Treino não pertence a uma consulta da
--   Nutrição. Continua obrigatório saber quem fez (consulta ou autor). As
--   avaliações existentes não mudam.
-- - treino_anamneses: anamnese de cada profissional para cada aluno, com
--   perguntas abertas, sem nota nem classificação. Privada: só o autor lê
--   (resposta F2).
-- - educadores_fisicos: e-mail de contato e logotipo do próprio educador,
--   para os PDFs que ele gera (resposta H1/R8). O logotipo fica no bucket
--   "identidade", na pasta educadores/<id do educador>.
--
-- Reversão: restaurar proteger_exclusao_avaliacao da migração anterior; drop table treino_anamneses; drop das duas colunas novas;
-- apagar (ou ligar a uma consulta) as avaliações sem consulta e restaurar o
-- NOT NULL de consulta_id.

ALTER TABLE public.avaliacoes_fisicas ALTER COLUMN consulta_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'avaliacoes_fisicas_origem_check') THEN
    ALTER TABLE public.avaliacoes_fisicas
      ADD CONSTRAINT avaliacoes_fisicas_origem_check CHECK (consulta_id IS NOT NULL OR criada_por IS NOT NULL);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.treino_anamneses (
    patient_id uuid NOT NULL,
    profissional_id uuid NOT NULL,
    respostas jsonb NOT NULL,
    revisao integer DEFAULT 0 NOT NULL,
    criada_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizada_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT treino_anamneses_pkey PRIMARY KEY (patient_id, profissional_id),
    CONSTRAINT treino_anamneses_patient_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE,
    CONSTRAINT treino_anamneses_profissional_fkey FOREIGN KEY (profissional_id) REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT treino_anamneses_respostas_check CHECK (jsonb_typeof(respostas) = 'object')
);

ALTER TABLE public.educadores_fisicos
    ADD COLUMN IF NOT EXISTS email_contato text,
    ADD COLUMN IF NOT EXISTS logo_path text;

-- A proteção de exclusão (avaliação finalizada não se apaga) só deixava
-- passar a exclusão em cascata (paciente ou consulta apagados). Sem
-- consulta, a avaliação do educador também fica protegida.
CREATE OR REPLACE FUNCTION public.proteger_exclusao_avaliacao() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.patients WHERE id = OLD.patient_id)
     OR (OLD.consulta_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.consultas WHERE id = OLD.consulta_id)) THEN
    RETURN OLD;
  END IF;
  IF OLD.status = 'finalizada' THEN
    RAISE EXCEPTION 'A avaliação finalizada fica no histórico e não pode ser excluída.' USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END;
$$;