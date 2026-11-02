-- Módulo de Treino, etapa T3: relatório semanal, devolutiva e lista de atenção.
-- Só acrescenta. Reversão: drop das tabelas abaixo e da coluna/valor novos em
-- notification_queue (nada existente muda de comportamento).
--
-- Respostas do cliente (01/11/2026):
-- - B1: semana de domingo a sábado no horário de Brasília; o relatório da
--   semana fica disponível no domingo 00:00 seguinte.
-- - B2: cada profissional que acompanha o aluno tem o próprio relatório e
--   envia a própria devolutiva.
-- - B3: só gera relatório para quem o profissional marcou "com
--   acompanhamento" (treino_acompanhamentos).
-- - B4: adesão = sessões feitas ÷ planejadas; parcial vale meia sessão; baixa
--   adesão abaixo de 60%, padrão editável por aluno.
-- - B5: metas em texto livre, marcadas à mão como atingidas ou não.
-- - B6: pausas registradas pelo profissional (início e fim).

-- Alunos "com acompanhamento" de cada profissional.
CREATE TABLE IF NOT EXISTS public.treino_acompanhamentos (
    patient_id uuid NOT NULL,
    profissional_id uuid NOT NULL,
    adesao_minima integer DEFAULT 60 NOT NULL,
    -- Primeira semana (domingo) que entra no relatório.
    inicio date NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT treino_acompanhamentos_pkey PRIMARY KEY (patient_id, profissional_id),
    CONSTRAINT treino_acompanhamentos_patient_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE,
    CONSTRAINT treino_acompanhamentos_profissional_fkey FOREIGN KEY (profissional_id) REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT treino_acompanhamentos_adesao_check CHECK (adesao_minima BETWEEN 1 AND 100)
);

-- Metas individuais em texto livre (B5).
CREATE TABLE IF NOT EXISTS public.treino_metas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    profissional_id uuid NOT NULL,
    texto text NOT NULL,
    ativa boolean DEFAULT true NOT NULL,
    criada_em timestamp with time zone DEFAULT now() NOT NULL,
    encerrada_em timestamp with time zone,
    CONSTRAINT treino_metas_pkey PRIMARY KEY (id),
    CONSTRAINT treino_metas_patient_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE,
    CONSTRAINT treino_metas_profissional_fkey FOREIGN KEY (profissional_id) REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT treino_metas_texto_check CHECK (length(btrim(texto)) BETWEEN 1 AND 500)
);

CREATE INDEX IF NOT EXISTS idx_treino_metas_aluno ON public.treino_metas USING btree (patient_id, profissional_id);

-- Pausas autorizadas (férias, lesão, viagem): a semana com pausa não entra
-- na lista de atenção (B6).
CREATE TABLE IF NOT EXISTS public.treino_pausas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    inicio date NOT NULL,
    fim date NOT NULL,
    motivo text,
    criada_por uuid,
    criada_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT treino_pausas_pkey PRIMARY KEY (id),
    CONSTRAINT treino_pausas_patient_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE,
    CONSTRAINT treino_pausas_criada_por_fkey FOREIGN KEY (criada_por) REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT treino_pausas_datas_check CHECK (fim >= inicio)
);

CREATE INDEX IF NOT EXISTS idx_treino_pausas_aluno ON public.treino_pausas USING btree (patient_id, inicio);

