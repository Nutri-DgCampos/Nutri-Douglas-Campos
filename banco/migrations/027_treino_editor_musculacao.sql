-- Módulo de Treino, etapa T4a: editor de musculação (VIS-03), biblioteca de
-- exercícios, academias e modelos.
--
-- Só acrescenta:
-- - treino_prescricoes ganha "programa": o rascunho do profissional (editável,
--   uma linha por programa) e as versões publicadas daquele programa (cada
--   envio é uma linha nova e imutável, versão 1, 2, 3...). Arquivar não apaga
--   nada: some da lista e deixa de valer para o aluno. As prescrições já
--   existentes (externas, importadas pelo aluno) continuam iguais.
-- - treino_exercicios: biblioteca compartilhada. Lista inicial montada por
--   nós (resposta C1), para revisão do cliente; os profissionais acrescentam.
--   Arquiva-se, não se apaga (pode estar em prescrições).
-- - treino_academias e treino_academia_do_aluno: equipamentos disponíveis
--   (resposta C5), para o editor avisar quando o exercício usa algo que a
--   academia do aluno não tem. O profissional pode prescrever mesmo assim.
-- - treino_modelos: treinos salvos sem dados de aluno, privados ou
--   compartilhados.
-- - Push ao aluno quando o profissional envia um treino novo.
-- - Registro de uso da IA do editor.
--
-- Reversão: drop das tabelas novas e das colunas novas de treino_prescricoes
-- (as prescrições profissionais publicadas podem ser apagadas antes, se
-- desejado); restaurar os CHECKs de notification_queue e ia_uso da 025.

ALTER TABLE public.treino_prescricoes
    ADD COLUMN IF NOT EXISTS programa_id uuid,
    ADD COLUMN IF NOT EXISTS titulo text,
    ADD COLUMN IF NOT EXISTS objetivo text,
    ADD COLUMN IF NOT EXISTS revisao integer DEFAULT 0 NOT NULL,
    ADD COLUMN IF NOT EXISTS atualizada_em timestamp with time zone DEFAULT now() NOT NULL,
    ADD COLUMN IF NOT EXISTS arquivada_em timestamp with time zone,
    ADD COLUMN IF NOT EXISTS arquivada_por uuid REFERENCES public.users(id) ON DELETE SET NULL,
    -- Treino importado no editor: origem e original guardados (arquivo no
    -- bucket "treinos" do aluno ou o texto colado), para revisão humana.
    ADD COLUMN IF NOT EXISTS importacao jsonb;

-- Um rascunho por programa; versões publicadas numeradas dentro do programa.
CREATE UNIQUE INDEX IF NOT EXISTS treino_prescricoes_rascunho_do_programa
    ON public.treino_prescricoes (programa_id) WHERE status = 'rascunho';
CREATE UNIQUE INDEX IF NOT EXISTS treino_prescricoes_versao_do_programa
    ON public.treino_prescricoes (programa_id, versao) WHERE status = 'publicada' AND programa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_treino_prescricoes_autor
    ON public.treino_prescricoes (criada_por, patient_id) WHERE origem = 'profissional';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treino_prescricoes_programa_check') THEN
    ALTER TABLE public.treino_prescricoes
      ADD CONSTRAINT treino_prescricoes_programa_check CHECK (origem <> 'profissional' OR programa_id IS NOT NULL);
  END IF;
END $$;

-- Biblioteca de exercícios.
CREATE TABLE IF NOT EXISTS public.treino_exercicios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    -- Nome normalizado (sem acento, minúsculo): evita duplicatas.
    chave text NOT NULL,
    grupo text NOT NULL,
    grupos_secundarios text[] DEFAULT '{}' NOT NULL,
    -- Todos os equipamentos que o exercício exige (vazio = peso corporal).
    equipamentos text[] DEFAULT '{}' NOT NULL,
    instrucoes text,
    video_url text,
    -- Item da lista inicial: só o administrador altera.
    base boolean DEFAULT false NOT NULL,
    criado_por uuid,
    arquivado_em timestamp with time zone,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT treino_exercicios_pkey PRIMARY KEY (id),
    CONSTRAINT treino_exercicios_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT treino_exercicios_nome_check CHECK (length(btrim(nome)) BETWEEN 2 AND 120),
    CONSTRAINT treino_exercicios_video_check CHECK (video_url IS NULL OR video_url ~ '^https://(www\.|m\.)?(youtube\.com|youtu\.be)/')
);

CREATE UNIQUE INDEX IF NOT EXISTS treino_exercicios_chave_ativa
    ON public.treino_exercicios (chave) WHERE arquivado_em IS NULL;

