-- Biblioteca Mestre de modelos (SPEC V3 de 14/11/2026; decisões do
-- nutricionista de 14/11). Somente colunas novas: nada existente muda.
--
-- - codigo: identificador estável do catálogo (EMG-001, MUS-012...). Nulo
--   nos modelos criados pelos profissionais. Único quando preenchido: a
--   importação nunca cria dois modelos com o mesmo código nem sobrescreve.
-- - situacao (dietas): "bloqueado" = modelo da biblioteca que só pode ser
--   usado depois que o nutricionista revisar e liberar (clínicos, gestação,
--   lactação, bariátricos). Modelos atuais ficam "liberado".
-- - orientacoes_profissional: orientações ao nutricionista ou ao educador
--   físico. Ficam só no modelo: usar o modelo NÃO copia este texto para a
--   dieta ou o treino do paciente. As orientações ao paciente/aluno vão no
--   próprio conteúdo (observações), como hoje.
-- - biblioteca: dados da origem para auditoria (catálogo, versão, hash do
--   arquivo, energia calculada, avisos da validação, importado_em).
--
-- Reversão: apagar os modelos da biblioteca ainda não usados
-- (delete ... where codigo is not null and usos = 0) e depois
-- alter table ... drop column codigo, situacao, orientacoes_profissional,
-- biblioteca, liberado_em, liberado_por; os dois exercícios novos podem ficar
-- (ou ser arquivados se nenhum treino os usar).

ALTER TABLE public.modelos_nutricao
    ADD COLUMN IF NOT EXISTS codigo text,
    ADD COLUMN IF NOT EXISTS situacao text DEFAULT 'liberado' NOT NULL,
    ADD COLUMN IF NOT EXISTS orientacoes_profissional text,
    ADD COLUMN IF NOT EXISTS biblioteca jsonb,
    ADD COLUMN IF NOT EXISTS liberado_em timestamp with time zone,
    ADD COLUMN IF NOT EXISTS liberado_por uuid REFERENCES public.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'modelos_nutricao_situacao_check') THEN
    ALTER TABLE public.modelos_nutricao
      ADD CONSTRAINT modelos_nutricao_situacao_check CHECK (situacao = ANY (ARRAY['liberado', 'bloqueado']));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'modelos_nutricao_codigo_check') THEN
    ALTER TABLE public.modelos_nutricao
      ADD CONSTRAINT modelos_nutricao_codigo_check CHECK (codigo IS NULL OR codigo ~ '^[A-Z]{3}(-[A-Z]{2,3})?-[0-9]{3}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'modelos_nutricao_orientacoes_check') THEN
    ALTER TABLE public.modelos_nutricao
      ADD CONSTRAINT modelos_nutricao_orientacoes_check CHECK (orientacoes_profissional IS NULL OR length(orientacoes_profissional) <= 20000);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS modelos_nutricao_codigo_unico
    ON public.modelos_nutricao (codigo) WHERE codigo IS NOT NULL;

ALTER TABLE public.treino_modelos
    ADD COLUMN IF NOT EXISTS codigo text,
    ADD COLUMN IF NOT EXISTS orientacoes_profissional text,
    ADD COLUMN IF NOT EXISTS biblioteca jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treino_modelos_codigo_check') THEN
    ALTER TABLE public.treino_modelos
      ADD CONSTRAINT treino_modelos_codigo_check CHECK (codigo IS NULL OR codigo ~ '^(MUS|COR|CIC)-[0-9]{3}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treino_modelos_orientacoes_check') THEN
    ALTER TABLE public.treino_modelos
      ADD CONSTRAINT treino_modelos_orientacoes_check CHECK (orientacoes_profissional IS NULL OR length(orientacoes_profissional) <= 20000);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS treino_modelos_codigo_unico
    ON public.treino_modelos (codigo) WHERE codigo IS NOT NULL;

-- Exercícios que os modelos da biblioteca usam e faltavam na lista inicial
-- (decisão de 14/11: cadastrar). Mesmo padrão da 027: só entra se não existir.
INSERT INTO public.treino_exercicios (nome, chave, grupo, equipamentos, base)
SELECT v.nome, public.normalizar_texto(v.nome), v.grupo, v.equipamentos, true
  FROM (VALUES
    ('Puxada neutra', 'Costas', ARRAY['Puxador alto']),
    ('Flexão de braços inclinada', 'Peito', ARRAY['Banco'])
  ) AS v(nome, grupo, equipamentos)
 WHERE NOT EXISTS (SELECT 1 FROM public.treino_exercicios e WHERE e.chave = public.normalizar_texto(v.nome) AND e.arquivado_em IS NULL);
