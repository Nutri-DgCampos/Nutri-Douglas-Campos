# Biblioteca Mestre V3 — conversão do material antigo para os arquivos
# intermediários de banco/biblioteca/modelos (um JSON por código).
#
# Uso (a partir da raiz do repositório):
#   python -I -X utf8 scripts/biblioteca/converter.py <pasta-dos-json-antigos> CÓDIGO [CÓDIGO...]
#
# - Os JSON antigos são os blocos da SPEC única (pacote desmembrado, um
#   arquivo por código). Eles NÃO entram no repositório.
# - Alimentos e exercícios são trocados conforme banco/biblioteca/decisoes.json
#   (aprovado pelo nutricionista). Nome sem decisão = erro (nada é inventado).
# - Orientações vêm de banco/biblioteca/orientacoes/<FAMÍLIA>.json, escritas
#   por categoria; sem o arquivo da família, o modelo não é gerado.
# - Nunca sobrescreve um arquivo existente (use --substituir para refazer um
#   rascunho que ainda não foi importado).
# - Gramas: as do cardápio-base antigo. O ajuste à meta de energia é feito
#   pelo importador com a composição real da base (scripts/biblioteca/biblioteca.mjs).
import csv, glob, json, os, re, sys

RAIZ = os.getcwd()
BIB = os.path.join(RAIZ, 'banco', 'biblioteca')
DIAS = {'segunda': 'seg', 'terça': 'ter', 'terca': 'ter', 'quarta': 'qua', 'quinta': 'qui',
        'sexta': 'sex', 'sábado': 'sab', 'sabado': 'sab', 'domingo': 'dom'}
FASES = {'aquecimento': 'aquecimento', 'principal': 'bloco', 'recuperacao': 'recuperacao',
         'recuperação': 'recuperacao', 'volta_a_calma': 'desaquecimento'}


def ler(caminho):
    with open(caminho, encoding='utf-8') as f:
        return json.load(f)


def familia(codigo):
    partes = codigo.split('-')
    return '-'.join(partes[:2]) if partes[0] == 'FIS' else partes[0]


def orientacoes(codigo, tipo):
    # Arquivo da família; FIS-BIK cai em FIS-BIK.json ou, se não houver, FIS.json.
    for nome in (familia(codigo), codigo.split('-')[0], tipo):
        caminho = os.path.join(BIB, 'orientacoes', nome + '.json')
        if os.path.isfile(caminho):
            o = ler(caminho)
            return o, nome
    return None, None


def trocas_do_codigo(codigo, dec):
    # Trocas de alimento coerentes com a categoria (decisoes.json → "trocas"):
    # primeiro as da família, depois as do código. Valor null = retirar o item.
    t = {}
    for chave in (codigo.split('-')[0], familia(codigo), codigo):
        t.update(dec.get('trocas', {}).get(chave, {}))
    return t


def complementos(o, codigo, cat):
    # Orientações a mais por divisão (prefixo), fase competitiva e código.
    extras = []
    for prefixo, e in o.get('por_prefixo', {}).items():
        if codigo.startswith(prefixo):
            extras.append(e)
    if cat.get('fase_competitiva') and cat['fase_competitiva'] in o.get('por_fase', {}):
        extras.append(o['por_fase'][cat['fase_competitiva']])
    if codigo in o.get('por_codigo', {}):
        extras.append(o['por_codigo'][codigo])
    paciente = list(o['paciente']) + [p for e in extras for p in e.get('paciente', [])]
    profissional = '\n'.join([o['profissional']] + [e['profissional'] for e in extras if e.get('profissional')])
    return paciente, profissional


def refeicoes_proprias(spec, dec):
    # Rascunho novo (clinicos.json): itens 'chave|gramas'; chave de decisoes.json
    # ou 'taco:CÓDIGO Nome'.
    refeicoes = []
    for r in spec['refeicoes']:
        itens = []
        for linha in r['itens']:
            chave, gramas = linha.rsplit('|', 1)
            if chave.startswith('taco:'):
                codigo_taco, nome = chave[5:].split(' ', 1)
                ref = {'taco': codigo_taco}
            else:
                d = dec['alimentos'].get(chave)
                if not d:
                    raise ValueError(f'alimento sem decisão: {chave}')
                ref, nome = {k: d[k] for k in ('taco', 'id') if k in d}, d['nome']
            itens.append({'alimento': ref, 'nome': nome, 'gramas': int(gramas)})
        refeicoes.append({'nome': r['nome'], 'itens': itens})
    return refeicoes


