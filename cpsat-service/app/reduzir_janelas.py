"""
reduzir_janelas.py — Fase 3: pos-processamento de busca local (Simulated
Annealing) para reduzir janelas de PROFESSOR em cima de uma grade ja
viavel devolvida por gerar_grade() (cpsat-service/app/solver.py).

Casado com o formato REAL do projeto (visto direto no solver.py):

    resultado["aulas"] = [
        {
            "turma": str,
            "codigoSae": str,
            "disciplina": str,
            "professor": str,
            "dia": int,       # 0=Segunda ... 4=Sexta
            "diaNome": str,
            "aula": int,      # 1..aulas_por_dia
        },
        ...
    ]

resultado["aulas"] SOZINHO NAO BASTA: maxAulasDia, ultimaAulaTurma e
grupoDupla so existem em disciplinas_turma_raw (a lista crua que ja
entra em gerar_grade()). Por isso este modulo recebe as duas listas
originais tambem, em vez de reimplementar limites que ja existem no
solver.

REGRA DE OURO: uma troca so e aceita se, depois de aplicada, TODAS as
restricoes rigidas do solver.py continuam valendo:
    - Restricao 2: turma sem 2 aulas no mesmo horario
    - Restricao 3: professor sem 2 turmas no mesmo horario
    - Restricao 5: max_aulas_dia por linha (disciplina+turma+professor)
    - Restricao 5b: max 3 aulas/dia por par (professor, turma), sem 4
      seguidas (checagem simplificada: valida a janela deslizante de 4)
    - Restricao 6: bloqueios de disponibilidade do professor
    - ultima_aula_turma: nivel de ensino nao pode ultrapassar o teto
      de aula do turno dele
    - grupo_dupla: os 2+ professores da dupla sempre se movem JUNTOS
      pro mesmo (dia, aula) - nunca separados
    - turma nunca pode ficar com janela (regra ja usada no projeto)

Restricao 4 (teto de aulas por turno por professor) NAO precisa ser
checada aqui: uma troca so realoca dia/aula, nunca muda quantas aulas
cada professor da no total, entao o teto por turno e invariante.
"""

import math
import random
import time
from collections import defaultdict


def _chave_dt(aula):
    return (aula["turma"], aula["codigoSae"], aula["professor"])


def preparar_contexto(aulas, disciplinas_turma_raw, bloqueios_raw, aulas_por_dia, fixadas=None):
    lookup_dt = {}
    for d in disciplinas_turma_raw:
        chave = (d["turma"], d["codigoSae"], d["professor"])
        lookup_dt[chave] = d

    bloqueios = {(b["professor"], b["dia"], b["aula"]) for b in bloqueios_raw}
    fixadas = fixadas or set()

    usados = set()
    unidades = []
    unidades_fixas = []
    for i, a in enumerate(aulas):
        if i in usados:
            continue
        dt = lookup_dt.get(_chave_dt(a))
        grupo = dt.get("grupoDupla") if dt else None
        if grupo is None:
            unidades.append([i])
            unidades_fixas.append(_chave_dt(a) in fixadas)
            usados.add(i)
            continue
        membros = [i]
        for j, b in enumerate(aulas):
            if j == i or j in usados:
                continue
            dt_b = lookup_dt.get(_chave_dt(b))
            grupo_b = dt_b.get("grupoDupla") if dt_b else None
            if grupo_b == grupo and b["dia"] == a["dia"] and b["aula"] == a["aula"]:
                membros.append(j)
        for m in membros:
            usados.add(m)
        unidades.append(membros)
        # se QUALQUER membro do grupo-dupla estiver fixado, a unidade inteira fica fixa
        unidades_fixas.append(any(_chave_dt(aulas[m]) in fixadas for m in membros))

    return {
        "lookup_dt": lookup_dt,
        "bloqueios": bloqueios,
        "unidades": unidades,
        "unidades_fixas": unidades_fixas,
        "aulas_por_dia": aulas_por_dia,
    }


