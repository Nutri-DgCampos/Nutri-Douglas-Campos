-- Módulo de Treino, etapa T4b: registro do aluno em corrida e ciclismo, com
-- tênis, bicicleta e consumo durante o treino (SPEC complementar 6.3 e 7.3).
--
-- Só acrescenta:
-- - treino_sessoes.kcal: calorias da sessão de musculação informadas pelo
--   aluno (resposta C1: o sistema não estima calorias).
-- - treino_equipamentos: tênis e bicicletas do aluno (P4). Quilometragem
--   acumulada = km inicial + distâncias que o aluno registrou com o
--   equipamento (nunca a planejada). Trocar o equipamento de uma atividade
--   corrige a soma sozinho, sem duplicar. Tênis tem aviso de troca (R1:
--   500 km por padrão, o profissional altera por aluno e por tênis);
--   bicicleta não tem aviso de desgaste (sem critério aprovado).
-- - treino_atividades: corrida ou pedal registrado pelo aluno. Todos os
--   números são informados por ele a partir do equipamento dele (distância,
--   tempo, FC, RPE, calorias, ganho de altitude, potência, cadência, TSS):
--   nada é estimado. chave_cliente garante que reenviar (sem internet, T5)
--   não duplica.
-- - treino_consumos: hidratação, alimentação e suplementação durante a
--   atividade (P5): várias entradas, com horário ou tempo de treino. Nada é
--   obrigatório e nada é calculado (sem macros ou eletrólitos). Correções
--   ficam registradas (removido_em em vez de apagar).
--
-- Reversão: drop das três tabelas novas e da coluna treino_sessoes.kcal.

ALTER TABLE public.treino_sessoes ADD COLUMN IF NOT EXISTS kcal integer;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treino_sessoes_kcal_check') THEN
    ALTER TABLE public.treino_sessoes ADD CONSTRAINT treino_sessoes_kcal_check CHECK (kcal IS NULL OR kcal BETWEEN 0 AND 20000);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.treino_equipamentos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    tipo text NOT NULL,
    apelido text NOT NULL,
    marca text,
    modelo text,
    -- Bicicleta: estrada, mtb ou indoor.
    categoria text,
    km_inicial numeric(8,1) DEFAULT 0 NOT NULL,
    inicio_uso date,
    -- Aviso de troca do tênis (R1). Nulo na bicicleta.
    alerta_km numeric(8,1),
    aposentado_em timestamp with time zone,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT treino_equipamentos_pkey PRIMARY KEY (id),
    CONSTRAINT treino_equipamentos_patient_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE,
    CONSTRAINT treino_equipamentos_tipo_check CHECK (tipo = ANY (ARRAY['tenis', 'bicicleta'])),
    CONSTRAINT treino_equipamentos_categoria_check CHECK (categoria IS NULL OR (tipo = 'bicicleta' AND categoria = ANY (ARRAY['estrada', 'mtb', 'indoor']))),
    CONSTRAINT treino_equipamentos_alerta_check CHECK (alerta_km IS NULL OR (tipo = 'tenis' AND alerta_km BETWEEN 1 AND 10000)),
    CONSTRAINT treino_equipamentos_km_check CHECK (km_inicial BETWEEN 0 AND 100000),
    CONSTRAINT treino_equipamentos_apelido_check CHECK (length(btrim(apelido)) BETWEEN 1 AND 60)
);

CREATE INDEX IF NOT EXISTS idx_treino_equipamentos_patient ON public.treino_equipamentos (patient_id, tipo);

