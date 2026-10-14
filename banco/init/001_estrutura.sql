-- ========================================================================
-- Estrutura inicial do banco - Acompanhamento Nutricional
-- ========================================================================
-- Roda automaticamente na PRIMEIRA criacao do volume do Postgres
-- (pasta montada em /docker-entrypoint-initdb.d).
-- Alteracoes posteriores entram em ./banco/migrations e sao aplicadas pelo deploy.sh.
--
-- Origem: dump do Supabase, sem o que era especifico dele:
--   - schema auth      -> tabela public.users
--   - politicas RLS    -> lib/servidor/permissoes.ts
--   - storage.objects  -> arquivos no volume do app
--   - pg_cron          -> container "cron"

SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;

-- ------------------------------------------------------------------------
-- Usuarios e sessao
-- ------------------------------------------------------------------------

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_sign_in_at timestamp with time zone,
    CONSTRAINT users_pkey PRIMARY KEY (id),
    CONSTRAINT users_email_minusculo CHECK (email = lower(email))
);

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);

CREATE TABLE public.password_reset_tokens (
    token_hash text NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (token_hash),
    CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES public.users(id) ON DELETE CASCADE
);

CREATE INDEX idx_password_reset_tokens_user ON public.password_reset_tokens USING btree (user_id);

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    role text,
    CONSTRAINT profiles_pkey PRIMARY KEY (id),
    CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES public.users(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------------------
-- Tabelas do sistema
-- ------------------------------------------------------------------------

CREATE TABLE public.cadastro_rate_limits (
    identificador text NOT NULL,
    tentativas integer DEFAULT 0 NOT NULL,
    janela_inicio timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cadastro_rate_limits_pkey PRIMARY KEY (identificador)
);

CREATE TABLE public.patients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    phone text,
    objective text,
    plan text NOT NULL,
    payment_status text DEFAULT 'Pendente'::text NOT NULL,
    important_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    initial_weight numeric,
    training_weekly_goal integer DEFAULT 0,
    cardio_weekly_goal integer DEFAULT 0,
    individual_goal text,
    auth_user_id uuid,
    plan_start_date date,
    access_expires_at timestamp with time zone,
    reactivation_requested_at timestamp with time zone,
    current_followup_week integer,
    retroactive_registration boolean DEFAULT false NOT NULL,
    retroactive_completed_weeks integer DEFAULT 0 NOT NULL,
    CONSTRAINT patients_pkey PRIMARY KEY (id),
    CONSTRAINT patients_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES public.users(id),
    CONSTRAINT patients_current_followup_week_check CHECK (((current_followup_week IS NULL) OR ((current_followup_week >= 1) AND (current_followup_week <= 4)))),
    CONSTRAINT patients_payment_status_check CHECK ((payment_status = ANY (ARRAY['Ativo'::text, 'Pendente'::text, 'Cancelado'::text, 'Inativo'::text]))),
    CONSTRAINT patients_plan_check CHECK ((plan = ANY (ARRAY['Semanal'::text, 'Quinzenal'::text, 'Mensal'::text]))),
    CONSTRAINT retroactive_completed_weeks_check CHECK (((retroactive_completed_weeks >= 0) AND (retroactive_completed_weeks <= 4)))
);

CREATE TABLE public.diet_cycles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    patient_id uuid NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    followup_frequency text NOT NULL,
    status text DEFAULT 'ativo'::text NOT NULL,
    cycle_number integer NOT NULL,
    closed_at timestamp with time zone,
    retroactive_registered_at date,
    CONSTRAINT diet_cycles_pkey PRIMARY KEY (id),
    CONSTRAINT diet_cycles_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id)
);

CREATE TABLE public.diet_deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    diet_date date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'em_andamento'::text NOT NULL,
    cycle_id uuid,
    CONSTRAINT diet_deliveries_pkey PRIMARY KEY (id),
    CONSTRAINT diet_deliveries_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES public.diet_cycles(id),
    CONSTRAINT diet_deliveries_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE
);

CREATE TABLE public.diet_delivery_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    delivery_id uuid NOT NULL,
    file_name text NOT NULL,
    storage_path text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT diet_delivery_files_pkey PRIMARY KEY (id),
    CONSTRAINT diet_delivery_files_delivery_id_fkey FOREIGN KEY (delivery_id) REFERENCES public.diet_deliveries(id) ON DELETE CASCADE
);