-- Academias e equipamentos.
CREATE TABLE IF NOT EXISTS public.treino_academias (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    -- Academia em casa / equipamentos próprios do aluno.
    domestica boolean DEFAULT false NOT NULL,
    equipamentos text[] DEFAULT '{}' NOT NULL,
    criada_por uuid,
    arquivada_em timestamp with time zone,
    criada_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizada_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT treino_academias_pkey PRIMARY KEY (id),
    CONSTRAINT treino_academias_criada_por_fkey FOREIGN KEY (criada_por) REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT treino_academias_nome_check CHECK (length(btrim(nome)) BETWEEN 2 AND 120)
);

CREATE TABLE IF NOT EXISTS public.treino_academia_do_aluno (
    patient_id uuid NOT NULL,
    academia_id uuid NOT NULL,
    definida_por uuid,
    definida_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT treino_academia_do_aluno_pkey PRIMARY KEY (patient_id),
    CONSTRAINT treino_academia_do_aluno_patient_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE,
    CONSTRAINT treino_academia_do_aluno_academia_fkey FOREIGN KEY (academia_id) REFERENCES public.treino_academias(id) ON DELETE RESTRICT,
    CONSTRAINT treino_academia_do_aluno_definida_por_fkey FOREIGN KEY (definida_por) REFERENCES public.users(id) ON DELETE SET NULL
);

-- Modelos de treino (sem dados de aluno).
CREATE TABLE IF NOT EXISTS public.treino_modelos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    modalidade text DEFAULT 'musculacao' NOT NULL,
    plano jsonb NOT NULL,
    compartilhado boolean DEFAULT false NOT NULL,
    criado_por uuid NOT NULL,
    arquivado_em timestamp with time zone,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT treino_modelos_pkey PRIMARY KEY (id),
    CONSTRAINT treino_modelos_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT treino_modelos_modalidade_check CHECK (modalidade = ANY (ARRAY['musculacao', 'corrida', 'ciclismo'])),
    CONSTRAINT treino_modelos_plano_check CHECK (jsonb_typeof(plano) = 'object'),
    CONSTRAINT treino_modelos_nome_check CHECK (length(btrim(nome)) BETWEEN 2 AND 120)
);

-- Push ao aluno: treino novo do profissional.
ALTER TABLE public.notification_queue DROP CONSTRAINT IF EXISTS notification_queue_notification_type_check;
ALTER TABLE public.notification_queue ADD CONSTRAINT notification_queue_notification_type_check
    CHECK (notification_type = ANY (ARRAY['relatorio'::text, 'devolutiva'::text, 'dieta'::text, 'lembrete_relatorio'::text,
                                          'avaliacao'::text, 'formulario'::text, 'documento'::text, 'formula'::text,
                                          'devolutiva_treino'::text, 'treino_novo'::text]));

-- IA do editor de treino.
ALTER TABLE public.ia_uso DROP CONSTRAINT IF EXISTS ia_uso_recurso_check;
ALTER TABLE public.ia_uso ADD CONSTRAINT ia_uso_recurso_check CHECK (recurso = ANY (ARRAY[
    'assistente_dieta', 'resumo_anamnese', 'exame', 'treino', 'bioimpedancia', 'devolutiva', 'devolutiva_treino',
    'assistente_treino', 'importacao_treino']));

