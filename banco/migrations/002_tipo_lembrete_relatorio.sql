-- Aceita o tipo de notificacao "lembrete_relatorio" na fila.
--
-- /api/agendar-relatorios grava lembretes com esse tipo, mas a restricao so
-- aceitava relatorio, devolutiva e dieta: todo lembrete era recusado pelo banco.
-- Pode rodar mais de uma vez sem efeito colateral.

ALTER TABLE public.notification_queue
    DROP CONSTRAINT IF EXISTS notification_queue_notification_type_check;

ALTER TABLE public.notification_queue
    ADD CONSTRAINT notification_queue_notification_type_check
    CHECK (notification_type = ANY (ARRAY['relatorio'::text, 'devolutiva'::text, 'dieta'::text, 'lembrete_relatorio'::text]));