CREATE TABLE public.notification_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    notification_type text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    target_url text DEFAULT '/area-paciente'::text NOT NULL,
    scheduled_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone,
    status text DEFAULT 'pendente'::text NOT NULL,
    reference_id uuid,
    dedup_key text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    processing_started_at timestamp with time zone,
    CONSTRAINT notification_queue_pkey PRIMARY KEY (id),
    CONSTRAINT notification_queue_dedup_key_key UNIQUE (dedup_key),
    CONSTRAINT notification_queue_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE,
    CONSTRAINT notification_queue_notification_type_check CHECK ((notification_type = ANY (ARRAY['relatorio'::text, 'devolutiva'::text, 'dieta'::text, 'lembrete_relatorio'::text]))),
    CONSTRAINT notification_queue_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'processando'::text, 'enviada'::text, 'falhou'::text, 'cancelada'::text])))
);

CREATE TABLE public.patient_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    report_date date DEFAULT CURRENT_DATE NOT NULL,
    diet_days integer,
    diet_score integer,
    diet_changed boolean,
    diet_change_notes text,
    diet_difficulty text,
    water_goal_days integer,
    water_liters numeric(4,2),
    water_score integer,
    urine_color text,
    training_applicable boolean DEFAULT true,
    training_planned integer,
    training_completed integer,
    training_score integer,
    training_intensity text,
    same_training_time text,
    cardio_applicable boolean DEFAULT true,
    cardio_planned integer,
    cardio_completed integer,
    cardio_score integer,
    sleep_goal_applicable boolean DEFAULT true,
    sleep_goal_days integer,
    sleep_quality text,
    sleep_score integer,
    sleep_difficulty text,
    wake_disposition text,
    off_plan_count integer,
    off_plan_foods text,
    off_plan_reason text,
    off_plan_score integer,
    supplements_applicable boolean DEFAULT true,
    supplements_days integer,
    supplements_reason text,
    supplements_score integer,
    individual_goal_applicable boolean DEFAULT true,
    individual_goal text,
    individual_goal_planned integer,
    individual_goal_completed integer,
    individual_goal_difficulty text,
    individual_goal_score integer,
    weight numeric(6,2),
    stool_consistency text,
    acne_hair_loss text,
    libido text,
    alcohol_use text,
    medication_changes text,
    general_notes text,
    applicable_points integer,
    earned_points integer,
    adherence_score integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'pendente'::text NOT NULL,
    diet_change_equivalent boolean,
    sleep_hours numeric,
    feedback_text text,
    cycle_id uuid,
    cycle_report_number integer,
    scheduled_week_start date,
    CONSTRAINT patient_reports_pkey PRIMARY KEY (id),
    CONSTRAINT patient_reports_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES public.diet_cycles(id),
    CONSTRAINT patient_reports_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE,
    CONSTRAINT patient_reports_adherence_score_check CHECK (((adherence_score >= 0) AND (adherence_score <= 100))),
    CONSTRAINT patient_reports_applicable_points_check CHECK (((applicable_points >= 1) AND (applicable_points <= 100))),
    CONSTRAINT patient_reports_cardio_score_check CHECK (((cardio_score >= 0) AND (cardio_score <= 5))),
    CONSTRAINT patient_reports_diet_days_check CHECK (((diet_days >= 0) AND (diet_days <= 7))),
    CONSTRAINT patient_reports_diet_score_check CHECK (((diet_score >= 0) AND (diet_score <= 30))),
    CONSTRAINT patient_reports_earned_points_check CHECK (((earned_points >= 0) AND (earned_points <= 100))),
    CONSTRAINT patient_reports_individual_goal_score_check CHECK (((individual_goal_score >= 0) AND (individual_goal_score <= 10))),
    CONSTRAINT patient_reports_off_plan_score_check CHECK (((off_plan_score >= 0) AND (off_plan_score <= 15))),
    CONSTRAINT patient_reports_sleep_goal_days_check CHECK (((sleep_goal_days >= 0) AND (sleep_goal_days <= 7))),
    CONSTRAINT patient_reports_sleep_score_check CHECK (((sleep_score >= 0) AND (sleep_score <= 10))),
    CONSTRAINT patient_reports_supplements_days_check CHECK (((supplements_days >= 0) AND (supplements_days <= 7))),
    CONSTRAINT patient_reports_supplements_score_check CHECK (((supplements_score >= 0) AND (supplements_score <= 5))),
    CONSTRAINT patient_reports_training_score_check CHECK (((training_score >= 0) AND (training_score <= 10))),
    CONSTRAINT patient_reports_water_goal_days_check CHECK (((water_goal_days >= 0) AND (water_goal_days <= 7))),
    CONSTRAINT patient_reports_water_score_check CHECK (((water_score >= 0) AND (water_score <= 15)))
);

