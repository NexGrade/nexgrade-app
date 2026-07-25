"""
TESTE EM ESCALA REAL — Motor de horário com CP-SAT, usando dados reais
=======================================================================

Continuação do spike original (spike_horario_cp_sat.py), agora:
  1. Carrega dados REAIS exportados do banco de produção (não mais
     dados fixos de exemplo com só 3 turmas) — ver
     scripts/exportar-dados-cpsat.ts
  2. Testa o turno MATUTINO inteiro (~24 turmas reais), não só 3
  3. Corrige um bug do spike original: a detecção de "janela" (buraco
     entre duas aulas ocupadas) usava a mesma variável duas vezes
     (`ocupado[a-1]` repetida) e nunca checava se o slot do meio
     estava realmente vazio — agora corrigido pra checar
     [ocupado_antes, vazio_no_meio, ocupado_depois] de verdade

Como rodar:
    1. No PowerShell: npx tsx scripts/exportar-dados-cpsat.ts
       (gera spike-cp-sat/dados-reais-matutino.json)
    2. pip install ortools
    3. python3 spike_teste_escala_real.py
"""

from ortools.sat.python import cp_model
from dataclasses import dataclass
import json
import sys
import time

TETO_AULAS_TURNO = {"noturno": 19, "matutino": 24, "vespertino": 24}


@dataclass
class DisciplinaTurma:
    turma: str
    codigo_sae: str
    nome: str
    aulas_semana: int
    professor: str
    max_aulas_dia: int


def carregar_dados(caminho: str):
    with open(caminho, encoding="utf-8") as f:
        dados = json.load(f)

    disciplinas_turma = [
        DisciplinaTurma(
            turma=d["turma"], codigo_sae=d["codigoSae"], nome=d["nome"],
            aulas_semana=d["aulasSemana"], professor=d["professor"], max_aulas_dia=d["maxAulasDia"],
        )
        for d in dados["disciplinasTurma"]
    ]
    bloqueios = {(b["professor"], b["dia"], b["aula"]) for b in dados["bloqueiosProfessor"]}
    turno = dados["turno"]
    aulas_por_dia = dados["aulasPorDia"]
    turmas_nomes = {t["nome"] for t in dados["turmas"]}

    return disciplinas_turma, bloqueios, turno, aulas_por_dia, turmas_nomes


