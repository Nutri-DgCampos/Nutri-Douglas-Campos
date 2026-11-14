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


def converter_dieta(antigo, cat, dec):
    o, fonte_orient = orientacoes(antigo['codigo'], 'dieta')
    if not o:
        raise ValueError('sem orientações da família')
    refeicoes = []
    for r in antigo['refeicoes']:
        itens = []
        for a in r['alimentos']:
            d = dec['alimentos'].get(a['nome_busca'])
            if not d:
                raise ValueError(f"alimento sem decisão: {a['nome_busca']}")
            ref = {k: d[k] for k in ('taco', 'id') if k in d}
            itens.append({'alimento': ref, 'nome': d['nome'], 'gramas': a['quantidade_g']})
        refeicoes.append({'nome': r['nome'], 'itens': itens})
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
        'orientacoes_paciente': o['paciente'],
        'orientacoes_profissional': o['profissional'],
        'referencias': o.get('referencias', []),
        'origem': {'catalogo': 'V3', 'conteudo_base': 'SPEC única 11/2026', 'orientacoes': fonte_orient},
    }


def exercicio(e, dec):
    nome = dec['exercicios'].get(e['nome_busca'], e['nome_busca'])
    return {
        'exercicio': nome,
        'series': e['series'],
        'repeticoes_min': e['repeticoes_min'],
        'repeticoes_max': e['repeticoes_max'],
        'descanso_segundos': e['descanso_segundos'],
        'observacao': e.get('observacao'),
    }


def converter_musculacao(antigo, cat, dec):
    o, fonte_orient = orientacoes(antigo['codigo'], 'musculacao')
    if not o:
        raise ValueError('sem orientações da modalidade')
    dias = [{'dia': DIAS[d['dia_sugerido'].lower()], 'titulo': d['nome'], 'observacao': None,
             'exercicios': [exercicio(e, dec) for e in d['exercicios']]} for d in antigo['dias']]
    return {
        'codigo': antigo['codigo'], 'tipo': 'musculacao', 'nome': antigo['titulo'],
        'nivel': cat['nivel'] or antigo.get('nivel'), 'objetivo': cat['objetivo'],
        'dias': dias,
        'orientacoes_aluno': o['aluno'],
        'orientacoes_profissional': o['profissional'] + ('\n\nProgressão: ' + antigo['orientacao_progressao_semanal'] if antigo.get('orientacao_progressao_semanal') else ''),
        'referencias': o.get('referencias', []),
        'origem': {'catalogo': 'V3', 'conteudo_base': 'SPEC única 11/2026', 'orientacoes': fonte_orient},
    }


def converter_endurance(antigo, cat, dec):
    o, fonte_orient = orientacoes(antigo['codigo'], antigo['tipo'])
    if not o:
        raise ValueError('sem orientações da modalidade')
    semanas = []
    for w in antigo['periodizacao']:
        sessoes = []
        for s in w['sessoes']:
            blocos = [{'tipo': FASES[g['fase']], 'descricao': g.get('descricao') or '', 'repeticoes': g.get('repeticoes'),
                       'duracao_min': g.get('duracao_min'), 'intensidade': g.get('zona')} for g in s['segmentos']]
            sessoes.append({'dia': DIAS[s['dia_sugerido'].lower()], 'tipo': s['tipo'], 'descricao': w.get('enfase') or '',
                            'duracao_min': s['duracao_total_min'], 'zona': s.get('zona_referencia'),
                            'blocos': blocos, 'observacao': s.get('observacao')})
        semanas.append({'sessoes': sessoes})
    return {
        'codigo': antigo['codigo'], 'tipo': antigo['tipo'], 'nome': antigo['titulo'],
        'nivel': cat['nivel'] or antigo.get('nivel_referencia'), 'objetivo': cat['objetivo'],
        'duracao_semanas': antigo['duracao_semanas'],
        'semanas': semanas,
        'orientacoes_aluno': o['aluno'],
        'orientacoes_profissional': o['profissional'] + ('\n\nProgressão: ' + antigo['orientacao_progressao_semanal'] if antigo.get('orientacao_progressao_semanal') else ''),
        'referencias': o.get('referencias', []),
        'origem': {'catalogo': 'V3', 'conteudo_base': 'SPEC única 11/2026', 'orientacoes': fonte_orient},
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
