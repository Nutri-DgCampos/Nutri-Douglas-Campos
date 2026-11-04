-- Correção do plano com o ciclo ativo (SPEC Plano Ativo, 04/11/2026).
--
-- Causa: a edição do paciente gravava o plano só em patients.plan; o
-- calendário dos relatórios lê diet_cycles.followup_frequency, que ficava
-- com o plano antigo. A correção grava os dois juntos (rota
-- /api/pacientes/[id]/plano) e:
-- - libera no máximo o relatório previsto mais recente já devido (Opção B),
--   aberto só no dia da correção até 23h59 (S11), ou na janela normal de
--   segunda e terça (S12);
-- - registra cada alteração em plano_alteracoes (RF-08; sem motivo, S10).
--
-- Reversão: drop table plano_alteracoes; drop das colunas
-- relatorio_liberado_semana e relatorio_liberado_ate de diet_cycles.

ALTER TABLE public.diet_cycles
    ADD COLUMN IF NOT EXISTS relatorio_liberado_semana date,
    ADD COLUMN IF NOT EXISTS relatorio_liberado_ate date;

CREATE TABLE IF NOT EXISTS public.plano_alteracoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    cycle_id uuid,
    alterado_por uuid,
    plano_anterior text,
    plano_novo text NOT NULL,
    frequencia_ciclo_anterior text,
    frequencia_ciclo_nova text,
    reaplicacao boolean DEFAULT false NOT NULL,
    relatorio_liberado_semana date,
    modo_liberacao text,
    aviso_enfileirado boolean DEFAULT false NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT plano_alteracoes_pkey PRIMARY KEY (id),
    CONSTRAINT plano_alteracoes_patient_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE,
    CONSTRAINT plano_alteracoes_cycle_fkey FOREIGN KEY (cycle_id) REFERENCES public.diet_cycles(id) ON DELETE SET NULL,
    CONSTRAINT plano_alteracoes_usuario_fkey FOREIGN KEY (alterado_por) REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT plano_alteracoes_modo_check CHECK (modo_liberacao IS NULL OR modo_liberacao = ANY (ARRAY['janela', 'liberacao']))
);

CREATE INDEX IF NOT EXISTS idx_plano_alteracoes_paciente ON public.plano_alteracoes (patient_id, criado_em DESC);
