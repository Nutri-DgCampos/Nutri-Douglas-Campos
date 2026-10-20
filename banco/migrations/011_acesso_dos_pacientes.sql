-- Acesso dos pacientes ao aplicativo (indicador de interesse e retenção).
--
-- - ultimo_acesso_em: última vez que o paciente abriu a área do paciente.
-- - app_instalado_em: última vez que abriu pelo app instalado (ícone na
--   tela inicial).
-- Os dois são gravados pela própria área do paciente (no máximo uma vez a
-- cada 30 minutos por aparelho).

ALTER TABLE public.patients
    ADD COLUMN IF NOT EXISTS ultimo_acesso_em timestamp with time zone,
    ADD COLUMN IF NOT EXISTS app_instalado_em timestamp with time zone;

-- Ponto de partida: o último sinal de uso já registrado (login, relatório
-- enviado ou ativação de notificação). Só preenche quem ainda não tem valor.
UPDATE public.patients p
   SET ultimo_acesso_em = sinais.ultimo
  FROM (
    SELECT pa.id,
           GREATEST(
             u.last_sign_in_at,
             (SELECT max(r.created_at) FROM public.patient_reports r WHERE r.patient_id = pa.id),
             (SELECT max(s.updated_at) FROM public.push_subscriptions s WHERE s.patient_id = pa.id)
           ) AS ultimo
      FROM public.patients pa
      JOIN public.users u ON u.id = pa.auth_user_id
  ) sinais
 WHERE sinais.id = p.id
   AND p.ultimo_acesso_em IS NULL
   AND sinais.ultimo IS NOT NULL;
