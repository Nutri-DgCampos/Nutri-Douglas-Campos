-- Módulo de Nutrição — Fase 1, etapa 1: estrutura da base de alimentos.
--
-- Esta migration cria apenas as tabelas, sem nenhum alimento. A carga da
-- TACO é feita depois, com aprovação do nutricionista, pelo script
-- scripts/importar-taco.mjs.
--
-- Regras:
-- - Composição sempre por 100 g (ou 100 mL quando a unidade base for mL).
-- - Dado ausente = sem linha em alimentos_nutrientes (nunca zero).
-- - Traço (TACO "Tr") = linha com traco = true e valor nulo: aparece como
--   "Tr" e é tratado como dado não disponível nos cálculos.
-- - Cada valor guarda sua fonte (TACO, cadastro manual ou fonte complementar).
-- - Valores vindos de uma fonte importada não são editados pelo app; o
--   nutricionista só completa o que falta (fonte "manual").
-- - Dietas publicadas guardam uma cópia dos valores usados (Fase 2); mudar a
--   base não altera prescrições antigas.

CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Texto para busca: minúsculas e sem acentos (função imutável para índice).
CREATE OR REPLACE FUNCTION public.normalizar_texto(texto text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    AS $$ SELECT lower(public.unaccent('public.unaccent'::regdictionary, coalesce(texto, ''))) $$;

-- ---------------------------------------------------------------------------
-- Fontes dos dados nutricionais

CREATE TABLE IF NOT EXISTS public.alimentos_fontes (
    codigo text NOT NULL,
    nome text NOT NULL,
    versao text,
    referencia text,
    importado_em timestamp with time zone,
    CONSTRAINT alimentos_fontes_pkey PRIMARY KEY (codigo)
);

INSERT INTO public.alimentos_fontes (codigo, nome, versao, referencia) VALUES
    ('taco', 'Tabela Brasileira de Composição de Alimentos (TACO)', '4ª edição revisada e ampliada (NEPA/Unicamp, 2011)', 'https://www.nepa.unicamp.br/publicacoes/tabela-taco-excel/'),
    ('manual', 'Cadastro do nutricionista', NULL, NULL)
ON CONFLICT (codigo) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Catálogo de nutrientes (nome, unidade e grupo de exibição)

CREATE TABLE IF NOT EXISTS public.nutrientes (
    codigo text NOT NULL,
    nome text NOT NULL,
    unidade text NOT NULL,
    grupo text NOT NULL,
    ordem integer NOT NULL,
    CONSTRAINT nutrientes_pkey PRIMARY KEY (codigo),
    CONSTRAINT nutrientes_grupo_check CHECK (grupo = ANY (ARRAY[
        'energia', 'macronutrientes', 'fibras', 'minerais', 'vitaminas',
        'acidos_graxos', 'aminoacidos', 'outros']))
);

INSERT INTO public.nutrientes (codigo, nome, unidade, grupo, ordem) VALUES
    ('kcal', 'Energia', 'kcal', 'energia', 10),
    ('kj', 'Energia', 'kJ', 'energia', 11),
    ('carboidratos', 'Carboidratos', 'g', 'macronutrientes', 20),
    ('proteinas', 'Proteínas', 'g', 'macronutrientes', 21),
    ('lipidios', 'Lipídios', 'g', 'macronutrientes', 22),
    ('colesterol', 'Colesterol', 'mg', 'macronutrientes', 23),
    ('fibras', 'Fibra alimentar', 'g', 'fibras', 30),
    ('fibras_soluveis', 'Fibras solúveis', 'g', 'fibras', 31),
    ('fibras_insoluveis', 'Fibras insolúveis', 'g', 'fibras', 32),
    ('calcio', 'Cálcio', 'mg', 'minerais', 40),
    ('magnesio', 'Magnésio', 'mg', 'minerais', 41),
    ('manganes', 'Manganês', 'mg', 'minerais', 42),
    ('fosforo', 'Fósforo', 'mg', 'minerais', 43),
    ('ferro', 'Ferro', 'mg', 'minerais', 44),
    ('sodio', 'Sódio', 'mg', 'minerais', 45),
    ('potassio', 'Potássio', 'mg', 'minerais', 46),
    ('cobre', 'Cobre', 'mg', 'minerais', 47),
    ('zinco', 'Zinco', 'mg', 'minerais', 48),
    ('selenio', 'Selênio', 'µg', 'minerais', 49),
    ('retinol', 'Retinol', 'µg', 'vitaminas', 50),
    ('vitamina_a_re', 'Vitamina A (RE)', 'µg', 'vitaminas', 51),
    ('vitamina_a_rae', 'Vitamina A (RAE)', 'µg', 'vitaminas', 52),
    ('tiamina', 'Tiamina (B1)', 'mg', 'vitaminas', 53),
    ('riboflavina', 'Riboflavina (B2)', 'mg', 'vitaminas', 54),
    ('niacina', 'Niacina (B3)', 'mg', 'vitaminas', 55),
    ('piridoxina', 'Piridoxina (B6)', 'mg', 'vitaminas', 56),
    ('folato', 'Folato', 'µg', 'vitaminas', 57),
    ('vitamina_b12', 'Vitamina B12', 'µg', 'vitaminas', 58),
    ('vitamina_c', 'Vitamina C', 'mg', 'vitaminas', 59),
    ('vitamina_d', 'Vitamina D', 'µg', 'vitaminas', 60),
    ('vitamina_e', 'Vitamina E', 'mg', 'vitaminas', 61),
    ('ag_saturados', 'Ácidos graxos saturados', 'g', 'acidos_graxos', 70),
    ('ag_monoinsaturados', 'Ácidos graxos monoinsaturados', 'g', 'acidos_graxos', 71),
    ('ag_poliinsaturados', 'Ácidos graxos poli-insaturados', 'g', 'acidos_graxos', 72),
    ('ag_12_0', 'Láurico (12:0)', 'g', 'acidos_graxos', 73),
    ('ag_14_0', 'Mirístico (14:0)', 'g', 'acidos_graxos', 74),
    ('ag_16_0', 'Palmítico (16:0)', 'g', 'acidos_graxos', 75),
    ('ag_18_0', 'Esteárico (18:0)', 'g', 'acidos_graxos', 76),
    ('ag_20_0', 'Araquídico (20:0)', 'g', 'acidos_graxos', 77),
    ('ag_22_0', 'Beênico (22:0)', 'g', 'acidos_graxos', 78),
    ('ag_24_0', 'Lignocérico (24:0)', 'g', 'acidos_graxos', 79),
    ('ag_14_1', 'Miristoleico (14:1)', 'g', 'acidos_graxos', 80),
    ('ag_16_1', 'Palmitoleico (16:1)', 'g', 'acidos_graxos', 81),
    ('ag_18_1', 'Oleico (18:1)', 'g', 'acidos_graxos', 82),
    ('ag_20_1', 'Gadoleico (20:1)', 'g', 'acidos_graxos', 83),
    ('ag_18_2_n6', 'Linoleico (18:2 n-6)', 'g', 'acidos_graxos', 84),
    ('ag_18_3_n3', 'Linolênico (18:3 n-3)', 'g', 'acidos_graxos', 85),
    ('ag_20_4', 'Araquidônico (20:4)', 'g', 'acidos_graxos', 86),
    ('ag_20_5', 'EPA (20:5)', 'g', 'acidos_graxos', 87),
    ('ag_22_5', 'DPA (22:5)', 'g', 'acidos_graxos', 88),
    ('ag_22_6', 'DHA (22:6)', 'g', 'acidos_graxos', 89),
    ('ag_18_1_trans', 'Trans 18:1', 'g', 'acidos_graxos', 90),
    ('ag_18_2_trans', 'Trans 18:2', 'g', 'acidos_graxos', 91),
    ('triptofano', 'Triptofano', 'g', 'aminoacidos', 100),
    ('treonina', 'Treonina', 'g', 'aminoacidos', 101),
    ('isoleucina', 'Isoleucina', 'g', 'aminoacidos', 102),
    ('leucina', 'Leucina', 'g', 'aminoacidos', 103),
    ('lisina', 'Lisina', 'g', 'aminoacidos', 104),
    ('metionina', 'Metionina', 'g', 'aminoacidos', 105),
    ('cistina', 'Cistina', 'g', 'aminoacidos', 106),
    ('fenilalanina', 'Fenilalanina', 'g', 'aminoacidos', 107),
    ('tirosina', 'Tirosina', 'g', 'aminoacidos', 108),
    ('valina', 'Valina', 'g', 'aminoacidos', 109),
    ('arginina', 'Arginina', 'g', 'aminoacidos', 110),
    ('histidina', 'Histidina', 'g', 'aminoacidos', 111),
    ('alanina', 'Alanina', 'g', 'aminoacidos', 112),
    ('acido_aspartico', 'Ácido aspártico', 'g', 'aminoacidos', 113),
    ('acido_glutamico', 'Ácido glutâmico', 'g', 'aminoacidos', 114),
    ('glicina', 'Glicina', 'g', 'aminoacidos', 115),
    ('prolina', 'Prolina', 'g', 'aminoacidos', 116),
    ('serina', 'Serina', 'g', 'aminoacidos', 117),
    ('umidade', 'Umidade', 'g', 'outros', 120),
    ('cinzas', 'Cinzas', 'g', 'outros', 121)
ON CONFLICT (codigo) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Categorias e alimentos

CREATE TABLE IF NOT EXISTS public.alimentos_categorias (
    id serial NOT NULL,
    nome text NOT NULL,
    fonte text NOT NULL,
    codigo_origem text,
    CONSTRAINT alimentos_categorias_pkey PRIMARY KEY (id),
    CONSTRAINT alimentos_categorias_fonte_fkey FOREIGN KEY (fonte) REFERENCES public.alimentos_fontes(codigo),
    CONSTRAINT alimentos_categorias_origem_unica UNIQUE (fonte, codigo_origem)
);

CREATE TABLE IF NOT EXISTS public.alimentos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    categoria_id integer,
    fonte text NOT NULL,
    codigo_origem text,
    -- Composição por 100 g ("g") ou por 100 mL ("ml").
    unidade_base text DEFAULT 'g' NOT NULL,
    -- Densidade (g por mL) para converter volume em massa; só quando conhecida.
    densidade_g_ml numeric(6,3),
    arquivado boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT alimentos_pkey PRIMARY KEY (id),
    CONSTRAINT alimentos_categoria_fkey FOREIGN KEY (categoria_id) REFERENCES public.alimentos_categorias(id),
    CONSTRAINT alimentos_fonte_fkey FOREIGN KEY (fonte) REFERENCES public.alimentos_fontes(codigo),
    CONSTRAINT alimentos_origem_unica UNIQUE (fonte, codigo_origem),
    CONSTRAINT alimentos_nome_check CHECK (length(btrim(nome)) > 0),
    CONSTRAINT alimentos_unidade_check CHECK (unidade_base = ANY (ARRAY['g', 'ml'])),
    CONSTRAINT alimentos_densidade_check CHECK (densidade_g_ml IS NULL OR densidade_g_ml > 0)
);