def converter_dieta(antigo, cat, dec):
    proprio = ler(os.path.join(BIB, 'clinicos.json')).get(antigo['codigo'])
    if proprio:
        caminho = os.path.join(BIB, 'orientacoes', proprio['orientacoes'] + '.json')
        o, fonte_orient = ler(caminho), proprio['orientacoes']
    else:
        o, fonte_orient = orientacoes(antigo['codigo'], 'dieta')
    if not o:
        raise ValueError('sem orientações da família')
    if cat['acao'] == 'GERAR_RASCUNHO_BLOQUEADO' and not proprio:
        raise ValueError('bloqueado sem rascunho próprio em clinicos.json (V3: não reutilizar o cardápio antigo)')
    trocas = trocas_do_codigo(antigo['codigo'], dec)
    refeicoes = refeicoes_proprias(proprio, dec) if proprio else []
    for r in ([] if proprio else antigo['refeicoes']):
        itens = []
        por_ref = dec.get('trocas_por_refeicao', {})
        aplica_ref = antigo['codigo'].split('-')[0] not in por_ref.get('exceto', [])
        for a in r['alimentos']:
            nome_busca, gramas = a['nome_busca'], a['quantidade_g']
            tr = por_ref.get(r['nome'], {}).get(nome_busca) if aplica_ref else None
            if tr:
                nome_busca, gramas = tr['para'], max(1, round(gramas * tr.get('fator', 1)))
            if nome_busca in trocas:
                d = trocas[nome_busca]
                if d is None:
                    continue
            else:
                d = dec['alimentos'].get(nome_busca)
            if not d:
                raise ValueError(f"alimento sem decisão: {nome_busca}")
            ref = {k: d[k] for k in ('taco', 'id') if k in d}
            itens.append({'alimento': ref, 'nome': d['nome'], 'gramas': gramas})
        refeicoes.append({'nome': r['nome'], 'itens': itens})
    paciente, profissional = complementos(o, antigo['codigo'], cat)
    codigo = antigo['codigo']
    nominal = dec['kcal_nominal'].get(codigo) or (int(cat['meta_kcal_nominal']) if cat['meta_kcal_nominal'] else None)
    bloqueado = cat['acao'] == 'GERAR_RASCUNHO_BLOQUEADO' or codigo in dec['mul_gestacao_lactacao']
    peso = float(cat['peso_referencia_kg']) if cat['peso_referencia_kg'] else None
    hidr = float(cat['hidratacao_referencia_ml_kg']) if cat['hidratacao_referencia_ml_kg'] else None
    return {
        'codigo': codigo,
        'tipo': 'dieta',
        'nome': re.sub(r'(\d)(\d{3}) kcal', r'\1.\2 kcal', f"{codigo} — {cat['objetivo']} — {cat['titulo'].split(' — ', 1)[-1]}"),
        'categoria': cat['categoria'],
        'objetivo': cat['objetivo'],
        'situacao': 'bloqueado' if bloqueado else 'liberado',
        'meta_kcal_nominal': nominal,
        'peso_referencia_kg': peso,
        'hidratacao_ml_kg': hidr,
        'hidratacao_observacoes': o.get('hidratacao', ''),
        'refeicoes': refeicoes,
        'orientacoes_paciente': paciente,
        'orientacoes_profissional': profissional,
        'referencias': o.get('referencias', []),
        'origem': {'catalogo': 'V3', 'conteudo_base': 'rascunho novo (clinicos.json)' if proprio else 'SPEC única 11/2026', 'orientacoes': fonte_orient},
    }


def exercicio(e, dec, notas):
    nome = dec['exercicios'].get(e['nome_busca'], e['nome_busca'])
    return {
        'exercicio': nome,
        'series': e['series'],
        'repeticoes_min': e['repeticoes_min'],
        'repeticoes_max': e['repeticoes_max'],
        'descanso_segundos': e['descanso_segundos'],
        'observacao': notas.get(nome) or e.get('observacao'),
    }


