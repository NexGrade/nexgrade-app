"""
Motor de geração de grade horária com CP-SAT.

Reaproveita exatamente a modelagem validada em spike-cp-sat/spike_teste_escala_real.py
(6 restrições + objetivo de minimizar janelas), estendida para devolver a alocação
completa (turma, disciplina, professor, dia, aula) em vez de só o status do solver.
"""

from ortools.sat.python import cp_model
from dataclasses import dataclass
from typing import Optional
import time

TETO_AULAS_TURNO = {"noturno": 19, "matutino": 24, "vespertino": 24}
DIAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"]


@dataclass
class DisciplinaTurma:
    turma: str
    codigo_sae: str
    nome: str
    aulas_semana: int
    professor: str
    max_aulas_dia: int
    # [FIX] Limite de aula pra turmas de nivel de ensino diferente
    # dentro do mesmo turno (ex.: Fundamental=5 aulas/dia,
    # Medio/Tecnico=6 aulas/dia no mesmo matutino). None = usa
    # aulas_por_dia do turno inteiro (comportamento antigo).
    ultima_aula_turma: int | None = None


def resolver(
    disciplinas_turma: list[DisciplinaTurma],
    bloqueios: set[tuple[str, int, int]],
    turno: str,
    aulas_por_dia: int,
    turmas_nomes: set[str],
    tempo_limite_s: int = 120,
):
    model = cp_model.CpModel()

    aula_var = {}
    for dt_idx, dt in enumerate(disciplinas_turma):
        for dia in range(len(DIAS)):
            for aula in range(1, aulas_por_dia + 1):
                aula_var[(dt_idx, dia, aula)] = model.NewBoolVar(f"a_{dt_idx}_{dia}_{aula}")

    # RESTRIÇÃO 1 — carga horária semanal exata
    for dt_idx, dt in enumerate(disciplinas_turma):
        model.Add(
            sum(aula_var[(dt_idx, dia, aula)] for dia in range(len(DIAS)) for aula in range(1, aulas_por_dia + 1))
            == dt.aulas_semana
        )

    # RESTRIÇÃO 2 — turma sem 2 aulas no mesmo horário
    for turma in turmas_nomes:
        indices_turma = [i for i, dt in enumerate(disciplinas_turma) if dt.turma == turma]
        for dia in range(len(DIAS)):
            for aula in range(1, aulas_por_dia + 1):
                model.Add(sum(aula_var[(i, dia, aula)] for i in indices_turma) <= 1)

    # RESTRIÇÃO 3 — professor sem 2 turmas ao mesmo tempo
    professores = {dt.professor for dt in disciplinas_turma}
    for prof in professores:
        indices_prof = [i for i, dt in enumerate(disciplinas_turma) if dt.professor == prof]
        for dia in range(len(DIAS)):
            for aula in range(1, aulas_por_dia + 1):
                model.Add(sum(aula_var[(i, dia, aula)] for i in indices_prof) <= 1)

    # RESTRIÇÃO 4 — teto de aulas por turno (SEED-PR art. 11 §3º)
    teto = TETO_AULAS_TURNO.get(turno, 24)
    for prof in professores:
        indices = [i for i, dt in enumerate(disciplinas_turma) if dt.professor == prof]
        total = sum(
            aula_var[(i, dia, aula)]
            for i in indices
            for dia in range(len(DIAS))
            for aula in range(1, aulas_por_dia + 1)
        )
        model.Add(total <= teto)

    # RESTRIÇÃO 5 — máximo de aulas geminadas por dia
    for dt_idx, dt in enumerate(disciplinas_turma):
        for dia in range(len(DIAS)):
            total_dia = sum(aula_var[(dt_idx, dia, aula)] for aula in range(1, aulas_por_dia + 1))
            model.Add(total_dia <= dt.max_aulas_dia)

    # RESTRIÇÃO 6 — bloqueios de disponibilidade do professor
    for dt_idx, dt in enumerate(disciplinas_turma):
        for (prof, dia, aula) in bloqueios:
            if dt.professor == prof and 1 <= aula <= aulas_por_dia:
                model.Add(aula_var[(dt_idx, dia, aula)] == 0)

    # limite de aula por nivel de ensino da turma (ex.: Fundamental com
    # menos aulas por dia que Medio/Tecnico no mesmo turno)
    for dt_idx, dt in enumerate(disciplinas_turma):
        if dt.ultima_aula_turma is None or dt.ultima_aula_turma >= aulas_por_dia:
            continue
        for dia in range(len(DIAS)):
            for aula in range(dt.ultima_aula_turma + 1, aulas_por_dia + 1):
                model.Add(aula_var[(dt_idx, dia, aula)] == 0)

    # OBJETIVO — minimizar janelas (buracos) por turma/dia
    penalidades = []
    for turma in turmas_nomes:
        indices_turma = [i for i, dt in enumerate(disciplinas_turma) if dt.turma == turma]
        if not indices_turma:
            continue
        for dia in range(len(DIAS)):
            ocupado = []
            for aula in range(1, aulas_por_dia + 1):
                v = model.NewBoolVar(f"ocupado_{turma}_{dia}_{aula}")
                model.Add(sum(aula_var[(i, dia, aula)] for i in indices_turma) == v)
                ocupado.append(v)
            for a in range(1, aulas_por_dia - 1):
                buraco = model.NewBoolVar(f"buraco_{turma}_{dia}_{a}")
                model.AddBoolAnd([ocupado[a - 1], ocupado[a].Not(), ocupado[a + 1]]).OnlyEnforceIf(buraco)
                model.AddBoolOr([ocupado[a - 1].Not(), ocupado[a], ocupado[a + 1].Not()]).OnlyEnforceIf(buraco.Not())
                penalidades.append(buraco)

    model.Minimize(sum(penalidades))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = tempo_limite_s
    solver.parameters.num_search_workers = 8
    status = solver.Solve(model)

    return solver, status, aula_var