def contar_janelas_professor(aulas):
    por_prof_dia = defaultdict(set)
    for a in aulas:
        por_prof_dia[(a["professor"], a["dia"])].add(a["aula"])
    total = 0
    for slots in por_prof_dia.values():
        if len(slots) < 2:
            continue
        mn, mx = min(slots), max(slots)
        total += sum(1 for s in range(mn, mx + 1) if s not in slots)
    return total


def _turma_sem_janela_ok(aulas):
    turma_slots = defaultdict(set)
    for a in aulas:
        turma_slots[(a["turma"], a["dia"])].add(a["aula"])
    for slots in turma_slots.values():
        if len(slots) < 2:
            continue
        mn, mx = min(slots), max(slots)
        if (mx - mn + 1) != len(slots):
            return False
    return True


def _restricoes_ok(aulas, ctx):
    lookup_dt = ctx["lookup_dt"]
    bloqueios = ctx["bloqueios"]
    aulas_por_dia = ctx["aulas_por_dia"]

    ocup_turma = defaultdict(int)
    ocup_prof = defaultdict(int)
    aulas_por_dt_dia = defaultdict(int)
    aulas_por_par_prof_turma_dia = defaultdict(list)
    vistos_dupla_turma = set()  # mesma dedup da RESTRICAO 2 do solver.py:
    # as 2+ linhas de um grupo_dupla sao UMA aula so (2 profs juntos),
    # nao contam como 2 ocupantes do mesmo slot de turma

    for a in aulas:
        dt_dupla_check = lookup_dt.get(_chave_dt(a))
        grupo = dt_dupla_check.get("grupoDupla") if dt_dupla_check else None

        chave_turma = (a["turma"], a["dia"], a["aula"])
        if grupo is not None:
            if grupo in vistos_dupla_turma:
                pass  # ja contamos esse grupo nesse slot - nao soma de novo
            else:
                vistos_dupla_turma.add(grupo)
                ocup_turma[chave_turma] += 1
        else:
            ocup_turma[chave_turma] += 1
        if ocup_turma[chave_turma] > 1:
            return False

        chave_prof = (a["professor"], a["dia"], a["aula"])
        ocup_prof[chave_prof] += 1
        if ocup_prof[chave_prof] > 1:
            return False

        if (a["professor"], a["dia"], a["aula"]) in bloqueios:
            return False

        dt = lookup_dt.get(_chave_dt(a))
        if dt is None:
            return False

        uat = dt.get("ultimaAulaTurma")
        if uat is not None and a["aula"] > uat:
            return False

        chave_dt_dia = (a["turma"], a["codigoSae"], a["professor"], a["dia"])
        aulas_por_dt_dia[chave_dt_dia] += 1
        if aulas_por_dt_dia[chave_dt_dia] > dt["maxAulasDia"]:
            return False

        chave_par = (a["professor"], a["turma"], a["dia"])
        aulas_por_par_prof_turma_dia[chave_par].append(a["aula"])

    for slots in aulas_por_par_prof_turma_dia.values():
        slots_set = set(slots)
        for inicio in range(1, aulas_por_dia - 2):
            janela = range(inicio, inicio + 4)
            if sum(1 for s in janela if s in slots_set) > 3:
                return False

    if not _turma_sem_janela_ok(aulas):
        return False

    return True


def _aplicar_troca(aulas, unidade_a, unidade_b):
    nova = [dict(x) for x in aulas]
    dia_a, aula_a = nova[unidade_a[0]]["dia"], nova[unidade_a[0]]["aula"]
    dia_b, aula_b = nova[unidade_b[0]]["dia"], nova[unidade_b[0]]["aula"]
    for i in unidade_a:
        nova[i]["dia"], nova[i]["aula"] = dia_b, aula_b
    for i in unidade_b:
        nova[i]["dia"], nova[i]["aula"] = dia_a, aula_a
    return nova


