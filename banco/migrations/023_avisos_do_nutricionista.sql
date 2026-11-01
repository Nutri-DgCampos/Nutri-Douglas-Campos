-- Melhorias 01/11/2026, item 2: avisos ao nutricionista (sino + web push).
--
-- Reaproveita a fila dos profissionais da migração 021
-- (notificacoes_profissionais), que passa a ser também o histórico do sino:
-- uma linha por evento e por nutricionista, com o estado de leitura.
--
-- Os avisos nascem por gatilho, na mesma transação do envio do paciente
-- (outbox): se o envio foi gravado, o aviso existe, com ou sem push.
-- - anamnese: quando o paciente envia as respostas (respondido_em muda);
-- - relatório nutricional: quando o relatório é gravado;
-- - exames: um aviso por operação de envio (lote), com a contagem de arquivos;
-- - renovação: quando a solicitação é gravada.
-- A chave dedup_key evita duplicar avisos em novas tentativas.
-- O texto traz só o nome completo e o tipo do evento (nada clínico).
--
-- Reversão:
--   drop trigger aviso_relatorio on public.patient_reports;
--   drop trigger aviso_renovacao on public.renewal_requests;
--   drop trigger aviso_anamnese on public.anamneses;
--   drop trigger aviso_exames on public.blood_exams;
--   drop function public.avisar_nutricionistas, public.aviso_relatorio, public.aviso_renovacao,
--     public.aviso_anamnese, public.aviso_exames;
--   alter table public.blood_exams drop column lote_envio;
--   alter table public.push_profissionais drop column ativo, drop column descricao;
--   delete from public.notificacoes_profissionais where tipo <> 'desconforto';
--   alter table public.notificacoes_profissionais drop column lido_em, drop column quantidade, drop column liberar_em;

ALTER TABLE public.notificacoes_profissionais
    ADD COLUMN IF NOT EXISTS lido_em timestamptz,
    ADD COLUMN IF NOT EXISTS quantidade integer NOT NULL DEFAULT 1,
    -- O push só sai a partir deste momento (exames: espera o lote terminar).
    ADD COLUMN IF NOT EXISTS liberar_em timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.notificacoes_profissionais DROP CONSTRAINT IF EXISTS notificacoes_profissionais_tipo_check;
ALTER TABLE public.notificacoes_profissionais ADD CONSTRAINT notificacoes_profissionais_tipo_check
    CHECK (tipo IN ('desconforto', 'anamnese', 'relatorio', 'exames', 'renovacao'));

CREATE INDEX IF NOT EXISTS notificacoes_profissionais_sino
    ON public.notificacoes_profissionais (usuario_id, criada_em DESC);

-- Aparelhos: o profissional pode pausar o push de um aparelho sem removê-lo.
ALTER TABLE public.push_profissionais
    ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS descricao text CHECK (descricao IS NULL OR char_length(descricao) <= 120);

-- Exames enviados juntos pelo paciente compartilham o mesmo lote.
ALTER TABLE public.blood_exams ADD COLUMN IF NOT EXISTS lote_envio uuid;

-- Um aviso por nutricionista. Repetição da mesma chave: soma a quantidade
-- (lote de exames) e adia o push, sem criar outro aviso.
CREATE OR REPLACE FUNCTION public.avisar_nutricionistas(
    p_paciente uuid, p_tipo text, p_referencia uuid, p_chave text, p_corpo text, p_destino text,
    p_espera interval DEFAULT interval '0 seconds', p_corpo_varios text DEFAULT NULL
) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_nome text;
BEGIN
  SELECT name INTO v_nome FROM public.patients WHERE id = p_paciente;
  INSERT INTO public.notificacoes_profissionais
         (usuario_id, patient_id, tipo, titulo, corpo, destino, referencia_id, dedup_key, liberar_em)
  SELECT pr.id, p_paciente, p_tipo, coalesce(v_nome, 'Paciente'), p_corpo, p_destino, p_referencia,
         p_chave || ':' || pr.id, now() + p_espera
    FROM public.profiles pr
   WHERE pr.role = 'nutricionista'
  ON CONFLICT (dedup_key) DO UPDATE
     SET quantidade = notificacoes_profissionais.quantidade + 1,
         corpo = coalesce(replace(p_corpo_varios, '{n}', (notificacoes_profissionais.quantidade + 1)::text), notificacoes_profissionais.corpo),
         liberar_em = now() + p_espera;
END;
$$;

CREATE OR REPLACE FUNCTION public.aviso_relatorio() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  PERFORM public.avisar_nutricionistas(NEW.patient_id, 'relatorio', NEW.id, 'relatorio:' || NEW.id,
    'Enviou o relatório nutricional.', '/pacientes/' || NEW.patient_id || '/relatorio/' || NEW.id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.aviso_renovacao() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  PERFORM public.avisar_nutricionistas(NEW.patient_id, 'renovacao', NEW.id, 'renovacao:' || NEW.id,
    'Solicitou a renovação do plano.', '/alertas#renovacoes');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.aviso_anamnese() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.respondido_em IS NOT NULL AND NEW.respondido_em IS DISTINCT FROM OLD.respondido_em THEN
    PERFORM public.avisar_nutricionistas(NEW.patient_id, 'anamnese', NEW.id,
      'anamnese:' || NEW.id || ':' || extract(epoch FROM NEW.respondido_em)::bigint,
      'Enviou a anamnese.',
      '/nutricao/' || NEW.patient_id || '/consultas/' || NEW.consulta_id || '/anamnese/' || NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

-- Só exames enviados pelo paciente (a rota do paciente sempre grava o lote).
CREATE OR REPLACE FUNCTION public.aviso_exames() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.lote_envio IS NOT NULL THEN
    PERFORM public.avisar_nutricionistas(NEW.patient_id, 'exames', NEW.lote_envio, 'exames:' || NEW.lote_envio,
      'Enviou 1 exame.', '/exames?paciente=' || NEW.patient_id, interval '20 seconds', 'Enviou {n} exames.');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS aviso_relatorio ON public.patient_reports;
CREATE TRIGGER aviso_relatorio AFTER INSERT ON public.patient_reports
    FOR EACH ROW EXECUTE FUNCTION public.aviso_relatorio();

DROP TRIGGER IF EXISTS aviso_renovacao ON public.renewal_requests;
CREATE TRIGGER aviso_renovacao AFTER INSERT ON public.renewal_requests
    FOR EACH ROW EXECUTE FUNCTION public.aviso_renovacao();

DROP TRIGGER IF EXISTS aviso_anamnese ON public.anamneses;
CREATE TRIGGER aviso_anamnese AFTER UPDATE OF respondido_em ON public.anamneses
    FOR EACH ROW EXECUTE FUNCTION public.aviso_anamnese();

DROP TRIGGER IF EXISTS aviso_exames ON public.blood_exams;
CREATE TRIGGER aviso_exames AFTER INSERT ON public.blood_exams
    FOR EACH ROW EXECUTE FUNCTION public.aviso_exames();