CREATE TABLE public.patient_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    alert_type text NOT NULL,
    message text NOT NULL,
    status text DEFAULT 'pendente'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    acknowledged_at timestamp with time zone,
    last_report_id uuid,
    reference_date timestamp with time zone,
    CONSTRAINT patient_alerts_pkey PRIMARY KEY (id),
    CONSTRAINT patient_alerts_last_report_id_fkey FOREIGN KEY (last_report_id) REFERENCES public.patient_reports(id) ON DELETE SET NULL,
    CONSTRAINT patient_alerts_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE
);

CREATE TABLE public.patient_progress (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    weight numeric(6,2) NOT NULL,
    notes text,
    measured_at date DEFAULT CURRENT_DATE NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    adherence_score integer,
    CONSTRAINT patient_progress_pkey PRIMARY KEY (id),
    CONSTRAINT patient_progress_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE,
    CONSTRAINT patient_progress_adherence_score_check CHECK (((adherence_score >= 0) AND (adherence_score <= 100)))
);

CREATE TABLE public.patient_registration_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    phone text NOT NULL,
    objective text NOT NULL,
    status text DEFAULT 'Pendente'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT patient_registration_requests_pkey PRIMARY KEY (id),
    CONSTRAINT patient_registration_requests_status_check CHECK ((status = ANY (ARRAY['Pendente'::text, 'Concluído'::text, 'Cancelado'::text])))
);

CREATE TABLE public.patient_update_views (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    update_type text NOT NULL,
    reference_id uuid NOT NULL,
    viewed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT patient_update_views_pkey PRIMARY KEY (id),
    CONSTRAINT patient_update_views_patient_id_update_type_reference_id_key UNIQUE (patient_id, update_type, reference_id),
    CONSTRAINT patient_update_views_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE,
    CONSTRAINT patient_update_views_update_type_check CHECK ((update_type = ANY (ARRAY['dieta'::text, 'devolutiva'::text])))
);

CREATE TABLE public.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    cycle_id uuid,
    status text DEFAULT 'pendente'::text NOT NULL,
    receipt_file_path text,
    receipt_uploaded_at timestamp with time zone,
    confirmed_at timestamp with time zone,
    patient_id uuid,
    CONSTRAINT payments_pkey PRIMARY KEY (id),
    CONSTRAINT payments_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES public.diet_cycles(id),
    CONSTRAINT payments_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id)
);

CREATE TABLE public.push_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth_key text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id),
    CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint),
    CONSTRAINT push_subscriptions_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE
);

CREATE TABLE public.renewal_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    cycle_id uuid,
    last_weight numeric,
    status text DEFAULT 'pendente'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    requested_plan text,
    CONSTRAINT renewal_requests_pkey PRIMARY KEY (id),
    CONSTRAINT renewal_requests_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES public.diet_cycles(id) ON DELETE SET NULL,
    CONSTRAINT renewal_requests_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------------------
-- Indices
-- ------------------------------------------------------------------------

