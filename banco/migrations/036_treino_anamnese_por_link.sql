-- Anamnese no Treino com a mesma rotina da Nutrição (SPEC 06/11/2026:
-- cadastro, anamnese, fotos; decisões do cliente em 10/11).
--
-- - A anamnese do Treino usa a mesma tabela das fichas da Nutrição
--   (anamneses): mesmas perguntas, respostas, link do paciente
--   (formularios_links), salvamento e envio. Fica marcada com
--   modulo = 'treino', sem consulta, com o autor em criado_por.
-- - Modelos do Treino em tabela própria (treino_modelos_anamnese), de cada
--   profissional, privados por padrão; "compartilhado" segue a biblioteca de
--   modelos de treino (visível aos profissionais do Treino; usar = cópia).
-- - Quem lê as preenchidas: os profissionais vinculados ao paciente (regra
--   no servidor). A anamnese simples antiga (treino_anamneses) não muda e
--   continua privada.
-- - Aviso de "enviou a anamnese": o do Treino vai para o autor; o da
--   Nutrição continua indo para o nutricionista.
-- - Proteção contra exclusão: passa a valer também sem consulta (antes uma
--   ficha sem consulta escaparia, como ocorreu na avaliação física, T6).
--
-- Reversão: apagar as fichas com modulo = 'treino'; drop das colunas modulo e
-- treino_modelo_id e do check anamneses_origem_check; restaurar o NOT NULL
-- de consulta_id; drop table treino_modelos_anamnese; restaurar as funções
-- proteger_formulario_respondido e aviso_anamnese da migração anterior.

CREATE TABLE IF NOT EXISTS public.treino_modelos_anamnese (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    perguntas jsonb DEFAULT '[]'::jsonb NOT NULL,
    versao integer DEFAULT 1 NOT NULL,
    revisao integer DEFAULT 0 NOT NULL,
    compartilhado boolean DEFAULT false NOT NULL,
    criado_por uuid NOT NULL,
    arquivado_em timestamp with time zone,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT treino_modelos_anamnese_pkey PRIMARY KEY (id),
    CONSTRAINT treino_modelos_anamnese_autor_fkey FOREIGN KEY (criado_por) REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT treino_modelos_anamnese_perguntas_check CHECK (jsonb_typeof(perguntas) = 'array'),
    CONSTRAINT treino_modelos_anamnese_nome_check CHECK (length(btrim(nome)) BETWEEN 1 AND 200)
);

CREATE INDEX IF NOT EXISTS idx_treino_modelos_anamnese_autor ON public.treino_modelos_anamnese (criado_por);

ALTER TABLE public.anamneses ALTER COLUMN consulta_id DROP NOT NULL;
ALTER TABLE public.anamneses
    ADD COLUMN IF NOT EXISTS modulo text DEFAULT 'nutricao' NOT NULL,
    ADD COLUMN IF NOT EXISTS treino_modelo_id uuid REFERENCES public.treino_modelos_anamnese(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'anamneses_origem_check') THEN
    ALTER TABLE public.anamneses ADD CONSTRAINT anamneses_origem_check CHECK (
      (modulo = 'nutricao' AND consulta_id IS NOT NULL)
      OR (modulo = 'treino' AND consulta_id IS NULL AND criado_por IS NOT NULL)
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_anamneses_treino ON public.anamneses (patient_id) WHERE modulo = 'treino';

CREATE OR REPLACE FUNCTION public.proteger_formulario_respondido() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Exclusão em cascata (paciente ou consulta removidos) segue normalmente.
  IF NOT EXISTS (SELECT 1 FROM public.patients WHERE id = OLD.patient_id)
     OR (OLD.consulta_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.consultas WHERE id = OLD.consulta_id)) THEN
    RETURN OLD;
  END IF;
  IF OLD.status <> 'rascunho' OR OLD.enviado_em IS NOT NULL OR OLD.respondido_em IS NOT NULL THEN
    RAISE EXCEPTION 'Formulário enviado, respondido ou concluído: arquive em vez de excluir.';
  END IF;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.aviso_anamnese() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_nome text;
BEGIN
  IF NEW.respondido_em IS NOT NULL AND NEW.respondido_em IS DISTINCT FROM OLD.respondido_em THEN
    IF NEW.modulo = 'treino' THEN
      -- Anamnese do Treino: aviso só para o profissional que a enviou.
      SELECT name INTO v_nome FROM public.patients WHERE id = NEW.patient_id;
      INSERT INTO public.notificacoes_profissionais
             (usuario_id, patient_id, tipo, titulo, corpo, destino, referencia_id, dedup_key)
      VALUES (NEW.criado_por, NEW.patient_id, 'anamnese', coalesce(v_nome, 'Aluno'), 'Enviou a anamnese.',
              '/treino/alunos/' || NEW.patient_id || '/anamnese/' || NEW.id, NEW.id,
              'anamnese:' || NEW.id || ':' || extract(epoch FROM NEW.respondido_em)::bigint || ':' || NEW.criado_por)
      ON CONFLICT (dedup_key) DO NOTHING;
    ELSE
      PERFORM public.avisar_nutricionistas(NEW.patient_id, 'anamnese', NEW.id,
        'anamnese:' || NEW.id || ':' || extract(epoch FROM NEW.respondido_em)::bigint,
        'Enviou a anamnese.',
        '/nutricao/' || NEW.patient_id || '/consultas/' || NEW.consulta_id || '/anamnese/' || NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Aviso ao paciente quando o profissional do Treino envia a anamnese.
ALTER TABLE public.notification_queue DROP CONSTRAINT IF EXISTS notification_queue_notification_type_check;
ALTER TABLE public.notification_queue ADD CONSTRAINT notification_queue_notification_type_check
    CHECK (notification_type = ANY (ARRAY['relatorio', 'devolutiva', 'dieta', 'lembrete_relatorio', 'avaliacao', 'formulario', 'documento',
                                          'formula', 'devolutiva_treino', 'treino_novo', 'formulario_treino']));