def dias_proprios(spec, notas):
    # Divisão própria (banco/biblioteca/musculacao.json): 'Nome|séries|mín|máx|descanso'.
    dias = []
    for d in spec['dias']:
        exercicios = []
        for linha in d['exercicios']:
            nome, series, rmin, rmax, desc = linha.split('|')
            exercicios.append({'exercicio': nome, 'series': int(series), 'repeticoes_min': int(rmin),
                               'repeticoes_max': int(rmax), 'descanso_segundos': int(desc), 'observacao': notas.get(nome)})
        dias.append({'dia': d['dia'], 'titulo': d['titulo'], 'observacao': spec.get('observacao_dias'), 'exercicios': exercicios})
    return dias


def converter_musculacao(antigo, cat, dec):
    o, fonte_orient = orientacoes(antigo['codigo'], 'musculacao')
    if not o:
        raise ValueError('sem orientações da modalidade')
    variacoes = ler(os.path.join(BIB, 'musculacao.json'))
    notas = variacoes.get('observacoes_exercicio', {})
    spec = variacoes.get(antigo['codigo'])
    if spec:
        dias = dias_proprios(spec, notas)
    else:
        dias = [{'dia': DIAS[d['dia_sugerido'].lower()], 'titulo': d['nome'], 'observacao': None,
                 'exercicios': [exercicio(e, dec, notas) for e in d['exercicios']]} for d in antigo['dias']]
    return {
        'codigo': antigo['codigo'], 'tipo': 'musculacao', 'nome': antigo['titulo'],
        'nivel': cat['nivel'] or antigo.get('nivel'), 'objetivo': cat['objetivo'],
        'dias': dias,
        'orientacoes_aluno': o['aluno'],
        'orientacoes_profissional': o['profissional'] + ('\n\nProgressão: ' + antigo['orientacao_progressao_semanal'] if antigo.get('orientacao_progressao_semanal') else ''),
        'referencias': o.get('referencias', []),
        'origem': {'catalogo': 'V3', 'conteudo_base': spec['origem'] if spec else 'SPEC única 11/2026', 'orientacoes': fonte_orient},
    }


def por_semana(valor, i):
    return valor[i] if isinstance(valor, list) else valor


def arred5(v):
    return max(5, int(round(v / 5.0)) * 5)