def gerar_grade(
    disciplinas_turma_raw: list[dict],
    bloqueios_raw: list[dict],
    turno: str,
    aulas_por_dia: int,
    turmas_raw: list[dict],
    tempo_limite_s: int = 120,
) -> dict:
    """
    Recebe o mesmo formato JSON exportado por scripts/exportar-dados-cpsat.ts
    e devolve a grade otimizada (ou o motivo da falha, se inviável).
    """
    disciplinas_turma = [
        DisciplinaTurma(
            turma=d["turma"],
            codigo_sae=d["codigoSae"],
            nome=d["nome"],
            aulas_semana=d["aulasSemana"],
            professor=d["professor"],
            max_aulas_dia=d["maxAulasDia"],
            ultima_aula_turma=d.get("ultimaAulaTurma"),
        )
        for d in disciplinas_turma_raw
    ]
    bloqueios = {(b["professor"], b["dia"], b["aula"]) for b in bloqueios_raw}
    turmas_nomes = {t["nome"] for t in turmas_raw}

    inicio = time.time()
    solver, status, aula_var = resolver(
        disciplinas_turma, bloqueios, turno, aulas_por_dia, turmas_nomes, tempo_limite_s
    )
    duracao = time.time() - inicio

    status_nome = solver.StatusName(status)

    resultado = {
        "status": status_nome,
        "otimo": status == cp_model.OPTIMAL,
        "viavel": status in (cp_model.OPTIMAL, cp_model.FEASIBLE),
        "tempoResolucaoS": round(duracao, 3),
        "tempoParedeS": round(solver.WallTime(), 3),
        "aulas": [],
    }

    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        aulas = []
        for dt_idx, dt in enumerate(disciplinas_turma):
            for dia in range(len(DIAS)):
                for aula in range(1, aulas_por_dia + 1):
                    if solver.Value(aula_var[(dt_idx, dia, aula)]):
                        aulas.append(
                            {
                                "turma": dt.turma,
                                "codigoSae": dt.codigo_sae,
                                "disciplina": dt.nome,
                                "professor": dt.professor,
                                "dia": dia,
                                "diaNome": DIAS[dia],
                                "aula": aula,
                            }
                        )
        resultado["aulas"] = aulas
    else:
        resultado["mensagem"] = (
            "Não existe grade que satisfaça todas as restrições com esses dados "
            "(disponibilidade dos professores + teto de aulas por turno)."
            if status == cp_model.INFEASIBLE
            else f"Solver não terminou dentro do tempo limite de {tempo_limite_s}s."
        )

    return resultado