-- Lista inicial de exercícios (C1), para revisão do cliente.
INSERT INTO public.treino_exercicios (nome, chave, grupo, equipamentos, base)
SELECT v.nome, public.normalizar_texto(v.nome), v.grupo, v.equipamentos, true
  FROM (VALUES
    ('Supino reto com barra', 'Peito', ARRAY['Barra e anilhas', 'Banco']),
    ('Supino reto com halteres', 'Peito', ARRAY['Halteres', 'Banco']),
    ('Supino inclinado com barra', 'Peito', ARRAY['Barra e anilhas', 'Banco inclinável']),
    ('Supino inclinado com halteres', 'Peito', ARRAY['Halteres', 'Banco inclinável']),
    ('Supino máquina', 'Peito', ARRAY['Supino máquina']),
    ('Crucifixo com halteres', 'Peito', ARRAY['Halteres', 'Banco']),
    ('Crucifixo no peck deck', 'Peito', ARRAY['Peck deck']),
    ('Cross over', 'Peito', ARRAY['Polia (cross over)']),
    ('Flexão de braços', 'Peito', ARRAY[]::text[]),
    ('Puxada frontal', 'Costas', ARRAY['Puxador alto']),
    ('Barra fixa', 'Costas', ARRAY['Barra fixa']),
    ('Remada curvada com barra', 'Costas', ARRAY['Barra e anilhas']),
    ('Remada unilateral com halter', 'Costas', ARRAY['Halteres', 'Banco']),
    ('Remada baixa', 'Costas', ARRAY['Remada baixa (polia)']),
    ('Remada máquina', 'Costas', ARRAY['Remada máquina']),
    ('Pulldown na polia', 'Costas', ARRAY['Polia (cross over)']),
    ('Desenvolvimento com halteres', 'Ombro', ARRAY['Halteres', 'Banco']),
    ('Desenvolvimento com barra', 'Ombro', ARRAY['Barra e anilhas']),
    ('Desenvolvimento máquina', 'Ombro', ARRAY['Desenvolvimento máquina']),
    ('Elevação lateral com halteres', 'Ombro', ARRAY['Halteres']),
    ('Elevação lateral na polia', 'Ombro', ARRAY['Polia (cross over)']),
    ('Elevação frontal com halteres', 'Ombro', ARRAY['Halteres']),
    ('Crucifixo inverso no peck deck', 'Ombro', ARRAY['Peck deck']),
    ('Face pull', 'Ombro', ARRAY['Polia (cross over)']),
    ('Rosca direta com barra', 'Bíceps', ARRAY['Barra e anilhas']),
    ('Rosca alternada com halteres', 'Bíceps', ARRAY['Halteres']),
    ('Rosca martelo', 'Bíceps', ARRAY['Halteres']),
    ('Rosca Scott', 'Bíceps', ARRAY['Banco Scott']),
    ('Rosca na polia', 'Bíceps', ARRAY['Polia (cross over)']),
    ('Rosca concentrada', 'Bíceps', ARRAY['Halteres', 'Banco']),
    ('Tríceps na polia', 'Tríceps', ARRAY['Polia (cross over)']),
    ('Tríceps corda', 'Tríceps', ARRAY['Polia (cross over)']),
    ('Tríceps testa', 'Tríceps', ARRAY['Barra e anilhas', 'Banco']),
    ('Tríceps francês com halter', 'Tríceps', ARRAY['Halteres']),
    ('Mergulho nas paralelas', 'Tríceps', ARRAY['Paralelas']),
    ('Tríceps no banco', 'Tríceps', ARRAY['Banco']),
    ('Rosca de punho', 'Antebraço', ARRAY['Halteres']),
    ('Abdominal supra', 'Abdome', ARRAY[]::text[]),
    ('Abdominal infra', 'Abdome', ARRAY[]::text[]),
    ('Prancha', 'Abdome', ARRAY[]::text[]),
    ('Abdominal na polia', 'Abdome', ARRAY['Polia (cross over)']),
    ('Elevação de pernas na barra', 'Abdome', ARRAY['Barra fixa']),
    ('Elevação pélvica', 'Glúteo', ARRAY['Barra e anilhas', 'Banco']),
    ('Ponte de glúteo', 'Glúteo', ARRAY[]::text[]),
    ('Glúteo na máquina', 'Glúteo', ARRAY['Glúteo máquina']),
    ('Glúteo na polia (coice)', 'Glúteo', ARRAY['Polia (cross over)']),
    ('Cadeira abdutora', 'Glúteo', ARRAY['Cadeira abdutora']),
    ('Agachamento livre', 'Quadríceps', ARRAY['Barra e anilhas']),
    ('Agachamento no Smith', 'Quadríceps', ARRAY['Smith']),
    ('Agachamento goblet', 'Quadríceps', ARRAY['Halteres']),
    ('Agachamento búlgaro', 'Quadríceps', ARRAY['Halteres', 'Banco']),
    ('Leg press 45°', 'Quadríceps', ARRAY['Leg press 45°']),
    ('Hack', 'Quadríceps', ARRAY['Hack']),
    ('Cadeira extensora', 'Quadríceps', ARRAY['Cadeira extensora']),
    ('Afundo com halteres', 'Quadríceps', ARRAY['Halteres']),
    ('Mesa flexora', 'Isquiotibiais', ARRAY['Mesa flexora']),
    ('Cadeira flexora', 'Isquiotibiais', ARRAY['Cadeira flexora']),
    ('Stiff com barra', 'Isquiotibiais', ARRAY['Barra e anilhas']),
    ('Stiff com halteres', 'Isquiotibiais', ARRAY['Halteres']),
    ('Cadeira adutora', 'Adutores', ARRAY['Cadeira adutora']),
    ('Panturrilha em pé', 'Panturrilha', ARRAY['Panturrilha em pé (máquina)']),
    ('Panturrilha sentado', 'Panturrilha', ARRAY['Panturrilha sentado (máquina)']),
    ('Panturrilha no leg press', 'Panturrilha', ARRAY['Leg press 45°']),
    ('Esteira', 'Cardio', ARRAY['Esteira']),
    ('Bicicleta ergométrica', 'Cardio', ARRAY['Bicicleta ergométrica']),
    ('Elíptico', 'Cardio', ARRAY['Elíptico']),
    ('Escada', 'Cardio', ARRAY['Escada']),
    ('Remo ergômetro', 'Cardio', ARRAY['Remo ergômetro']),
    ('Alongamento', 'Outro', ARRAY[]::text[]),
    ('Mobilidade', 'Outro', ARRAY[]::text[])
  ) AS v(nome, grupo, equipamentos)
 WHERE NOT EXISTS (SELECT 1 FROM public.treino_exercicios e WHERE e.chave = public.normalizar_texto(v.nome) AND e.arquivado_em IS NULL);