def semanas_endurance(spec):
    # Gera as semanas a partir da especificação (banco/biblioteca/endurance.json):
    # contínuo com progressão linear entre início e pico nas semanas normais,
    # 75% nas de recuperação e 60% do pico no polimento.
    n = spec['semanas']
    rec = set(spec.get('recuperacao', []))
    polimento = n if spec.get('polimento') else None
    normais = [w for w in range(1, n + 1) if w not in rec and w != polimento]
    semanas = []
    for w in range(1, n + 1):
        if w == polimento:
            rotulo = 'polimento: volume reduzido antes da prova'
        elif w in rec:
            rotulo = 'semana de recuperação (volume menor)'
        else:
            k = normais.index(w)
            rotulo = ['adaptação', 'desenvolvimento', 'consolidação'][min(2, 3 * k // max(1, len(normais)))]
        sessoes = []
        for dia, s in zip(spec['dias'], spec['sessoes']):
            blocos = [{'tipo': 'aquecimento', 'descricao': 'Aquecimento progressivo', 'repeticoes': None,
                       'duracao_min': spec['aquecimento'], 'intensidade': 'Z1–Z2'}]
            if 'principal' in s:
                ini, pico = s['principal']
                if w == polimento:
                    minutos = arred5(pico * 0.6)
                else:
                    ref = w if w in normais else max([x for x in normais if x < w] or [normais[0]])
                    k = normais.index(ref)
                    minutos = ini + (pico - ini) * (k / (len(normais) - 1) if len(normais) > 1 else 0)
                    minutos = arred5(minutos * (0.75 if w in rec else 1))
                blocos.append({'tipo': 'bloco', 'descricao': s['desc'], 'repeticoes': None, 'duracao_min': minutos, 'intensidade': s['zona']})
            else:
                i = w - 1
                rep = por_semana(s['rep'], i)
                if w == polimento and not isinstance(s['rep'], list):
                    rep = max(2, rep // 2)
                blocos.append({'tipo': 'bloco', 'descricao': s['desc'], 'repeticoes': rep, 'duracao_min': por_semana(s['dur'], i), 'intensidade': s['zona_bloco']})
                blocos.append({'tipo': 'recuperacao', 'descricao': 'Recuperação ativa', 'repeticoes': rep, 'duracao_min': por_semana(s['rec'], i), 'intensidade': s['zona_rec']})
            blocos.append({'tipo': 'desaquecimento', 'descricao': 'Volta à calma', 'repeticoes': None, 'duracao_min': spec['desaquecimento'], 'intensidade': 'Z1'})
            total = sum(b['duracao_min'] * (b['repeticoes'] or 1) for b in blocos)
            sessoes.append({'dia': dia, 'tipo': s['tipo'], 'descricao': s['desc'], 'duracao_min': total, 'zona': s['zona'], 'blocos': blocos,
                            'observacao': f'Semana {w}: {rotulo}. Ajustar à tolerância e às zonas individuais; sem boa recuperação, repetir a semana anterior.'})
        semanas.append({'sessoes': sessoes})
    return semanas


def converter_endurance(antigo, cat, dec):
    o, fonte_orient = orientacoes(antigo['codigo'], antigo['tipo'])
    if not o:
        raise ValueError('sem orientações da modalidade')
    spec = ler(os.path.join(BIB, 'endurance.json')).get(antigo['codigo'])
    if not spec:
        raise ValueError('sem especificação em endurance.json')
    progressao = ('\n\nProgressão: semanas de recuperação com cerca de 75% do volume'
                  + (' e polimento na última semana' if spec.get('polimento') else '')
                  + '; avançar somente com boa tolerância, sem sintomas e com registros consistentes.')
    return {
        'codigo': antigo['codigo'], 'tipo': antigo['tipo'], 'nome': antigo['titulo'],
        'nivel': cat['nivel'] or antigo.get('nivel_referencia'), 'objetivo': cat['objetivo'],
        'duracao_semanas': spec['semanas'],
        'fase': spec.get('fase'),
        'semanas': semanas_endurance(spec),
        'orientacoes_aluno': o['aluno'],
        'orientacoes_profissional': o['profissional'] + progressao,
        'referencias': o.get('referencias', []),
        'origem': {'catalogo': 'V3', 'conteudo_base': 'programa gerado de banco/biblioteca/endurance.json', 'orientacoes': fonte_orient},
    }


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    substituir = '--substituir' in sys.argv
    pasta, codigos = args[0], args[1:]
    catalogo = {l['codigo']: l for l in csv.DictReader(open(os.path.join(BIB, 'catalogo.csv'), encoding='utf-8-sig'))}
    dec = ler(os.path.join(BIB, 'decisoes.json'))
    for codigo in codigos:
        destino = os.path.join(BIB, 'modelos', codigo + '.json')
        if codigo in dec['protegidos']:
            print(f'{codigo}: protegido (cadastrado à mão na produção) — não gerado')
            continue
        if codigo not in catalogo:
            print(f'{codigo}: fora do catálogo')
            continue
        if os.path.exists(destino) and not substituir:
            print(f'{codigo}: já existe {os.path.relpath(destino)} — não sobrescrito')
            continue
        antigos = glob.glob(os.path.join(pasta, '**', codigo + '.json'), recursive=True)
        if not antigos:
            print(f'{codigo}: JSON antigo não encontrado')
            continue
        antigo = ler(antigos[0])
        try:
            if antigo['tipo'] == 'dieta':
                novo = converter_dieta(antigo, catalogo[codigo], dec)
            elif antigo['tipo'] == 'musculacao':
                novo = converter_musculacao(antigo, catalogo[codigo], dec)
            else:
                novo = converter_endurance(antigo, catalogo[codigo], dec)
        except (ValueError, KeyError) as erro:
            print(f'{codigo}: NÃO gerado — {erro}')
            continue
        with open(destino, 'w', encoding='utf-8', newline='\n') as f:
            json.dump(novo, f, ensure_ascii=False, indent=1)
            f.write('\n')
        print(f'{codigo}: gerado')


if __name__ == '__main__':
    main()
