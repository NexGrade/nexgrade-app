"""
SPIKE — Teste 2: detecção de inviabilidade

Mesmo cenário do spike principal, mas forço um professor a ter carga
impossível de caber no teto de aulas por turno (SEED-PR art. 11, §3º) —
pra provar que o CP-SAT recusa e explica, em vez de gerar uma grade
que na prática desrespeita a norma sem avisar ninguém (o risco real da
heurística gulosa atual).
"""

from ortools.sat.python import cp_model
from spike_horario_cp_sat import DIAS, AULAS_POR_DIA, DisciplinaTurma, Turma

# Mesmo professor (Fernanda Costa) sobrecarregado deliberadamente: 25
# aulas semanais de uma disciplina só, no turno noturno (teto real = 19).
TURMAS = [Turma("1 Serie Tec ADM", "noturno")]
DISCIPLINAS_TURMA = [
    DisciplinaTurma("1 Serie Tec ADM", "ADM02", "Contabilidade Geral", 25, "Fernanda Costa", 3),
]

model = cp_model.CpModel()
aula_var = {}
for dt_idx, dt in enumerate(DISCIPLINAS_TURMA):
    for dia in range(len(DIAS)):
        for aula in range(1, AULAS_POR_DIA + 1):
            aula_var[(dt_idx, dia, aula)] = model.NewBoolVar(f"a_{dia}_{aula}")

# Carga semanal exigida
for dt_idx, dt in enumerate(DISCIPLINAS_TURMA):
    model.Add(sum(aula_var[(dt_idx, d, a)] for d in range(len(DIAS)) for a in range(1, AULAS_POR_DIA + 1)) == dt.aulas_semana)

# Teto real do turno noturno (SEED-PR art. 11, §3º) = 19 aulas/semana
TETO_NOTURNO = 19
total = sum(aula_var[(0, d, a)] for d in range(len(DIAS)) for a in range(1, AULAS_POR_DIA + 1))
model.Add(total <= TETO_NOTURNO)

solver = cp_model.CpSolver()
status = solver.Solve(model)

print("=" * 70)
print("SPIKE — Teste de inviabilidade (professor sobrecarregado de propósito)")
print("=" * 70)
print(f"\nCarga pedida: 25 aulas/semana | Teto legal do turno noturno: {TETO_NOTURNO} aulas/semana")
print(f"Status do solver: {solver.StatusName(status)}\n")

if status == cp_model.INFEASIBLE:
    print("✅ CP-SAT recusou corretamente — matematicamente impossível caber 25 aulas")
    print("   num teto de 19, e ele SABE disso e AVISA, em vez de gerar uma grade que")
    print("   silenciosamente estoura o limite legal (que é o que uma heurística gulosa,")
    print("   sem essa restrição modelada explicitamente, poderia acabar fazendo).")
else:
    print("⚠️ Resultado inesperado — reveja o teste.")