CREATE TABLE IF NOT EXISTS public.treino_atividades (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    modalidade text NOT NULL,
    -- Idempotência do envio (o aparelho gera; reenvio não duplica).
    chave_cliente uuid NOT NULL,
    -- Sessão prescrita (editores de corrida e ciclismo, T4c), quando houver.
    prescricao_id uuid,
    sessao_indice integer,
    data date NOT NULL,
    situacao text,
    data_efetiva date,
    motivo text,
    observacao text,
    equipamento_id uuid,
    distancia_km numeric(7,2),
    duracao_segundos integer,
    fc_media integer,
    fc_max integer,
    rpe numeric(3,1),
    kcal integer,
    elevacao_m integer,
    potencia_media integer,
    potencia_normalizada integer,
    cadencia_media integer,
    tss numeric(6,1),
    -- Hora em que o aluno registrou no aparelho (pode chegar depois, T5).
    registrada_em timestamp with time zone DEFAULT now() NOT NULL,
    criada_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizada_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT treino_atividades_pkey PRIMARY KEY (id),
    CONSTRAINT treino_atividades_chave_cliente UNIQUE (chave_cliente),
    CONSTRAINT treino_atividades_patient_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE,
    CONSTRAINT treino_atividades_prescricao_fkey FOREIGN KEY (prescricao_id) REFERENCES public.treino_prescricoes(id) ON DELETE SET NULL,
    CONSTRAINT treino_atividades_equipamento_fkey FOREIGN KEY (equipamento_id) REFERENCES public.treino_equipamentos(id) ON DELETE SET NULL,
    CONSTRAINT treino_atividades_modalidade_check CHECK (modalidade = ANY (ARRAY['corrida', 'ciclismo'])),
    CONSTRAINT treino_atividades_situacao_check CHECK (situacao IS NULL OR situacao = ANY (ARRAY['concluido', 'parcial', 'nao_concluido', 'reagendado'])),
    CONSTRAINT treino_atividades_reagendada_check CHECK (situacao IS DISTINCT FROM 'reagendado' OR data_efetiva IS NOT NULL),
    CONSTRAINT treino_atividades_valores_check CHECK (
        (distancia_km IS NULL OR distancia_km BETWEEN 0 AND 1000)
        AND (duracao_segundos IS NULL OR duracao_segundos BETWEEN 0 AND 172800)
        AND (fc_media IS NULL OR fc_media BETWEEN 20 AND 250)
        AND (fc_max IS NULL OR fc_max BETWEEN 20 AND 250)
        AND (rpe IS NULL OR rpe BETWEEN 0 AND 10)
        AND (kcal IS NULL OR kcal BETWEEN 0 AND 20000)
        AND (elevacao_m IS NULL OR elevacao_m BETWEEN 0 AND 20000)
        AND (potencia_media IS NULL OR potencia_media BETWEEN 0 AND 3000)
        AND (potencia_normalizada IS NULL OR potencia_normalizada BETWEEN 0 AND 3000)
        AND (cadencia_media IS NULL OR cadencia_media BETWEEN 0 AND 250)
        AND (tss IS NULL OR tss BETWEEN 0 AND 2000))
);

CREATE INDEX IF NOT EXISTS idx_treino_atividades_patient ON public.treino_atividades (patient_id, data DESC);
CREATE INDEX IF NOT EXISTS idx_treino_atividades_equipamento ON public.treino_atividades (equipamento_id) WHERE equipamento_id IS NOT NULL;

-- O equipamento da atividade é do mesmo aluno, e tênis só em corrida,
-- bicicleta só em ciclismo.
CREATE OR REPLACE FUNCTION public.conferir_equipamento_da_atividade() RETURNS trigger
    LANGUAGE plpgsql AS $$
DECLARE
  v_tipo text;
BEGIN
  IF NEW.equipamento_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT tipo INTO v_tipo FROM public.treino_equipamentos WHERE id = NEW.equipamento_id AND patient_id = NEW.patient_id;
  IF v_tipo IS NULL OR (NEW.modalidade = 'corrida' AND v_tipo <> 'tenis') OR (NEW.modalidade = 'ciclismo' AND v_tipo <> 'bicicleta') THEN
    RAISE EXCEPTION 'Equipamento inválido para esta atividade.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS conferir_equipamento_da_atividade ON public.treino_atividades;
CREATE TRIGGER conferir_equipamento_da_atividade BEFORE INSERT OR UPDATE OF equipamento_id, modalidade ON public.treino_atividades
    FOR EACH ROW EXECUTE FUNCTION public.conferir_equipamento_da_atividade();

CREATE TABLE IF NOT EXISTS public.treino_consumos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    atividade_id uuid NOT NULL,
    horario time,
    minuto integer,
    categoria text NOT NULL,
    descricao text,
    quantidade numeric(8,1),
    unidade text,
    observacao text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    removido_em timestamp with time zone,
    CONSTRAINT treino_consumos_pkey PRIMARY KEY (id),
    CONSTRAINT treino_consumos_atividade_fkey FOREIGN KEY (atividade_id) REFERENCES public.treino_atividades(id) ON DELETE CASCADE,
    CONSTRAINT treino_consumos_categoria_check CHECK (categoria = ANY (ARRAY['agua', 'isotonico', 'gel', 'alimento', 'suplemento', 'outro'])),
    CONSTRAINT treino_consumos_unidade_check CHECK (unidade IS NULL OR unidade = ANY (ARRAY['mL', 'g', 'unidade', 'cápsula', 'sachê'])),
    CONSTRAINT treino_consumos_valores_check CHECK ((minuto IS NULL OR minuto BETWEEN 0 AND 2880) AND (quantidade IS NULL OR quantidade BETWEEN 0 AND 100000))
);

CREATE INDEX IF NOT EXISTS idx_treino_consumos_atividade ON public.treino_consumos (atividade_id) WHERE removido_em IS NULL;