def resolver(disciplinas_turma, bloqueios, turno, aulas_por_dia, turmas_nomes, tempo_limite_s=120):
    dias = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"]
    model = cp_model.CpModel()

    aula_var = {}
    for dt_idx, dt in enumerate(disciplinas_turma):
        for dia in range(len(dias)):
            for aula in range(1, aulas_por_dia + 1):
                aula_var[(dt_idx, dia, aula)] = model.NewBoolVar(f"a_{dt_idx}_{dia}_{aula}")

    # RESTRIÇÃO 1 — carga horária semanal exata
    for dt_idx, dt in enumerate(disciplinas_turma):
        model.Add(
            sum(aula_var[(dt_idx, dia, aula)] for dia in range(len(dias)) for aula in range(1, aulas_por_dia + 1))
            == dt.aulas_semana
        )

    # RESTRIÇÃO 2 — turma sem 2 aulas no mesmo horário
    for turma in turmas_nomes:
        indices_turma = [i for i, dt in enumerate(disciplinas_turma) if dt.turma == turma]
        for dia in range(len(dias)):
            for aula in range(1, aulas_por_dia + 1):
                model.Add(sum(aula_var[(i, dia, aula)] for i in indices_turma) <= 1)

    # RESTRIÇÃO 3 — professor sem 2 turmas ao mesmo tempo
    professores = {dt.professor for dt in disciplinas_turma}
    for prof in professores:
        indices_prof = [i for i, dt in enumerate(disciplinas_turma) if dt.professor == prof]
        for dia in range(len(dias)):
            for aula in range(1, aulas_por_dia + 1):
                model.Add(sum(aula_var[(i, dia, aula)] for i in indices_prof) <= 1)

    # RESTRIÇÃO 4 — teto de aulas por turno (SEED-PR art. 11 §3º)
    teto = TETO_AULAS_TURNO.get(turno, 24)
    for prof in professores:
        indices = [i for i, dt in enumerate(disciplinas_turma) if dt.professor == prof]
        total = sum(aula_var[(i, dia, aula)] for i in indices for dia in range(len(dias)) for aula in range(1, aulas_por_dia + 1))
        model.Add(total <= teto)

    # RESTRIÇÃO 5 — máximo de aulas geminadas por dia
    for dt_idx, dt in enumerate(disciplinas_turma):
        for dia in range(len(dias)):
            total_dia = sum(aula_var[(dt_idx, dia, aula)] for aula in range(1, aulas_por_dia + 1))
            model.Add(total_dia <= dt.max_aulas_dia)

    # RESTRIÇÃO 6 — bloqueios de disponibilidade do professor
    for dt_idx, dt in enumerate(disciplinas_turma):
        for (prof, dia, aula) in bloqueios:
            if dt.professor == prof and 1 <= aula <= aulas_por_dia:
                model.Add(aula_var[(dt_idx, dia, aula)] == 0)

    # OBJETIVO — minimizar janelas (buracos) por turma/dia.
    # [FIX] Corrigido em relação ao spike original: antes checava
    # [ocupado[a-1], ocupado[a-1]] (a mesma variável duas vezes) e
    # nunca verificava se o slot DO MEIO estava vazio -- agora checa
    # de verdade [ocupado antes, vazio no meio, ocupado depois].
    penalidades = []
    for turma in turmas_nomes:
        indices_turma = [i for i, dt in enumerate(disciplinas_turma) if dt.turma == turma]
        if not indices_turma:
            continue
        for dia in range(len(dias)):
            ocupado = []
            for aula in range(1, aulas_por_dia + 1):
                v = model.NewBoolVar(f"ocupado_{turma}_{dia}_{aula}")
                model.Add(sum(aula_var[(i, dia, aula)] for i in indices_turma) == v)
                ocupado.append(v)
            for a in range(1, aulas_por_dia - 1):  # a = índice do slot do MEIO (0-based sobre a lista `ocupado`)
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


def main():
    caminho = sys.argv[1] if len(sys.argv) > 1 else "dados-reais-matutino.json"
    print("=" * 70)
    print("TESTE EM ESCALA REAL — CP-SAT com dados reais do NexGrade")
    print("=" * 70)

    disciplinas_turma, bloqueios, turno, aulas_por_dia, turmas_nomes = carregar_dados(caminho)
    print(f"\nCarregado: {len(turmas_nomes)} turmas, {len(disciplinas_turma)} combinações turma+disciplina, "
          f"{len(bloqueios)} bloqueios de disponibilidade, turno={turno}, {aulas_por_dia} aulas/dia\n")

    inicio = time.time()
    solver, status, aula_var = resolver(disciplinas_turma, bloqueios, turno, aulas_por_dia, turmas_nomes)
    duracao = time.time() - inicio

    if status == cp_model.OPTIMAL:
        print(f"✅ SOLUÇÃO ÓTIMA encontrada em {duracao:.2f}s (sem nenhuma janela evitável)")
    elif status == cp_model.FEASIBLE:
        print(f"✅ Solução VÁLIDA encontrada em {duracao:.2f}s (não necessariamente perfeita — bateu no tempo limite)")
    elif status == cp_model.INFEASIBLE:
        print(f"❌ INVIÁVEL — não existe nenhuma grade que satisfaça todas as restrições com esses dados ({duracao:.2f}s)")
        print("   Isso confirma matematicamente (não é achismo) que a carga atual excede a capacidade real")
        print("   dos professores envolvidos, considerando disponibilidade e teto de turno.")
    else:
        print(f"⚠️  Status: {solver.StatusName(status)} — não terminou de resolver em {duracao:.2f}s (aumente o tempo limite)")

    print(f"\nStatus bruto do solver: {solver.StatusName(status)}")
    print(f"Tempo de parede: {solver.WallTime():.3f}s")


if __name__ == "__main__":
    main()