CREATE UNIQUE INDEX diet_deliveries_one_in_progress_per_patient ON public.diet_deliveries USING btree (patient_id) WHERE (status = 'em_andamento'::text);
CREATE INDEX idx_notification_queue_patient ON public.notification_queue USING btree (patient_id);
CREATE INDEX idx_notification_queue_pending ON public.notification_queue USING btree (scheduled_at) WHERE (status = 'pendente'::text);
CREATE UNIQUE INDEX idx_patient_reports_cycle_scheduled_week_unique ON public.patient_reports USING btree (cycle_id, scheduled_week_start) WHERE ((cycle_id IS NOT NULL) AND (scheduled_week_start IS NOT NULL));
CREATE INDEX idx_patient_update_views_patient ON public.patient_update_views USING btree (patient_id);
CREATE INDEX idx_push_subscriptions_patient ON public.push_subscriptions USING btree (patient_id);
CREATE UNIQUE INDEX patient_alerts_unique_pending ON public.patient_alerts USING btree (patient_id, alert_type) WHERE (status = 'pendente'::text);
CREATE UNIQUE INDEX payments_unique_cycle_id ON public.payments USING btree (cycle_id) WHERE (cycle_id IS NOT NULL);

-- ------------------------------------------------------------------------
-- Funcoes
-- ------------------------------------------------------------------------

CREATE FUNCTION public.atualizar_acesso_apos_pagamento() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.status = 'confirmado'
     AND NEW.confirmed_at IS NOT NULL
     AND (
       TG_OP = 'INSERT'
       OR OLD.status IS DISTINCT FROM 'confirmado'
     )
  THEN
    UPDATE public.patients
    SET
      access_expires_at = NEW.confirmed_at + INTERVAL '30 days',
      payment_status = 'Ativo',
      reactivation_requested_at = NULL
    WHERE id = NEW.patient_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.criar_pagamento_ao_iniciar_ciclo() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  insert into public.payments (
    patient_id,
    cycle_id,
    status
  )
  values (
    new.patient_id,
    new.id,
    'pendente'
  )
  on conflict (cycle_id)
  where cycle_id is not null
  do nothing;

  return new;
end;
$$;

CREATE FUNCTION public.consultar_notificacoes_interrompidas() RETURNS TABLE(id uuid, patient_id uuid, notification_type text, attempts integer, processing_started_at timestamp with time zone)
    LANGUAGE sql
    AS $$
  select
    nq.id,
    nq.patient_id,
    nq.notification_type,
    nq.attempts,
    nq.processing_started_at
  from public.notification_queue as nq
  where nq.status = 'processando'
    and nq.processing_started_at < now() - interval '10 minutes'
  order by nq.processing_started_at asc;
$$;

