"""
pipeline_coordenada.py — pipeline de geracao coordenada pra turnos que
misturam Fundamental e Medio/Tecnico (cpsat-service).

Resolve o problema de professores-ponte (dao aula nos dois niveis)
gerando uma passada de coordenacao com objetivo de janela ANTES de
gerar Fundamental e Medio/Tecnico separados, fixando a posicao dos
pontes nas duas fases completas. Roda a pipeline inteira N vezes
(o CP-SAT tem variacao real entre execucoes, confirmado em testes:
mesma config pode dar 26 ou 58 janelas) e devolve a melhor.

Validado em teste local/GCP com dado real (C.E. Mario B.T. Braga,
24 turmas, 07-09/09/2026): melhor resultado de 8-10 tentativas foi
26 janelas de professor, contra 49-58 numa tentativa unica.
"""

import time
from collections import defaultdict

from ortools.sat.python import cp_model

from .solver import gerar_grade, resolver, DisciplinaTurma


def _contar_janelas(aulas, chave_grupo):
    por_grupo_dia = {}
    for a in aulas:
        chave = (chave_grupo(a), a["dia"])
        por_grupo_dia.setdefault(chave, set()).add(a["aula"])
    total = 0
    for slots in por_grupo_dia.values():
        if len(slots) < 2:
            continue
        mn, mx = min(slots), max(slots)
        total += sum(1 for s in range(mn, mx + 1) if s not in slots)
    return total


def _checar_conflito_entre_fases(aulas_fund, aulas_medio):
    ocupacao = defaultdict(list)
    for a in aulas_fund:
        ocupacao[(a["professor"], a["dia"], a["aula"])].append(a)
    conflitos = []
    for a in aulas_medio:
        chave = (a["professor"], a["dia"], a["aula"])
        if chave in ocupacao:
            conflitos.append(a)
    return conflitos


def _coordenar_pontes(disciplinas_turma_raw, bloqueios_raw, turno, aulas_por_dia,
                       nomes_fundamental, nomes_medio, tempo_limite_s):
    profs_fund = {d["professor"] for d in disciplinas_turma_raw if d["turma"] in nomes_fundamental}
    profs_medio = {d["professor"] for d in disciplinas_turma_raw if d["turma"] in nomes_medio}
    pontes = profs_fund & profs_medio

    todas_turmas_nomes = nomes_fundamental | nomes_medio
    disciplinas_turma = [
        DisciplinaTurma(
            turma=d["turma"], codigo_sae=d["codigoSae"], nome=d["nome"],
            aulas_semana=d["aulasSemana"], professor=d["professor"],
            max_aulas_dia=d["maxAulasDia"], ultima_aula_turma=d.get("ultimaAulaTurma"),
            grupo_dupla=d.get("grupoDupla"),
            assincrona=bool(d.get("assincrona", False)),  # [ASSINCRONA-TRIO]
        )
        for d in disciplinas_turma_raw if d["turma"] in todas_turmas_nomes
    ]
    bloqueios = {(b["professor"], b["dia"], b["aula"]) for b in bloqueios_raw}

    solver_obj, status, aula_var = resolver(
        disciplinas_turma, bloqueios, turno, aulas_por_dia, todas_turmas_nomes,
        tempo_limite_s=tempo_limite_s, apenas_turma=False,
    )
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return None

    fixar_raw = []
    for dt_idx, dt in enumerate(disciplinas_turma):
        if dt.professor not in pontes:
            continue
        for dia in range(5):
            for aula in range(1, aulas_por_dia + 1):
                if solver_obj.Value(aula_var[(dt_idx, dia, aula)]):
                    fixar_raw.append({
                        "turma": dt.turma, "codigoSae": dt.codigo_sae,
                        "professor": dt.professor, "dia": dia, "aula": aula,
                    })
    return fixar_raw