CREATE INDEX IF NOT EXISTS idx_alimentos_busca
    ON public.alimentos USING gin (public.normalizar_texto(nome) gin_trgm_ops);

CREATE TABLE IF NOT EXISTS public.alimentos_nutrientes (
    alimento_id uuid NOT NULL,
    nutriente text NOT NULL,
    -- Por 100 g (ou 100 mL). Nulo somente quando traco = true.
    valor numeric(12,4),
    traco boolean DEFAULT false NOT NULL,
    fonte text NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT alimentos_nutrientes_pkey PRIMARY KEY (alimento_id, nutriente),
    CONSTRAINT alimentos_nutrientes_alimento_fkey FOREIGN KEY (alimento_id) REFERENCES public.alimentos(id) ON DELETE CASCADE,
    CONSTRAINT alimentos_nutrientes_nutriente_fkey FOREIGN KEY (nutriente) REFERENCES public.nutrientes(codigo),
    CONSTRAINT alimentos_nutrientes_fonte_fkey FOREIGN KEY (fonte) REFERENCES public.alimentos_fontes(codigo),
    CONSTRAINT alimentos_nutrientes_valor_check CHECK ((traco AND valor IS NULL) OR (NOT traco AND valor IS NOT NULL AND valor >= 0))
);

-- ---------------------------------------------------------------------------
-- Medidas caseiras (cadastradas pelo nutricionista, por alimento)