def _aplicar_cadeia(aulas, lista_unidades):
    """
    Rotaciona (dia, aula) ciclicamente entre 3+ unidades: a unidade[0]
    recebe a posicao da unidade[1], a unidade[1] recebe a da
    unidade[2], ..., a ultima recebe a posicao da primeira.

    Existe pra escapar de minimos locais que o swap de par simples nao
    alcanca: numa grade 100% compacta (sem slot vazio), as vezes
    nenhuma troca de DUAS posicoes melhora nada, mas uma rotacao de
    TRES ou mais sim (tecnica conhecida como Kempe chain / cadeia de
    swaps na literatura de timetabling).
    """
    nova = [dict(x) for x in aulas]
    posicoes = [(nova[u[0]]["dia"], nova[u[0]]["aula"]) for u in lista_unidades]
    n = len(lista_unidades)
    for idx, u in enumerate(lista_unidades):
        dia_novo, aula_novo = posicoes[(idx + 1) % n]
        for i in u:
            nova[i]["dia"], nova[i]["aula"] = dia_novo, aula_novo
    return nova


def gerar_trocas_candidatas(aulas, ctx, k, rng):
    """
    IMPORTANTE: trocar duas aulas do MESMO professor entre si e um
    no-op pra janela dele (o conjunto de horarios ocupados nao muda,
    so troca qual materia fica onde). Pra reduzir janela de verdade a
    troca precisa envolver PROFESSORES DIFERENTES - um cede o horario
    que o outro precisa, e vice-versa.

    Gera dois tipos de movimento:
      - swap de PAR (2 unidades) - a maioria das trocas, mais barato
        de validar
      - cadeia de 3-4 unidades (rotacao ciclica) - pra escapar de
        minimos locais que o swap de par nao alcanca numa grade 100%
        compacta

    Unidades marcadas como fixas (ctx["unidades_fixas"]) NUNCA entram
    como candidatas - sao posicoes travadas por um `fixar` anterior
    (ex.: professor-ponte ja coordenado entre Fundamental e Medio/
    Tecnico) e mexer nelas aqui desfaria essa coordenacao.

    Pra acelerar a convergencia, prioriza escolher a unidade inicial
    entre professores que JA TEM janela agora (em vez de sortear 100%
    as cegas).
    """
    candidatos = []
    unidades = ctx["unidades"]
    unidades_fixas = ctx["unidades_fixas"]
    n = len(unidades)
    tentativas = 0
    max_tentativas = k * 12

    professores_por_unidade = [{aulas[i]["professor"] for i in u} for u in unidades]
    indices_moviveis = [i for i in range(n) if not unidades_fixas[i]]
    if not indices_moviveis:
        return candidatos

    prof_com_janela = _professores_com_janela(aulas)

    def escolher_unidade_inicial():
        if prof_com_janela and rng.random() < 0.7:
            prof_alvo = rng.choice(list(prof_com_janela))
            candidatas = [
                idx for idx in indices_moviveis if prof_alvo in professores_por_unidade[idx]
            ]
            if candidatas:
                return rng.choice(candidatas)
        return rng.choice(indices_moviveis)

    while len(candidatos) < k and tentativas < max_tentativas:
        tentativas += 1

        usar_cadeia = rng.random() < 0.4  # 40% cadeia (3-4), 60% swap de par

        if not usar_cadeia:
            ua = escolher_unidade_inicial()
            profs_a = professores_por_unidade[ua]
            candidatas_b = [
                idx for idx in indices_moviveis
                if idx != ua and professores_por_unidade[idx] - profs_a
            ]
            if not candidatas_b:
                continue
            ub = rng.choice(candidatas_b)
            nova = _aplicar_troca(aulas, unidades[ua], unidades[ub])
        else:
            tamanho = 3 if rng.random() < 0.7 else 4
            primeira = escolher_unidade_inicial()
            pool_resto = [idx for idx in indices_moviveis if idx != primeira]
            if len(pool_resto) < tamanho - 1:
                continue
            resto = rng.sample(pool_resto, tamanho - 1)
            cadeia_idxs = [primeira] + resto
            profs_envolvidos = set()
            for idx in cadeia_idxs:
                profs_envolvidos |= professores_por_unidade[idx]
            if len(profs_envolvidos) < 2:
                continue  # todo mundo do mesmo professor -- no-op
            nova = _aplicar_cadeia(aulas, [unidades[idx] for idx in cadeia_idxs])

        if _restricoes_ok(nova, ctx):
            candidatos.append(nova)

    return candidatos