def _rodar_uma_tentativa(disciplinas_turma_raw, bloqueios_raw, turno, aulas_por_dia,
                          turmas_raw, nomes_fundamental, nomes_medio,
                          tempo_coordenacao_s, tempo_fase_s, tempo_fase3_s):
    fixar_raw = _coordenar_pontes(
        disciplinas_turma_raw, bloqueios_raw, turno, aulas_por_dia,
        nomes_fundamental, nomes_medio, tempo_coordenacao_s,
    )
    if fixar_raw is None:
        return None

    disc_fund = [d for d in disciplinas_turma_raw if d["turma"] in nomes_fundamental]
    disc_medio = [d for d in disciplinas_turma_raw if d["turma"] in nomes_medio]
    turmas_fund = [t for t in turmas_raw if t["nome"] in nomes_fundamental]
    turmas_medio = [t for t in turmas_raw if t["nome"] in nomes_medio]

    resultado_fund = gerar_grade(
        disciplinas_turma_raw=disc_fund, bloqueios_raw=bloqueios_raw,
        turno=turno, aulas_por_dia=aulas_por_dia, turmas_raw=turmas_fund,
        tempo_limite_s=tempo_fase_s, fixar_raw=fixar_raw,
    )
    if not resultado_fund["viavel"]:
        return None

    resultado_medio = gerar_grade(
        disciplinas_turma_raw=disc_medio, bloqueios_raw=bloqueios_raw,
        turno=turno, aulas_por_dia=aulas_por_dia, turmas_raw=turmas_medio,
        tempo_limite_s=tempo_fase_s, fixar_raw=fixar_raw,
    )
    if not resultado_medio["viavel"]:
        return None

    aulas_fund = resultado_fund["aulas"]
    aulas_medio = resultado_medio["aulas"]

    if _checar_conflito_entre_fases(aulas_fund, aulas_medio):
        return None

    aulas_combinadas = aulas_fund + aulas_medio

    if _contar_janelas(aulas_combinadas, lambda a: a["turma"]) != 0:
        return None

    janelas_professor = _contar_janelas(aulas_combinadas, lambda a: a["professor"])

    return {
        "aulas": aulas_combinadas,
        "janelasProfessor": janelas_professor,
        "otimoFundamental": resultado_fund["otimo"],
        "otimoMedioTecnico": resultado_medio["otimo"],
    }


def gerar_grade_coordenada(
    disciplinas_turma_raw: list[dict],
    bloqueios_raw: list[dict],
    turno: str,
    aulas_por_dia: int,
    turmas_raw: list[dict],
    n_tentativas: int = 5,
    tempo_coordenacao_s: int = 120,
    tempo_fase_s: int = 300,
    tempo_fase3_s: int = 60,
) -> dict:
    """
    Gera a grade de um turno que mistura Fundamental e Medio/Tecnico,
    coordenando professores-ponte e rodando a pipeline inteira
    `n_tentativas` vezes (o CP-SAT varia entre execucoes), devolvendo
    a melhor tentativa viavel.

    `turmas_raw` PRECISA ter o campo "nivelEnsino" em cada item
    ("fundamental" ou qualquer outro valor pra Medio/Tecnico) -- sem
    isso nao da pra separar as duas fases pra coordenar.

    Retorna:
        {
            "viavel": bool,
            "aulas": [...],              # so se viavel
            "janelasProfessor": int,     # so se viavel
            "tentativas": int,           # quantas tentativas viaveis saíram
            "tempoTotalS": float,
            "mensagem": str,             # so se nao viavel
        }
    """
    nomes_fundamental = {t["nome"] for t in turmas_raw if t.get("nivelEnsino") == "fundamental"}
    nomes_medio = {
        t["nome"] for t in turmas_raw
        if t.get("nivelEnsino") is not None and t.get("nivelEnsino") != "fundamental"
    }

    if not nomes_fundamental or not nomes_medio:
        return {
            "viavel": False,
            "mensagem": (
                "gerar_grade_coordenada() e so pra turnos com Fundamental E "
                "Medio/Tecnico misturados. Se o turno for so um nivel, use "
                "gerar_grade() direto (mais simples e mais rapido)."
            ),
        }

    t0 = time.time()
    melhor = None
    tentativas_viaveis = 0

    for _ in range(n_tentativas):
        resultado = _rodar_uma_tentativa(
            disciplinas_turma_raw, bloqueios_raw, turno, aulas_por_dia, turmas_raw,
            nomes_fundamental, nomes_medio,
            tempo_coordenacao_s, tempo_fase_s, tempo_fase3_s,
        )
        if resultado is None:
            continue
        tentativas_viaveis += 1
        if melhor is None or resultado["janelasProfessor"] < melhor["janelasProfessor"]:
            melhor = resultado

    tempo_total = round(time.time() - t0, 2)

    if melhor is None:
        return {
            "viavel": False,
            "tentativas": 0,
            "tempoTotalS": tempo_total,
            "mensagem": (
                f"Nenhuma das {n_tentativas} tentativas produziu uma grade viavel "
                "(conflito de professor-ponte entre fases, ou turma com janela). "
                "Pode ser inviabilidade genuina de disponibilidade -- reveja os "
                "bloqueios dos professores-ponte."
            ),
        }

    return {
        "viavel": True,
        "aulas": melhor["aulas"],
        "janelasProfessor": melhor["janelasProfessor"],
        "otimoFundamental": melhor["otimoFundamental"],
        "otimoMedioTecnico": melhor["otimoMedioTecnico"],
        "tentativas": tentativas_viaveis,
        "tentativasTotal": n_tentativas,
        "tempoTotalS": tempo_total,
    }