CREATE FUNCTION public.finalizar_notificacao(p_notificacao_id uuid, p_sucesso boolean, p_erro text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
declare
  linhas_atualizadas integer;
begin
  update public.notification_queue
  set
    status = case
      when p_sucesso then 'enviada'
      else 'falhou'
    end,
    sent_at = case
      when p_sucesso then now()
      else null
    end,
    last_error = case
      when p_sucesso then null
      else left(coalesce(p_erro, 'Erro não informado.'), 1000)
    end
  where id = p_notificacao_id
    and status = 'processando';

  get diagnostics linhas_atualizadas = row_count;

  return linhas_atualizadas = 1;
end;
$$;

CREATE FUNCTION public.reservar_proxima_notificacao() RETURNS SETOF public.notification_queue
    LANGUAGE plpgsql
    AS $$
declare
  notificacao_reservada uuid;
begin
  select nq.id
  into notificacao_reservada
  from public.notification_queue as nq
  where nq.status = 'pendente'
    and nq.scheduled_at <= now()
  order by nq.scheduled_at asc, nq.created_at asc
  limit 1
  for update skip locked;

  if notificacao_reservada is null then
    return;
  end if;

  return query
  update public.notification_queue as nq
  set
    status = 'processando',
    attempts = nq.attempts + 1,
    processing_started_at = now()
  where nq.id = notificacao_reservada
  returning nq.*;
end;
$$;

CREATE FUNCTION public.inativar_pacientes_vencidos() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN

  -- Identifica os pacientes que serão inativados
  -- e conclui seus ciclos ativos.
  UPDATE public.diet_cycles AS dc
  SET
    status = 'concluido',
    closed_at = now()
  FROM public.patients AS p
  WHERE dc.patient_id = p.id
    AND dc.status = 'ativo'
    AND p.access_expires_at IS NOT NULL
    AND p.access_expires_at + INTERVAL '15 days' <= now()
    AND p.payment_status IS DISTINCT FROM 'Inativo'
    AND p.reactivation_requested_at IS NULL;

  -- Inativa os pacientes após o período de tolerância.
  UPDATE public.patients
  SET payment_status = 'Inativo'
  WHERE access_expires_at IS NOT NULL
    AND access_expires_at + INTERVAL '15 days' <= now()
    AND payment_status IS DISTINCT FROM 'Inativo'
    AND reactivation_requested_at IS NULL;

END;
$$;

CREATE FUNCTION public.iniciar_ciclo_dieta(p_patient_id uuid, p_start_date date, p_end_date date, p_followup_frequency text) RETURNS integer
    LANGUAGE plpgsql
    AS $$
declare
  v_next_number integer;
begin
  -- Bloqueia o paciente durante a troca de ciclos
  perform 1
  from public.patients
  where id = p_patient_id
  for update;

  if not found then
    raise exception 'Paciente não encontrado';
  end if;

  -- Calcula o próximo número do ciclo
  select coalesce(max(cycle_number), 0) + 1
  into v_next_number
  from public.diet_cycles
  where patient_id = p_patient_id;

  -- Encerra os ciclos ativos anteriores
  update public.diet_cycles
  set
    status = 'concluido',
    closed_at = now()
  where patient_id = p_patient_id
    and status = 'ativo';

  -- Cria o novo ciclo
  insert into public.diet_cycles (
    patient_id,
    start_date,
    end_date,
    followup_frequency,
    status,
    cycle_number
  )
  values (
    p_patient_id,
    p_start_date,
    p_end_date,
    p_followup_frequency,
    'ativo',
    v_next_number
  );

  return v_next_number;
end;
$$;

CREATE FUNCTION public.validar_data_relatorio_ciclo(p_patient_id uuid, p_cycle_id uuid, p_scheduled_week_start date) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  select
    case
      when p_cycle_id is null then true

      else exists (
        select 1
        from public.diet_cycles dc
        where dc.id = p_cycle_id
          and dc.patient_id = p_patient_id
          and (
            dc.retroactive_registered_at is null
            or (
              p_scheduled_week_start is not null
              and p_scheduled_week_start >=
                (
                  dc.retroactive_registered_at
                  - (
                    (extract(
                      isodow from dc.retroactive_registered_at
                    )::integer - 1)
                  )
                )
            )
          )
      )
    end;
$$;

CREATE FUNCTION public.verificar_limite_cadastro(p_identificador text) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
declare
  v_tentativas integer;
begin
  if p_identificador is null
     or length(p_identificador) < 1
     or length(p_identificador) > 200 then
    return false;
  end if;

  insert into public.cadastro_rate_limits (
    identificador,
    tentativas,
    janela_inicio
  )
  values (
    p_identificador,
    1,
    now()
  )
  on conflict (identificador)
  do update set
    tentativas =
      case
        when public.cadastro_rate_limits.janela_inicio
             <= now() - interval '15 minutes'
        then 1
        else public.cadastro_rate_limits.tentativas + 1
      end,
    janela_inicio =
      case
        when public.cadastro_rate_limits.janela_inicio
             <= now() - interval '15 minutes'
        then now()
        else public.cadastro_rate_limits.janela_inicio
      end
  returning tentativas into v_tentativas;

  return v_tentativas <= 5;
end;
$$;

-- ------------------------------------------------------------------------
-- Triggers
-- ------------------------------------------------------------------------

CREATE TRIGGER atualizar_acesso_apos_pagamento_trigger AFTER INSERT OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.atualizar_acesso_apos_pagamento();

CREATE TRIGGER criar_pagamento_ao_iniciar_ciclo_trigger AFTER INSERT ON public.diet_cycles FOR EACH ROW EXECUTE FUNCTION public.criar_pagamento_ao_iniciar_ciclo();

-- ------------------------------------------------------------------------
-- Controle de migrations (mesmo esquema do deploy.sh)
-- ------------------------------------------------------------------------

CREATE TABLE public.schema_migrations (
    id serial PRIMARY KEY,
    migration_name varchar(255) NOT NULL UNIQUE,
    executed_at timestamp with time zone DEFAULT now() NOT NULL
);
