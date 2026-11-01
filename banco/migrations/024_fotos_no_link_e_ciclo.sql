-- Melhorias 01/11/2026, item 3: fotos corporais no link de anamnese e
-- associação de cada foto ao ciclo de dieta.
--
-- - As fotos continuam em fotos_evolucao (o mesmo "Comparativo de fotos"),
--   uma por posição e por dia. O link só completa posições vazias; não
--   substitui foto existente.
-- - ciclo_id: o ciclo de 33 dias que contém a data do envio. Só leitura dos
--   ciclos: nada aqui inicia, reinicia ou prolonga um ciclo.
-- - Foto enviada antes do primeiro ciclo: fica sem ciclo (registro inicial) e
--   é associada ao primeiro ciclo quando ele começar, mantendo a data do envio.
-- - Foto entre dois ciclos (sem ciclo que contenha a data): fica sem ciclo
--   (associação pendente); nenhum vínculo é inventado.
--
-- Reversão:
--   drop trigger foto_no_ciclo on public.fotos_evolucao;
--   drop trigger fotos_iniciais_no_primeiro_ciclo on public.diet_cycles;
--   drop function public.foto_no_ciclo, public.fotos_iniciais_no_primeiro_ciclo;
--   alter table public.fotos_evolucao drop column ciclo_id, drop column origem;

ALTER TABLE public.fotos_evolucao
    ADD COLUMN IF NOT EXISTS ciclo_id uuid REFERENCES public.diet_cycles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'area_paciente';

ALTER TABLE public.fotos_evolucao DROP CONSTRAINT IF EXISTS fotos_evolucao_origem_check;
ALTER TABLE public.fotos_evolucao ADD CONSTRAINT fotos_evolucao_origem_check
    CHECK (origem IN ('area_paciente', 'link'));

-- Ciclo que contém a data da foto (o mais recente, se houver sobreposição).
CREATE OR REPLACE FUNCTION public.foto_no_ciclo() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  SELECT c.id INTO NEW.ciclo_id
    FROM public.diet_cycles c
   WHERE c.patient_id = NEW.patient_id
     AND c.start_date <= NEW.data AND c.end_date >= NEW.data
   ORDER BY c.start_date DESC
   LIMIT 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS foto_no_ciclo ON public.fotos_evolucao;
CREATE TRIGGER foto_no_ciclo BEFORE INSERT OR UPDATE OF data ON public.fotos_evolucao
    FOR EACH ROW EXECUTE FUNCTION public.foto_no_ciclo();

-- Primeiro ciclo do paciente: recebe as fotos enviadas antes dele.
CREATE OR REPLACE FUNCTION public.fotos_iniciais_no_primeiro_ciclo() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.diet_cycles WHERE patient_id = NEW.patient_id AND id <> NEW.id) THEN
    UPDATE public.fotos_evolucao
       SET ciclo_id = NEW.id
     WHERE patient_id = NEW.patient_id AND ciclo_id IS NULL AND data <= NEW.end_date;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fotos_iniciais_no_primeiro_ciclo ON public.diet_cycles;
CREATE TRIGGER fotos_iniciais_no_primeiro_ciclo AFTER INSERT ON public.diet_cycles
    FOR EACH ROW EXECUTE FUNCTION public.fotos_iniciais_no_primeiro_ciclo();

-- Fotos já existentes: ciclo que contém a data; as anteriores ao primeiro
-- ciclo vão para o primeiro ciclo.
UPDATE public.fotos_evolucao f
   SET ciclo_id = (
     SELECT c.id FROM public.diet_cycles c
      WHERE c.patient_id = f.patient_id AND c.start_date <= f.data AND c.end_date >= f.data
      ORDER BY c.start_date DESC LIMIT 1)
 WHERE f.ciclo_id IS NULL;

UPDATE public.fotos_evolucao f
   SET ciclo_id = (
     SELECT c.id FROM public.diet_cycles c
      WHERE c.patient_id = f.patient_id ORDER BY c.start_date, c.cycle_number LIMIT 1)
 WHERE f.ciclo_id IS NULL
   AND f.data < (SELECT min(c.start_date) FROM public.diet_cycles c WHERE c.patient_id = f.patient_id);
