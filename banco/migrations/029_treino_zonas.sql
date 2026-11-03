-- Módulo de Treino, etapa T4c: zonas individuais do aluno para os editores
-- de corrida e ciclismo.
--
-- Só acrescenta treino_zonas: uma linha por aluno e modalidade, com as
-- zonas de FC e de ritmo informadas pelo profissional (E1, sem fórmula) e,
-- no ciclismo, o FTP e as zonas de potência (padrão: 7 zonas de Coggan,
-- R2; editáveis à mão). Compartilhada pelos profissionais que acompanham o
-- aluno. Os planos de corrida e ciclismo usam a tabela treino_prescricoes
-- já existente (modalidade corrida/ciclismo).
--
-- Reversão: drop table treino_zonas.

CREATE TABLE IF NOT EXISTS public.treino_zonas (
    patient_id uuid NOT NULL,
    modalidade text NOT NULL,
    zonas jsonb NOT NULL,
    atualizado_por uuid,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT treino_zonas_pkey PRIMARY KEY (patient_id, modalidade),
    CONSTRAINT treino_zonas_patient_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE,
    CONSTRAINT treino_zonas_atualizado_por_fkey FOREIGN KEY (atualizado_por) REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT treino_zonas_modalidade_check CHECK (modalidade = ANY (ARRAY['corrida', 'ciclismo'])),
    CONSTRAINT treino_zonas_objeto_check CHECK (jsonb_typeof(zonas) = 'object')
);
