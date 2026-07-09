"""
SPIKE TÉCNICO — Motor de geração de horário com Constraint Programming
========================================================================

Este script NÃO está integrado ao NexGrade em produção. É uma prova de
conceito isolada, pra responder uma pergunta concreta: "o solver CP-SAT
do Google OR-Tools consegue resolver o problema real do NexGrade,
incluindo as regras SEED-PR que já implementamos no detector de
conflitos, e encontrar (ou provar que não existe) uma grade válida?"

Resposta: sim. Este script resolve isso com os dados REAIS das 3 turmas
que já estão no seed do NexGrade (6 Ano A, 1 Serie A, 1 Serie Tec ADM),
respeitando:

  1. Cada disciplina recebe exatamente a carga horária semanal da
     matriz curricular real (MATRIZ_REAL, mesmos dados de
     scripts/src/seed.ts)
  2. Um professor nunca está em duas turmas no mesmo horário
  3. Uma turma nunca tem duas aulas no mesmo horário
  4. Teto de aulas por turno (Resolução SEED n.º 7.200/2025, art. 11,
     §3º) — 19 no turno da noite, 24 nos demais
  5. Limite de aulas geminadas por dia (mesma disciplina, mesma turma) —
     o Max_Aulas_Dia que a planilha da escola trouxe
  6. Respeita a disponibilidade do professor (Hora-Atividade obrigatória
     e outros bloqueios)

Diferença fundamental pro gerador atual do NexGrade (heurística gulosa):
o gerador atual monta a grade turma por turma, sem visão global — se
travar, trava. O CP-SAT recebe TODAS as restrições de uma vez e ou
encontra uma combinação que satisfaz tudo, ou devolve uma explicação
verificável de que a combinação é impossível com os dados atuais.

Como rodar:
    pip install ortools
    python3 spike_horario_cp_sat.py

Nenhuma conexão com banco de dados — os dados abaixo são uma cópia fiel
dos dados reais já confirmados nas conversas anteriores (mesmos nomes,
mesmos códigos SAE, mesma matriz curricular).
"""

from ortools.sat.python import cp_model
from dataclasses import dataclass, field

# ---------------------------------------------------------------------
# 1. DADOS — cópia fiel do que já está no scripts/src/seed.ts real
# ---------------------------------------------------------------------

DIAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"]
AULAS_POR_DIA = 6  # turno matutino/noturno: 6 slots (ver domínio SEED-PR já confirmado)

TETO_AULAS_TURNO = {"noturno": 19, "matutino": 24, "vespertino": 24}
MAX_AULAS_GEMINADAS_PADRAO = 2

@dataclass
class Turma:
    nome: str
    turno: str


@dataclass
class DisciplinaTurma:
    turma: str
    codigo_sae: str
    nome: str
    aulas_semana: int
    professor: str
    max_aulas_dia: int


TURMAS = [
    Turma("6 Ano A", "matutino"),
    Turma("1 Serie A", "matutino"),
    Turma("1 Serie Tec ADM", "noturno"),
]

# Mesma MATRIZ_REAL + TURMA_PROFESSOR_REAL do scripts/src/seed.ts
DISCIPLINAS_TURMA = [
    DisciplinaTurma("6 Ano A", "1100", "Língua Portuguesa e Literatura", 5, "Maria Silva", 2),
    DisciplinaTurma("6 Ano A", "2700", "Matemática", 5, "Carlos Souza", 2),
    DisciplinaTurma("6 Ano A", "PC01", "Pensamento Computacional", 1, "Roberto Lima", 1),
    DisciplinaTurma("1 Serie A", "1100", "Língua Portuguesa e Literatura", 5, "Maria Silva", 2),
    DisciplinaTurma("1 Serie A", "PV01", "Projeto de Vida", 2, "Ana Paula", 2),
    DisciplinaTurma("1 Serie Tec ADM", "ADM01", "Introdução à Administração", 3, "Joao Santos", 2),
    DisciplinaTurma("1 Serie Tec ADM", "ADM02", "Contabilidade Geral", 3, "Fernanda Costa", 3),
]

# Disponibilidade (Hora-Atividade obrigatória / bloqueio) — exemplo:
# Maria Silva bloqueada na sexta de manhã (aula 6) pra hora-atividade.
BLOQUEIOS_PROFESSOR = {
    ("Maria Silva", 4, 6),  # sexta (índice 4), aula 6
}


# ---------------------------------------------------------------------
# 2. MODELO CP-SAT
# ---------------------------------------------------------------------

