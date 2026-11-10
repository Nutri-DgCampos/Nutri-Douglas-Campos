-- Pedido de vínculo quando o e-mail do aluno já tem cadastro (SPEC de
-- correções do Treino, 10/11/2026, item 003; Opção A aprovada; decisões do
-- cliente em 10/11).
--
-- - Quem decide é quem cadastrou o aluno: o educador dono do aluno próprio
--   (patients.educador_dono_id, que não muda) ou, para paciente da clínica,
--   o nutricionista (para_admin). Com o educador dono desativado, o pedido
--   não é criado (o solicitante é orientado a falar com o administrador).
-- - Aprovar cria o vínculo (treino_vinculos) com o solicitante; nada mais
--   muda (cadastro, vínculos anteriores, planos e pagamentos).
-- - Um pedido pendente por aluno e solicitante. Tudo fica registrado.
--
-- Reversão: drop table treino_pedidos_vinculo; restaurar o CHECK de
-- notificacoes_profissionais.tipo da migração 033.

CREATE TABLE IF NOT EXISTS public.treino_pedidos_vinculo (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    solicitante_id uuid NOT NULL,
    -- Educador que cadastrou o aluno; null quando vai ao nutricionista.
    destinatario_id uuid,
    para_admin boolean DEFAULT false NOT NULL,
    email_informado text NOT NULL,
    mensagem text DEFAULT '' NOT NULL,
    status text DEFAULT 'pendente' NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    decidido_em timestamp with time zone,
    decidido_por uuid,
    CONSTRAINT treino_pedidos_vinculo_pkey PRIMARY KEY (id),
    CONSTRAINT treino_pedidos_vinculo_patient_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE,
    CONSTRAINT treino_pedidos_vinculo_solicitante_fkey FOREIGN KEY (solicitante_id) REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT treino_pedidos_vinculo_destinatario_fkey FOREIGN KEY (destinatario_id) REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT treino_pedidos_vinculo_decidido_por_fkey FOREIGN KEY (decidido_por) REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT treino_pedidos_vinculo_status_check CHECK (status = ANY (ARRAY['pendente', 'aprovado', 'recusado'])),
    CONSTRAINT treino_pedidos_vinculo_mensagem_check CHECK (length(mensagem) <= 1000),
    CONSTRAINT treino_pedidos_vinculo_decisao_check CHECK ((status = 'pendente') = (decidido_em IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS treino_pedidos_vinculo_pendente ON public.treino_pedidos_vinculo (patient_id, solicitante_id) WHERE status = 'pendente';
CREATE INDEX IF NOT EXISTS idx_treino_pedidos_vinculo_destino ON public.treino_pedidos_vinculo (destinatario_id) WHERE status = 'pendente';

-- Aviso ao profissional: pedido recebido e decisão do pedido.
ALTER TABLE public.notificacoes_profissionais DROP CONSTRAINT IF EXISTS notificacoes_profissionais_tipo_check;
ALTER TABLE public.notificacoes_profissionais ADD CONSTRAINT notificacoes_profissionais_tipo_check
    CHECK (tipo = ANY (ARRAY['desconforto', 'anamnese', 'relatorio', 'exames', 'renovacao', 'renovacao_treino', 'pagamento_treino', 'vinculo']));
