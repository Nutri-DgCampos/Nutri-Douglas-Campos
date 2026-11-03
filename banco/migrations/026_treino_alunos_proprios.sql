-- Módulo de Treino, etapa T7b: alunos próprios do educador físico.
--
-- Resposta A7 do cliente (01/11/2026): o educador cadastra os próprios alunos.
-- Eles ficam invisíveis ao nutricionista e entram na Área do Paciente vendo só
-- o Treino.
--
-- Só acrescenta:
-- - patients.educador_dono_id: vazio = paciente da clínica (todos os cadastros
--   existentes continuam assim); preenchido = aluno próprio daquele educador.
--   O dono não muda depois do cadastro (gatilho abaixo) e a conta do educador
--   não pode ser apagada enquanto tiver alunos (o aluno nunca "cai" para a
--   clínica).
-- - patients.plan deixa de ser obrigatório só para o aluno próprio (o plano
--   da Nutrição não se aplica a ele). Paciente da clínica continua exigindo.
-- - Os avisos ao nutricionista (migração 023) ignoram os alunos próprios.
--
-- Reversão (sem perda de dados da Nutrição):
--   drop trigger proteger_dono_do_aluno on public.patients;
--   drop function public.proteger_dono_do_aluno();
--   delete dos alunos próprios (educador_dono_id is not null), se desejado;
--   alter table public.patients drop constraint patients_plano_da_clinica,
--     alter column plan set not null, drop column educador_dono_id;
--   reaplicar a função avisar_nutricionistas da migração 023.

ALTER TABLE public.patients
    ADD COLUMN IF NOT EXISTS educador_dono_id uuid REFERENCES public.users(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS patients_educador_dono
    ON public.patients (educador_dono_id) WHERE educador_dono_id IS NOT NULL;

ALTER TABLE public.patients ALTER COLUMN plan DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patients_plano_da_clinica') THEN
    ALTER TABLE public.patients
      ADD CONSTRAINT patients_plano_da_clinica CHECK (plan IS NOT NULL OR educador_dono_id IS NOT NULL);
  END IF;
END $$;

-- O dono é definido no cadastro e não muda: nem a clínica "adota" um aluno
-- próprio, nem um paciente da clínica passa a ser escondido dela.
CREATE OR REPLACE FUNCTION public.proteger_dono_do_aluno() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.educador_dono_id IS DISTINCT FROM OLD.educador_dono_id THEN
    RAISE EXCEPTION 'O responsável pelo cadastro do aluno não pode ser alterado.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS proteger_dono_do_aluno ON public.patients;
CREATE TRIGGER proteger_dono_do_aluno BEFORE UPDATE OF educador_dono_id ON public.patients
    FOR EACH ROW EXECUTE FUNCTION public.proteger_dono_do_aluno();

-- Mesma função da migração 023, sem avisar sobre alunos próprios.
CREATE OR REPLACE FUNCTION public.avisar_nutricionistas(
    p_paciente uuid, p_tipo text, p_referencia uuid, p_chave text, p_corpo text, p_destino text,
    p_espera interval DEFAULT interval '0 seconds', p_corpo_varios text DEFAULT NULL
) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_nome text;
BEGIN
  SELECT name INTO v_nome FROM public.patients WHERE id = p_paciente AND educador_dono_id IS NULL;
  IF NOT FOUND THEN
    RETURN;
  END IF;
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