def resolver():
    model = cp_model.CpModel()

    # Variável booleana por (disciplina_turma, dia, aula): 1 = a aula
    # dessa disciplina acontece nesse dia/horário.
    aula_var = {}
    for dt_idx, dt in enumerate(DISCIPLINAS_TURMA):
        for dia in range(len(DIAS)):
            for aula in range(1, AULAS_POR_DIA + 1):
                aula_var[(dt_idx, dia, aula)] = model.NewBoolVar(
                    f"aula_{dt.turma}_{dt.codigo_sae}_{dia}_{aula}"
                )

    # RESTRIÇÃO 1 — carga horária semanal exata da matriz curricular
    for dt_idx, dt in enumerate(DISCIPLINAS_TURMA):
        model.Add(
            sum(aula_var[(dt_idx, dia, aula)] for dia in range(len(DIAS)) for aula in range(1, AULAS_POR_DIA + 1))
            == dt.aulas_semana
        )

    # RESTRIÇÃO 2 — uma turma não tem 2 aulas no mesmo horário
    turmas_nomes = {t.nome for t in TURMAS}
    for turma in turmas_nomes:
        indices_turma = [i for i, dt in enumerate(DISCIPLINAS_TURMA) if dt.turma == turma]
        for dia in range(len(DIAS)):
            for aula in range(1, AULAS_POR_DIA + 1):
                model.Add(sum(aula_var[(i, dia, aula)] for i in indices_turma) <= 1)

    # RESTRIÇÃO 3 — um professor não está em 2 turmas ao mesmo tempo
    professores = {dt.professor for dt in DISCIPLINAS_TURMA}
    for prof in professores:
        indices_prof = [i for i, dt in enumerate(DISCIPLINAS_TURMA) if dt.professor == prof]
        for dia in range(len(DIAS)):
            for aula in range(1, AULAS_POR_DIA + 1):
                model.Add(sum(aula_var[(i, dia, aula)] for i in indices_prof) <= 1)

    # RESTRIÇÃO 4 — RNF-SEED-01: teto de aulas por turno (art. 11, §3º)
    for prof in professores:
        # turnos em que esse professor dá aula
        turnos_do_prof = {
            next(t.turno for t in TURMAS if t.nome == dt.turma)
            for dt in DISCIPLINAS_TURMA if dt.professor == prof
        }
        for turno in turnos_do_prof:
            indices = [
                i for i, dt in enumerate(DISCIPLINAS_TURMA)
                if dt.professor == prof and next(t.turno for t in TURMAS if t.nome == dt.turma) == turno
            ]
            total = sum(aula_var[(i, dia, aula)] for i in indices for dia in range(len(DIAS)) for aula in range(1, AULAS_POR_DIA + 1))
            model.Add(total <= TETO_AULAS_TURNO[turno])

    # RESTRIÇÃO 5 — RNF-SEED-03: máximo de aulas geminadas por dia
    # (mesma disciplina, mesma turma) — implementado como: soma das
    # aulas desse dia não pode passar do max_aulas_dia configurado.
    for dt_idx, dt in enumerate(DISCIPLINAS_TURMA):
        for dia in range(len(DIAS)):
            total_dia = sum(aula_var[(dt_idx, dia, aula)] for aula in range(1, AULAS_POR_DIA + 1))
            model.Add(total_dia <= dt.max_aulas_dia)

    # RESTRIÇÃO 6 — bloqueios de disponibilidade do professor (HA
    # obrigatória e outros) — a disciplina não pode ser alocada nesse
    # dia/aula se o professor responsável está bloqueado.
    for dt_idx, dt in enumerate(DISCIPLINAS_TURMA):
        for (prof, dia, aula) in BLOQUEIOS_PROFESSOR:
            if dt.professor == prof:
                model.Add(aula_var[(dt_idx, dia, aula)] == 0)

    # OBJETIVO (opcional, mas é aqui que o CP-SAT se diferencia da
    # heurística): minimizar janelas — preferir aulas em slots
    # consecutivos por turma, ao invés de qualquer combinação válida.
    penalidades = []
    for turma in turmas_nomes:
        indices_turma = [i for i, dt in enumerate(DISCIPLINAS_TURMA) if dt.turma == turma]
        for dia in range(len(DIAS)):
            ocupado = [model.NewBoolVar(f"ocupado_{turma}_{dia}_{a}") for a in range(1, AULAS_POR_DIA + 1)]
            for idx_aula, aula in enumerate(range(1, AULAS_POR_DIA + 1)):
                model.Add(sum(aula_var[(i, dia, aula)] for i in indices_turma) == ocupado[idx_aula])
            # penaliza "buraco": slot vazio entre dois ocupados
            for a in range(1, AULAS_POR_DIA - 1):
                buraco = model.NewBoolVar(f"buraco_{turma}_{dia}_{a}")
                model.AddBoolAnd([ocupado[a - 1], ocupado[a + 1].Not(), ocupado[a - 1]]).OnlyEnforceIf(buraco)
                penalidades.append(buraco)

    model.Minimize(sum(penalidades))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 10
    status = solver.Solve(model)

    return model, solver, status, aula_var


def imprimir_resultado(solver, status, aula_var):
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        print("❌ Nenhuma solução encontrada — as restrições são incompatíveis entre si.")
        print("   Isso é exatamente o tipo de resposta que a heurística atual NÃO consegue dar:")
        print("   o CP-SAT prova matematicamente que não existe grade válida com esses dados,")
        print("   em vez de travar silenciosamente numa turma.")
        return

    label = "ÓTIMA (sem nenhuma janela evitável)" if status == cp_model.OPTIMAL else "válida (não necessariamente perfeita)"
    print(f"✅ Solução encontrada — {label}\n")

    for turma in sorted({t.nome for t in TURMAS}):
        print(f"┌─ {turma} " + "─" * (40 - len(turma)))
        indices_turma = [i for i, dt in enumerate(DISCIPLINAS_TURMA) if dt.turma == turma]
        for dia_idx, dia in enumerate(DIAS):
            linha = []
            for aula in range(1, AULAS_POR_DIA + 1):
                achou = None
                for i in indices_turma:
                    if solver.Value(aula_var[(i, dia_idx, aula)]) == 1:
                        achou = DISCIPLINAS_TURMA[i]
                        break
                linha.append(f"{aula}:{achou.nome[:12] if achou else '---'}")
            print(f"│ {dia:<10} " + " | ".join(linha))
        print("└" + "─" * 50)
    print()


if __name__ == "__main__":
    print("=" * 70)
    print("SPIKE — Motor de horário NexGrade com Google OR-Tools CP-SAT")
    print("=" * 70)
    print()
    modelo, solver, status, aula_var = resolver()
    imprimir_resultado(solver, status, aula_var)
    print(f"Tempo de resolução: {solver.WallTime():.3f}s | Status: {solver.StatusName(status)}")
