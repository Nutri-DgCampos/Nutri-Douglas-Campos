-- Módulo de Treino, etapa T3b: relatório semanal por modalidade (resposta
-- Q5) e metas por modalidade.
--
-- - treino_relatorios.modalidade: musculação (padrão; todos os relatórios
--   existentes continuam valendo como estão), corrida ou ciclismo. A chave
--   única passa a incluir a modalidade: um relatório por aluno,
--   profissional, semana e modalidade, cada um com a própria devolutiva.
-- - treino_metas.modalidade: vazio = meta geral (aparece em todos os
--   relatórios do aluno com esse profissional); preenchido = só naquela
--   modalidade.
--
-- Reversão: apagar os relatórios de corrida e ciclismo, recriar a chave
-- treino_relatorios_unico (patient_id, profissional_id, semana_inicio) e
-- remover as duas colunas.

ALTER TABLE public.treino_relatorios ADD COLUMN IF NOT EXISTS modalidade text DEFAULT 'musculacao' NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treino_relatorios_modalidade_check') THEN
    ALTER TABLE public.treino_relatorios
      ADD CONSTRAINT treino_relatorios_modalidade_check CHECK (modalidade = ANY (ARRAY['musculacao', 'corrida', 'ciclismo']));
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treino_relatorios_unico') THEN
    ALTER TABLE public.treino_relatorios DROP CONSTRAINT treino_relatorios_unico;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treino_relatorios_unico_modalidade') THEN
    ALTER TABLE public.treino_relatorios
      ADD CONSTRAINT treino_relatorios_unico_modalidade UNIQUE (patient_id, profissional_id, semana_inicio, modalidade);
  END IF;
END $$;

ALTER TABLE public.treino_metas ADD COLUMN IF NOT EXISTS modalidade text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treino_metas_modalidade_check') THEN
    ALTER TABLE public.treino_metas
      ADD CONSTRAINT treino_metas_modalidade_check CHECK (modalidade IS NULL OR modalidade = ANY (ARRAY['musculacao', 'corrida', 'ciclismo']));
  END IF;
END $$;