def _professores_com_janela(aulas):
    por_prof_dia = defaultdict(set)
    for a in aulas:
        por_prof_dia[(a["professor"], a["dia"])].add(a["aula"])
    profs = set()
    for (prof, _dia), slots in por_prof_dia.items():
        if len(slots) < 2:
            continue
        mn, mx = min(slots), max(slots)
        if any(s not in slots for s in range(mn, mx + 1)):
            profs.add(prof)
    return profs


def reduzir_janelas(
    aulas,
    disciplinas_turma_raw,
    bloqueios_raw,
    aulas_por_dia,
    max_iter=3000,
    tempo_limite_s=20,
    temperatura_inicial=5.0,
    resfriamento=0.995,
    k_candidatos=8,
    seed=None,
    verbose=False,
    fixadas=None,
):
    """
    Recebe a grade ja viavel (resultado["aulas"] de gerar_grade()) e as
    listas cruas originais (disciplinas_turma_raw, bloqueios_raw -- as
    MESMAS ja passadas pra gerar_grade()), devolve:

        (aulas_otimizadas, janelas_antes, janelas_depois)

    `fixadas`: set opcional de (turma, codigoSae, professor) que NUNCA
    podem ser movidas (ex.: posicoes de professor-ponte ja coordenadas
    entre Fundamental e Medio/Tecnico via `fixar` no solver - mexer
    nelas aqui desfaria essa coordenacao).
    """
    ctx = preparar_contexto(aulas, disciplinas_turma_raw, bloqueios_raw, aulas_por_dia, fixadas)

    rng = random.Random(seed)
    atual = [dict(a) for a in aulas]
    melhor = [dict(a) for a in atual]
    janelas_atual = contar_janelas_professor(atual)
    janelas_antes = janelas_atual
    janelas_melhor = janelas_atual

    if verbose:
        print(f"[inicio] janelas de professor = {janelas_atual}")

    T = temperatura_inicial
    inicio = time.time()

    for i in range(max_iter):
        if time.time() - inicio > tempo_limite_s:
            if verbose:
                print(f"[parada] tempo limite atingido na iteracao {i}")
            break
        if janelas_melhor == 0:
            if verbose:
                print(f"[parada] zero janelas atingido na iteracao {i}")
            break

        candidatos = gerar_trocas_candidatas(atual, ctx, k_candidatos, rng)
        if not candidatos:
            continue

        avaliados = sorted(
            ((c, contar_janelas_professor(c)) for c in candidatos), key=lambda x: x[1]
        )
        melhor_candidato, janelas_candidato = avaliados[0]

        delta = janelas_candidato - janelas_atual
        aceitar = delta <= 0 or rng.random() < math.exp(-delta / max(T, 1e-6))

        if aceitar:
            atual = melhor_candidato
            janelas_atual = janelas_candidato
            if janelas_atual < janelas_melhor:
                melhor = [dict(a) for a in atual]
                janelas_melhor = janelas_atual
                if verbose:
                    print(f"[iter {i}] nova melhor: {janelas_melhor} janelas")

        T *= resfriamento

    if verbose:
        print(f"[fim] janelas antes={janelas_antes} depois={janelas_melhor}")

    return melhor, janelas_antes, janelas_melhor
