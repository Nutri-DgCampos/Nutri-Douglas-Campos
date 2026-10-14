-- Recalcula os pacientes cadastrados em "Já sou paciente em acompanhamento"
-- com a regra antiga.
--
-- Antes, "Semana N" era gravada como N semanas concluídas: o ciclo começava
-- N semanas antes do cadastro. Agora "Semana N" quer dizer que o paciente está
-- na semana N (N - 1 semanas concluídas). Para esses pacientes:
--   - o ciclo passa a começar N - 1 semanas antes do cadastro (fim = início + 33 dias);
--   - retroactive_completed_weeks passa a N - 1;
--   - os relatórios já enviados são renumerados pela agenda nova.
--
-- Pacientes da regra antiga: retroactive_completed_weeks = current_followup_week.
-- Depois desta migration os dois deixam de ser iguais, então ela pode rodar
-- de novo sem efeito.

CREATE TEMP TABLE cadastro_antigo ON COMMIT DROP AS
SELECT
    p.id AS patient_id,
    dc.id AS cycle_id,
    p.current_followup_week AS semana,
    dc.retroactive_registered_at AS cadastro,
    CASE lower(trim(dc.followup_frequency))
        WHEN 'semanal' THEN 7
        WHEN 'quinzenal' THEN 14
        ELSE 28
    END AS intervalo,
    CASE lower(trim(dc.followup_frequency))
        WHEN 'semanal' THEN 4
        WHEN 'quinzenal' THEN 2
        ELSE 1
    END AS quantidade
FROM public.patients p
JOIN public.diet_cycles dc
  ON dc.patient_id = p.id
 AND dc.retroactive_registered_at IS NOT NULL
WHERE p.retroactive_registration
  AND p.current_followup_week BETWEEN 1 AND 4
  AND p.retroactive_completed_weeks = p.current_followup_week;

-- 1. Datas do ciclo.
UPDATE public.diet_cycles dc
SET start_date = a.cadastro - 7 * (a.semana - 1),
    end_date = a.cadastro - 7 * (a.semana - 1) + 33
FROM cadastro_antigo a
WHERE dc.id = a.cycle_id;

-- 2. Número de cada relatório já enviado, pela agenda nova
--    (mesma conta de lib/cronograma.ts, invertida).
UPDATE public.patient_reports r
SET cycle_report_number = n.numero
FROM (
    SELECT
        r.id,
        a.quantidade,
        round(
            CASE
                WHEN a.semana > 1 THEN
                    -- Contagem a partir da segunda-feira da semana do cadastro.
                    (r.scheduled_week_start
                        - (a.cadastro - (extract(isodow FROM a.cadastro)::int - 1))
                        + 7 * (a.semana - 1))::numeric
                ELSE
                    (r.scheduled_week_start - dc.start_date)::numeric
            END / a.intervalo
        )::int AS numero
    FROM public.patient_reports r
    JOIN cadastro_antigo a ON a.cycle_id = r.cycle_id
    JOIN public.diet_cycles dc ON dc.id = r.cycle_id
    WHERE r.scheduled_week_start IS NOT NULL
) n
WHERE r.id = n.id
  AND n.numero BETWEEN 1 AND n.quantidade;

-- 3. Semanas concluídas antes do cadastro.
UPDATE public.patients p
SET retroactive_completed_weeks = a.semana - 1
FROM cadastro_antigo a
WHERE p.id = a.patient_id;
