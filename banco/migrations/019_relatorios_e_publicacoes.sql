-- Melhorias de 22/10/2026 (SPEC v1.1 e decisões D1–D10).
--
-- Relatórios:
-- - regras_versao: relatórios novos (2) usam a pergunta de hormônios e a
--   regra de "não tive" nos campos de dificuldade; os antigos (1) ficam como
--   foram respondidos.
-- - hormonios_uso: resposta da nova pergunta (sem pontuação).
-- - pontos_removidos: pontos de atenção removidos pelo nutricionista NESTE
--   relatório ([{codigo, em, por}]); adherence_score passa a ser o score
--   corrigido e adherence_score_original guarda o calculado no envio.
--   O paciente não consegue gravar esses campos (gatilho abaixo).
-- - Devolutiva: rascunho e versões ficam em tabelas só do nutricionista.
--
-- Documentos ao paciente (Fórmulas e Avaliação Física):
-- - publicacoes_paciente: cada envio ou reenvio é um registro novo apontando
--   para o MESMO arquivo (sem cópia). O paciente pode excluir o documento da
--   área dele (D9); o histórico profissional continua.
-- - Nada aqui mexe em dietas nem no ciclo de 33 dias.

ALTER TABLE public.patient_reports ADD COLUMN IF NOT EXISTS regras_versao integer DEFAULT 1 NOT NULL;
ALTER TABLE public.patient_reports ADD COLUMN IF NOT EXISTS hormonios_uso text;
ALTER TABLE public.patient_reports ADD COLUMN IF NOT EXISTS pontos_removidos jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE public.patient_reports ADD COLUMN IF NOT EXISTS adherence_score_original integer;

ALTER TABLE public.patient_reports DROP CONSTRAINT IF EXISTS patient_reports_hormonios_uso_check;
ALTER TABLE public.patient_reports ADD CONSTRAINT patient_reports_hormonios_uso_check
    CHECK (hormonios_uso IS NULL OR hormonios_uso = ANY (ARRAY['uso_correto', 'falhou', 'parou_menos_6_meses', 'nao_usa']));
ALTER TABLE public.patient_reports DROP CONSTRAINT IF EXISTS patient_reports_regras_versao_check;
ALTER TABLE public.patient_reports ADD CONSTRAINT patient_reports_regras_versao_check CHECK (regras_versao = ANY (ARRAY[1, 2]));

-- Relatório recém-enviado nunca chega com pontos removidos nem score corrigido.
CREATE OR REPLACE FUNCTION public.relatorio_novo_sem_correcao() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
  NEW.pontos_removidos := '[]'::jsonb;
  NEW.adherence_score_original := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS relatorio_novo_sem_correcao_trigger ON public.patient_reports;
CREATE TRIGGER relatorio_novo_sem_correcao_trigger BEFORE INSERT ON public.patient_reports
    FOR EACH ROW EXECUTE FUNCTION public.relatorio_novo_sem_correcao();

-- Rascunho da devolutiva (um por relatório). revisao: protege contra uma
-- gravação antiga sobrescrever a mais nova; geracao: só a geração da IA mais
-- recente pode gravar; desatualizada: a regeneração depois de uma remoção
-- não terminou (a tela avisa e oferece tentar de novo).
CREATE TABLE IF NOT EXISTS public.devolutivas_rascunho (
    report_id uuid NOT NULL,
    texto text DEFAULT '' NOT NULL,
    revisao integer DEFAULT 0 NOT NULL,
    editado boolean DEFAULT false NOT NULL,
    geracao integer DEFAULT 0 NOT NULL,
    desatualizada boolean DEFAULT false NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT devolutivas_rascunho_pkey PRIMARY KEY (report_id),
    CONSTRAINT devolutivas_rascunho_report_fkey FOREIGN KEY (report_id) REFERENCES public.patient_reports(id) ON DELETE CASCADE
);