CREATE TABLE IF NOT EXISTS public.medidas_caseiras (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    alimento_id uuid NOT NULL,
    nome_singular text NOT NULL,
    nome_plural text NOT NULL,
    -- Gramas (ou mL, conforme a unidade base do alimento) de UMA medida.
    quantidade numeric(10,2) NOT NULL,
    padrao boolean DEFAULT false NOT NULL,
    ordem integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT medidas_caseiras_pkey PRIMARY KEY (id),
    CONSTRAINT medidas_caseiras_alimento_fkey FOREIGN KEY (alimento_id) REFERENCES public.alimentos(id) ON DELETE CASCADE,
    CONSTRAINT medidas_caseiras_quantidade_check CHECK (quantidade > 0),
    CONSTRAINT medidas_caseiras_nomes_check CHECK (length(btrim(nome_singular)) > 0 AND length(btrim(nome_plural)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_medidas_alimento ON public.medidas_caseiras USING btree (alimento_id, ordem);

-- No máximo uma medida padrão por alimento.
CREATE UNIQUE INDEX IF NOT EXISTS medidas_caseiras_uma_padrao
    ON public.medidas_caseiras USING btree (alimento_id) WHERE padrao;

-- ---------------------------------------------------------------------------
-- Substituições alimentares (lista por alimento)

CREATE TABLE IF NOT EXISTS public.substituicoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    alimento_id uuid NOT NULL,
    substituto_id uuid NOT NULL,
    -- Quantidade de referência do alimento principal (g ou mL).
    quantidade_referencia numeric(10,2) NOT NULL,
    -- Quantidade do substituto (g ou mL), definida pelo nutricionista.
    quantidade_substituto numeric(10,2) NOT NULL,
    -- Medida caseira do substituto, quando escolhida.
    medida_caseira_id uuid,
    quantidade_medidas numeric(8,2),
    observacao text,
    ordem integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT substituicoes_pkey PRIMARY KEY (id),
    CONSTRAINT substituicoes_alimento_fkey FOREIGN KEY (alimento_id) REFERENCES public.alimentos(id) ON DELETE CASCADE,
    CONSTRAINT substituicoes_substituto_fkey FOREIGN KEY (substituto_id) REFERENCES public.alimentos(id) ON DELETE CASCADE,
    CONSTRAINT substituicoes_medida_fkey FOREIGN KEY (medida_caseira_id) REFERENCES public.medidas_caseiras(id) ON DELETE SET NULL,
    CONSTRAINT substituicoes_distintos CHECK (alimento_id <> substituto_id),
    CONSTRAINT substituicoes_quantidades_check CHECK (quantidade_referencia > 0 AND quantidade_substituto > 0),
    CONSTRAINT substituicoes_unica UNIQUE (alimento_id, substituto_id)
);

CREATE INDEX IF NOT EXISTS idx_substituicoes_alimento ON public.substituicoes USING btree (alimento_id, ordem);
