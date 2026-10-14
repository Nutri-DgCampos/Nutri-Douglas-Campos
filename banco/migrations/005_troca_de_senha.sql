-- Senha provisória: definida pelo nutricionista ou pela importação de
-- pacientes. Enquanto estiver marcada, o usuário só consegue trocar a senha.
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS must_change_password boolean DEFAULT false NOT NULL;