-- Versões guardadas (nunca apagadas): cada geração da IA e o texto editado à
-- mão antes de ser substituído.
CREATE TABLE IF NOT EXISTS public.devolutivas_versoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    report_id uuid NOT NULL,
    numero integer NOT NULL,
    texto text NOT NULL,
    origem text NOT NULL,
    criada_por uuid,
    criada_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT devolutivas_versoes_pkey PRIMARY KEY (id),
    CONSTRAINT devolutivas_versoes_numero_unico UNIQUE (report_id, numero),
    CONSTRAINT devolutivas_versoes_report_fkey FOREIGN KEY (report_id) REFERENCES public.patient_reports(id) ON DELETE CASCADE,
    CONSTRAINT devolutivas_versoes_criada_por_fkey FOREIGN KEY (criada_por) REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT devolutivas_versoes_origem_check CHECK (origem = ANY (ARRAY['ia', 'manual', 'restaurada']))
);

-- Envios de documentos ao paciente.
CREATE TABLE IF NOT EXISTS public.publicacoes_paciente (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    tipo text NOT NULL,
    origem_id uuid NOT NULL,
    bucket text NOT NULL,
    storage_path text NOT NULL,
    titulo text NOT NULL,
    file_name text NOT NULL,
    enviado_por uuid,
    enviado_em timestamp with time zone DEFAULT now() NOT NULL,
    excluido_paciente_em timestamp with time zone,
    CONSTRAINT publicacoes_paciente_pkey PRIMARY KEY (id),
    CONSTRAINT publicacoes_paciente_patient_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE,
    CONSTRAINT publicacoes_paciente_enviado_por_fkey FOREIGN KEY (enviado_por) REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT publicacoes_paciente_tipo_check CHECK (tipo = ANY (ARRAY['formulas', 'avaliacao'])),
    CONSTRAINT publicacoes_paciente_bucket_check CHECK (bucket = ANY (ARRAY['documentos', 'avaliacoes']))
);

CREATE INDEX IF NOT EXISTS idx_publicacoes_paciente_patient ON public.publicacoes_paciente USING btree (patient_id, enviado_em DESC);
CREATE INDEX IF NOT EXISTS idx_publicacoes_paciente_caminho ON public.publicacoes_paciente USING btree (storage_path);

-- Avaliações já enviadas (Fase 4) viram publicações, com o mesmo id do envio
-- (os avisos já vistos continuam vistos).
INSERT INTO public.publicacoes_paciente (id, patient_id, tipo, origem_id, bucket, storage_path, titulo, file_name, enviado_por, enviado_em)
SELECT e.id, e.patient_id, 'avaliacao', e.id, 'avaliacoes', e.storage_path,
       'Avaliação física de ' || to_char(a.data, 'DD/MM/YYYY'), e.file_name, e.enviada_por, e.enviada_em
  FROM public.avaliacoes_envios e
  JOIN public.avaliacoes_fisicas a ON a.id = e.avaliacao_id
ON CONFLICT (id) DO NOTHING;

-- Avisos: novo tipo "publicacao" (indicador na área do paciente) e
-- "formula" (push).
ALTER TABLE public.patient_update_views DROP CONSTRAINT IF EXISTS patient_update_views_update_type_check;
ALTER TABLE public.patient_update_views ADD CONSTRAINT patient_update_views_update_type_check
    CHECK (update_type = ANY (ARRAY['dieta'::text, 'devolutiva'::text, 'avaliacao'::text, 'documento'::text, 'publicacao'::text]));

INSERT INTO public.patient_update_views (patient_id, update_type, reference_id)
SELECT v.patient_id, 'publicacao', v.reference_id
  FROM public.patient_update_views v
 WHERE v.update_type = 'avaliacao'
ON CONFLICT (patient_id, update_type, reference_id) DO NOTHING;

ALTER TABLE public.notification_queue DROP CONSTRAINT IF EXISTS notification_queue_notification_type_check;
ALTER TABLE public.notification_queue ADD CONSTRAINT notification_queue_notification_type_check
    CHECK (notification_type = ANY (ARRAY['relatorio'::text, 'devolutiva'::text, 'dieta'::text, 'lembrete_relatorio'::text,
                                          'avaliacao'::text, 'formulario'::text, 'documento'::text, 'formula'::text]));