-- Relatório da semana: consolidado no fechamento e guardado como cópia
-- (dados), para não mudar depois. Um por aluno, profissional e semana.
CREATE TABLE IF NOT EXISTS public.treino_relatorios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    profissional_id uuid NOT NULL,
    semana_inicio date NOT NULL,
    semana_fim date NOT NULL,
    dados jsonb NOT NULL,
    sem_registros boolean NOT NULL,
    -- Nulo: sem sessões planejadas para medir (não é zero).
    adesao numeric(5,1),
    adesao_minima integer NOT NULL,
    em_pausa boolean DEFAULT false NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    -- Rascunho da devolutiva (só o profissional vê).
    rascunho text DEFAULT '' NOT NULL,
    rascunho_revisao integer DEFAULT 0 NOT NULL,
    rascunho_geracao integer DEFAULT 0 NOT NULL,
    -- Devolutiva enviada (o aluno vê).
    devolutiva text,
    devolutiva_enviada_em timestamp with time zone,
    lida_em timestamp with time zone,
    CONSTRAINT treino_relatorios_pkey PRIMARY KEY (id),
    CONSTRAINT treino_relatorios_unico UNIQUE (patient_id, profissional_id, semana_inicio),
    CONSTRAINT treino_relatorios_patient_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE,
    CONSTRAINT treino_relatorios_profissional_fkey FOREIGN KEY (profissional_id) REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT treino_relatorios_semana_check CHECK (semana_fim = semana_inicio + 6),
    CONSTRAINT treino_relatorios_dados_check CHECK (jsonb_typeof(dados) = 'object'),
    CONSTRAINT treino_relatorios_devolutiva_check CHECK ((devolutiva IS NULL) = (devolutiva_enviada_em IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_treino_relatorios_profissional ON public.treino_relatorios USING btree (profissional_id, semana_inicio DESC);
CREATE INDEX IF NOT EXISTS idx_treino_relatorios_aluno ON public.treino_relatorios USING btree (patient_id, semana_inicio DESC);

-- Devolutiva enviada não muda.
CREATE OR REPLACE FUNCTION public.proteger_devolutiva_do_treino() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.devolutiva IS NOT NULL AND (NEW.devolutiva IS DISTINCT FROM OLD.devolutiva OR NEW.devolutiva_enviada_em IS DISTINCT FROM OLD.devolutiva_enviada_em) THEN
    RAISE EXCEPTION 'Devolutiva já enviada não pode ser alterada.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS proteger_devolutiva_do_treino_trigger ON public.treino_relatorios;
CREATE TRIGGER proteger_devolutiva_do_treino_trigger BEFORE UPDATE ON public.treino_relatorios
    FOR EACH ROW EXECUTE FUNCTION public.proteger_devolutiva_do_treino();

-- Metas marcadas pelo profissional em cada relatório (atingida ou não).
CREATE TABLE IF NOT EXISTS public.treino_metas_semana (
    relatorio_id uuid NOT NULL,
    meta_id uuid NOT NULL,
    atingida boolean NOT NULL,
    marcada_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT treino_metas_semana_pkey PRIMARY KEY (relatorio_id, meta_id),
    CONSTRAINT treino_metas_semana_relatorio_fkey FOREIGN KEY (relatorio_id) REFERENCES public.treino_relatorios(id) ON DELETE CASCADE,
    CONSTRAINT treino_metas_semana_meta_fkey FOREIGN KEY (meta_id) REFERENCES public.treino_metas(id) ON DELETE CASCADE
);

-- Aviso ao aluno quando chega a devolutiva do Treino (B10).
ALTER TABLE public.notification_queue DROP CONSTRAINT IF EXISTS notification_queue_notification_type_check;
ALTER TABLE public.notification_queue ADD CONSTRAINT notification_queue_notification_type_check
    CHECK (notification_type = ANY (ARRAY['relatorio'::text, 'devolutiva'::text, 'dieta'::text, 'lembrete_relatorio'::text,
                                          'avaliacao'::text, 'formulario'::text, 'documento'::text, 'formula'::text,
                                          'devolutiva_treino'::text]));

-- Rascunho da devolutiva do Treino pela IA (B9): registro de uso.
ALTER TABLE public.ia_uso DROP CONSTRAINT IF EXISTS ia_uso_recurso_check;
ALTER TABLE public.ia_uso ADD CONSTRAINT ia_uso_recurso_check CHECK (recurso = ANY (ARRAY[
    'assistente_dieta', 'resumo_anamnese', 'exame', 'treino', 'bioimpedancia', 'devolutiva', 'devolutiva_treino']));
