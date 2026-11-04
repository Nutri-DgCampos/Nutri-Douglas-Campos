-- Módulo de Treino, etapa T8: planos, contratos, pagamentos, bloqueio e
-- encerramento do aluno próprio.
--
-- Respostas G1–G5, R9 e R10 do cliente:
-- - G1: cada profissional cria os próprios planos e preços (treino_planos).
-- - G2: cada profissional confirma o pagamento dos próprios alunos.
-- - G3: formas de pagamento iguais às da Nutrição: comprovante anexado pelo
--   aluno (Pix/transferência) ou dinheiro recebido pelo profissional.
--   Comprovante anexado não é pagamento confirmado.
-- - G4: tolerância após o vencimento, padrão editável por profissional
--   (treino_configuracoes; padrão inicial 7 dias).
-- - G5: Nutrição e Treino pagos e renovados separadamente: nada aqui toca em
--   payments/renewal_requests da Nutrição.
-- - Contrato guarda cópia do plano (nome, preço, duração): mudar o preço do
--   plano não muda contratos já feitos (SPEC 12).
-- - R9: com contrato vencido e fora da tolerância, o aluno vê o histórico,
--   mas não o treino novo nem registra (regra no servidor). Aluno sem nenhum
--   contrato de Treino continua como hoje (sem bloqueio).
-- - R10: o educador desativa o aluno próprio (reversível; o acesso cai na
--   hora) ou o exclui de vez, só a pedido do aluno.
--
-- Reversão: drop das tabelas treino_renovacoes, treino_contratos,
-- treino_planos e treino_configuracoes; drop das colunas desativado_* de
-- patients; restaurar o CHECK de notificacoes_profissionais.tipo.

CREATE TABLE IF NOT EXISTS public.treino_configuracoes (
    profissional_id uuid NOT NULL,
    tolerancia_dias integer DEFAULT 7 NOT NULL,
    atualizada_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT treino_configuracoes_pkey PRIMARY KEY (profissional_id),
    CONSTRAINT treino_configuracoes_profissional_fkey FOREIGN KEY (profissional_id) REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT treino_configuracoes_tolerancia_check CHECK (tolerancia_dias BETWEEN 0 AND 60)
);

CREATE TABLE IF NOT EXISTS public.treino_planos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profissional_id uuid NOT NULL,
    nome text NOT NULL,
    descricao text,
    preco_centavos integer NOT NULL,
    duracao_dias integer NOT NULL,
    modalidades text[] DEFAULT '{}' NOT NULL,
    inclui_relatorio boolean DEFAULT true NOT NULL,
    arquivado_em timestamp with time zone,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT treino_planos_pkey PRIMARY KEY (id),
    CONSTRAINT treino_planos_profissional_fkey FOREIGN KEY (profissional_id) REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT treino_planos_nome_check CHECK (length(btrim(nome)) BETWEEN 2 AND 80),
    CONSTRAINT treino_planos_preco_check CHECK (preco_centavos BETWEEN 0 AND 100000000),
    CONSTRAINT treino_planos_duracao_check CHECK (duracao_dias BETWEEN 1 AND 730),
    CONSTRAINT treino_planos_modalidades_check CHECK (modalidades <@ ARRAY['musculacao', 'corrida', 'ciclismo'])
);

CREATE INDEX IF NOT EXISTS idx_treino_planos_profissional ON public.treino_planos (profissional_id) WHERE arquivado_em IS NULL;

CREATE TABLE IF NOT EXISTS public.treino_contratos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    profissional_id uuid NOT NULL,
    plano_id uuid,
    -- Cópia do plano no momento do contrato.
    plano_nome text NOT NULL,
    preco_centavos integer NOT NULL,
    modalidades text[] DEFAULT '{}' NOT NULL,
    inicio date NOT NULL,
    vencimento date NOT NULL,
    tolerancia_dias integer NOT NULL,
    -- Comprovante anexado pelo aluno (bucket "comprovantes"): ainda não é
    -- pagamento confirmado.
    comprovante_path text,
    comprovante_em timestamp with time zone,
    forma_pagamento text,
    confirmado_em timestamp with time zone,
    confirmado_por uuid,
    cancelado_em timestamp with time zone,
    observacao text,
    criado_por uuid,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT treino_contratos_pkey PRIMARY KEY (id),
    CONSTRAINT treino_contratos_patient_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE,
    CONSTRAINT treino_contratos_profissional_fkey FOREIGN KEY (profissional_id) REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT treino_contratos_plano_fkey FOREIGN KEY (plano_id) REFERENCES public.treino_planos(id) ON DELETE SET NULL,
    CONSTRAINT treino_contratos_confirmado_por_fkey FOREIGN KEY (confirmado_por) REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT treino_contratos_datas_check CHECK (vencimento >= inicio),
    CONSTRAINT treino_contratos_forma_check CHECK (forma_pagamento IS NULL OR forma_pagamento = ANY (ARRAY['comprovante', 'dinheiro'])),
    CONSTRAINT treino_contratos_confirmacao_check CHECK ((confirmado_em IS NULL) = (forma_pagamento IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_treino_contratos_aluno ON public.treino_contratos (patient_id, vencimento DESC);

-- Pedido de renovação do aluno (não reativa nem confirma nada sozinho).
CREATE TABLE IF NOT EXISTS public.treino_renovacoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    profissional_id uuid NOT NULL,
    plano_id uuid,
    observacao text,
    criada_em timestamp with time zone DEFAULT now() NOT NULL,
    atendida_em timestamp with time zone,
    CONSTRAINT treino_renovacoes_pkey PRIMARY KEY (id),
    CONSTRAINT treino_renovacoes_patient_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE,
    CONSTRAINT treino_renovacoes_profissional_fkey FOREIGN KEY (profissional_id) REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT treino_renovacoes_plano_fkey FOREIGN KEY (plano_id) REFERENCES public.treino_planos(id) ON DELETE SET NULL
);

-- Aluno próprio desativado pelo educador (R10): o acesso cai na hora.
ALTER TABLE public.patients
    ADD COLUMN IF NOT EXISTS desativado_em timestamp with time zone,
    ADD COLUMN IF NOT EXISTS desativado_por uuid REFERENCES public.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patients_desativado_check') THEN
    ALTER TABLE public.patients ADD CONSTRAINT patients_desativado_check CHECK (desativado_em IS NULL OR educador_dono_id IS NOT NULL);
  END IF;
END $$;

-- Avisos ao profissional: pedido de renovação e comprovante anexado.
ALTER TABLE public.notificacoes_profissionais DROP CONSTRAINT IF EXISTS notificacoes_profissionais_tipo_check;
ALTER TABLE public.notificacoes_profissionais ADD CONSTRAINT notificacoes_profissionais_tipo_check
    CHECK (tipo = ANY (ARRAY['desconforto', 'anamnese', 'relatorio', 'exames', 'renovacao', 'renovacao_treino', 'pagamento_treino']));
