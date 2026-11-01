-- Módulo de Treino, etapas T7a (papéis e vínculos) e T2 (relato de desconforto).
--
-- Só acrescenta tabelas; nada existente muda.
--
-- - Educador físico: novo papel em profiles.role ('educador_fisico'), com
--   cadastro próprio. Acesso apenas ao Módulo de Treino dos alunos vinculados.
--   O nutricionista é o administrador: vê todos os alunos e cadastra educadores.
-- - Vínculo aluno × educador: histórico preservado (encerrar grava "fim").
-- - Push ao profissional: inscrições e fila próprias, separadas das do paciente
--   (mesmas chaves VAPID e o mesmo service worker).
-- - Relato de desconforto do aluno: gravado sempre; o push é um aviso a mais.
--
-- Reversão (sem perda de dados da Nutrição):
--   drop table public.notificacoes_profissionais, public.push_profissionais,
--     public.treino_desconfortos, public.treino_vinculos, public.educadores_fisicos;
--   update public.profiles set role = null where role = 'educador_fisico';

CREATE TABLE IF NOT EXISTS public.educadores_fisicos (
    usuario_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    nome text NOT NULL CHECK (char_length(btrim(nome)) BETWEEN 2 AND 120),
    cref text CHECK (cref IS NULL OR char_length(cref) <= 40),
    telefone text CHECK (telefone IS NULL OR char_length(telefone) <= 40),
    ativo boolean NOT NULL DEFAULT true,
    criado_por uuid REFERENCES public.users(id) ON DELETE SET NULL,
    criado_em timestamptz NOT NULL DEFAULT now(),
    atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.treino_vinculos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    profissional_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    inicio timestamptz NOT NULL DEFAULT now(),
    fim timestamptz,
    criado_por uuid REFERENCES public.users(id) ON DELETE SET NULL,
    encerrado_por uuid REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT treino_vinculos_periodo CHECK (fim IS NULL OR fim >= inicio)
);

-- Um vínculo ativo por par aluno × profissional.
CREATE UNIQUE INDEX IF NOT EXISTS treino_vinculos_ativo
    ON public.treino_vinculos (patient_id, profissional_id) WHERE fim IS NULL;
CREATE INDEX IF NOT EXISTS treino_vinculos_profissional
    ON public.treino_vinculos (profissional_id) WHERE fim IS NULL;

CREATE TABLE IF NOT EXISTS public.treino_desconfortos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    prescricao_id uuid REFERENCES public.treino_prescricoes(id) ON DELETE SET NULL,
    dia text CHECK (dia IS NULL OR dia IN ('dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab')),
    -- Data do relato no horário de Brasília (entra no relatório da semana).
    data date NOT NULL,
    exercicio text CHECK (exercicio IS NULL OR char_length(exercicio) <= 160),
    regiao text NOT NULL CHECK (char_length(btrim(regiao)) BETWEEN 1 AND 80),
    intensidade smallint NOT NULL CHECK (intensidade BETWEEN 0 AND 10),
    -- Percepção do aluno: desconforto leve (continuou) ou mais acentuado (parou o exercício).
    conduta text NOT NULL CHECK (conduta IN ('continuei', 'parei')),
    comentario text CHECK (comentario IS NULL OR char_length(comentario) <= 1000),
    -- Gerada no aparelho: reenviar o mesmo relato não duplica (base para o offline).
    chave_cliente uuid UNIQUE,
    criado_em timestamptz NOT NULL DEFAULT now(),
    visto_em timestamptz,
    visto_por uuid REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS treino_desconfortos_aluno
    ON public.treino_desconfortos (patient_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS treino_desconfortos_nao_vistos
    ON public.treino_desconfortos (criado_em DESC) WHERE visto_em IS NULL;

CREATE TABLE IF NOT EXISTS public.push_profissionais (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    endpoint text NOT NULL UNIQUE,
    p256dh text NOT NULL,
    auth_key text NOT NULL,
    criado_em timestamptz NOT NULL DEFAULT now(),
    atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_profissionais_usuario ON public.push_profissionais (usuario_id);

CREATE TABLE IF NOT EXISTS public.notificacoes_profissionais (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    patient_id uuid REFERENCES public.patients(id) ON DELETE CASCADE,
    tipo text NOT NULL CHECK (tipo IN ('desconforto')),
    titulo text NOT NULL,
    corpo text NOT NULL,
    destino text NOT NULL,
    referencia_id uuid,
    dedup_key text NOT NULL UNIQUE,
    status text NOT NULL DEFAULT 'pendente'
        CHECK (status IN ('pendente', 'processando', 'enviada', 'falhou', 'sem_dispositivo')),
    tentativas integer NOT NULL DEFAULT 0,
    ultimo_erro text,
    processando_desde timestamptz,
    enviada_em timestamptz,
    criada_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notificacoes_profissionais_pendentes
    ON public.notificacoes_profissionais (criada_em) WHERE status IN ('pendente', 'processando');
