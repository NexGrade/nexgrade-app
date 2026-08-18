"""
Motor de geração de grade horária com CP-SAT.

Reaproveita exatamente a modelagem validada em spike-cp-sat/spike_teste_escala_real.py
(6 restrições + objetivo de minimizar janelas), estendida para devolver a alocação
completa (turma, disciplina, professor, dia, aula) em vez de só o status do solver.
"""

import os
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
    apenas_turma: bool = False,
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
    for turma in sorted(turmas_nomes):
        indices_turma = [i for i, dt in enumerate(disciplinas_turma) if dt.turma == turma]
        for dia in range(len(DIAS)):
            for aula in range(1, aulas_por_dia + 1):
                model.Add(sum(aula_var[(i, dia, aula)] for i in indices_turma) <= 1)

    # RESTRIÇÃO 3 — professor sem 2 turmas ao mesmo tempo
    professores = {dt.professor for dt in disciplinas_turma}
    for prof in sorted(professores):
        indices_prof = [i for i, dt in enumerate(disciplinas_turma) if dt.professor == prof]
        for dia in range(len(DIAS)):
            for aula in range(1, aulas_por_dia + 1):
                model.Add(sum(aula_var[(i, dia, aula)] for i in indices_prof) <= 1)

    # RESTRIÇÃO 4 — teto de aulas por turno (SEED-PR art. 11 §3º)
    teto = TETO_AULAS_TURNO.get(turno, 24)
    for prof in sorted(professores):
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

    # RESTRICAO 5b -- maximo 3 aulas no dia do mesmo par
    # (professor, turma), somando TODAS as disciplinas desse professor
    # nessa turma (nao so uma disciplina isolada, que ja e coberto pela
    # RESTRICAO 5), E dessas no maximo 3, no maximo 2 podem ser
    # SEGUIDAS -- a 3a exige pelo menos 1 aula de pausa antes dela.
    # Ex.: Simone da 3 disciplinas diferentes pra 1MB DES -- padrao
    # valido e X,X,pausa,X (ou variacoes), nunca X,X,X direto.
    pares_prof_turma = {(dt.professor, dt.turma) for dt in disciplinas_turma}
    for prof, turma in sorted(pares_prof_turma):
        indices_par = [
            i for i, dt in enumerate(disciplinas_turma)
            if dt.professor == prof and dt.turma == turma
        ]
        if len(indices_par) < 2:
            continue  # so uma disciplina desse par -- RESTRICAO 5 ja cobre
        for dia in range(len(DIAS)):
            total_dia_par = sum(
                aula_var[(i, dia, aula)]
                for i in indices_par
                for aula in range(1, aulas_por_dia + 1)
            )
            model.Add(total_dia_par <= 3)
            for inicio_janela in range(1, aulas_por_dia - 1):
                soma_janela = sum(
                    aula_var[(i, dia, aula)]
                    for i in indices_par
                    for aula in range(inicio_janela, inicio_janela + 3)
                )
                model.Add(soma_janela <= 2)

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

    # OBJETIVO — minimizar janelas (buracos) por turma/dia E por
    # professor/dia. Antes so minimizava do lado da turma -- uma turma
    # sem buraco nao impede o professor de ter buraco no dia dele (ele
    # pode dar aula 1a aula pra turma A e so voltar na 4a pra turma B,
    # cada turma individualmente compacta, mas o dia do professor com
    # buraco no meio). Reaproveita exatamente o mesmo padrao de
    # variavel "ocupado" + "buraco" ja usado pra turma.
    #
    # [DESCOBERTA] Testado localmente (sem teto de rede) com payload
    # real: o solver prova OPTIMAL em ~24s com peso igual (1:1) entre
    # as duas listas -- ou seja, NAO e falta de tempo. E uma troca
    # matematica real: zerar janela de turma "custa" janela de
    # professor, e com peso igual o solver sempre prefere zerar turma
    # primeiro. Peso configuravel deixa a escola decidir a prioridade.
    penalidades_turma = []
    for turma in sorted(turmas_nomes):
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
                penalidades_turma.append(buraco)

    # [NOVO] Mesmo objetivo, agora do lado do professor -- soma as
    # aulas dele em QUALQUER turma nesse turno (nao so uma), pra saber
    # se ele esta ocupado naquele horario, independente de qual turma.
    penalidades_professor = []
    for prof in ([] if apenas_turma else sorted(professores)):
        indices_prof = [i for i, dt in enumerate(disciplinas_turma) if dt.professor == prof]
        if not indices_prof:
            continue
        turmas_do_prof = {disciplinas_turma[i].turma for i in indices_prof}
        if len(turmas_do_prof) < 2:
            continue  # so cria variavel de janela pra quem da aula em 2+ turmas
        for dia in range(len(DIAS)):
            ocupado_prof = []
            for aula in range(1, aulas_por_dia + 1):
                v = model.NewBoolVar(f"ocupado_prof_{prof}_{dia}_{aula}")
                model.Add(sum(aula_var[(i, dia, aula)] for i in indices_prof) == v)
                ocupado_prof.append(v)
            for a in range(1, aulas_por_dia - 1):
                buraco_prof = model.NewBoolVar(f"buraco_prof_{prof}_{dia}_{a}")
                model.AddBoolAnd([ocupado_prof[a - 1], ocupado_prof[a].Not(), ocupado_prof[a + 1]]).OnlyEnforceIf(buraco_prof)
                model.AddBoolOr([ocupado_prof[a - 1].Not(), ocupado_prof[a], ocupado_prof[a + 1].Not()]).OnlyEnforceIf(buraco_prof.Not())
                penalidades_professor.append(buraco_prof)

    # Peso configuravel (padrao 1 = igual, comportamento anterior).
    # CPSAT_PESO_JANELA_PROFESSOR=3 significa que 1 janela de
    # professor "custa" o mesmo que 3 janelas de turma no objetivo --
    # o solver passa a aceitar mais janela de turma em troca de menos
    # janela de professor.
    peso_professor = int(os.getenv("CPSAT_PESO_JANELA_PROFESSOR", "1"))
    model.Minimize(sum(penalidades_turma) + peso_professor * sum(penalidades_professor))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = tempo_limite_s

    # [FIX-CPU-CONFIG] Numero de workers configuravel via variavel de
    # ambiente, em vez de fixo em 1. O comentario antigo dizia "free tier
    # tem so 0.1 CPU", mas isso trava o paralelismo mesmo depois de migrar
    # pra um tier com mais nucleos de verdade (Standard = 1 vCPU ainda so
    # aproveita 1 worker de qualquer forma, mas Pro = 2 vCPU ja aproveitaria
    # 2). Default 1 mantem o comportamento anterior; ajuste
    # CPSAT_NUM_WORKERS no ambiente do Render se subir de tier de novo.
    solver.parameters.num_search_workers = int(os.getenv("CPSAT_NUM_WORKERS", "1"))
    solver.parameters.interleave_search = True
    solver.parameters.interleave_batch_size = 4
    if apenas_turma:
        solver.parameters.symmetry_level = 0

    # [OTIMIZACAO-VELOCIDADE] Aceita solucao dentro de X% do valor otimo em
    # vez de exigir PROVA de otimalidade -- a maior parte do tempo de solve
    # normalmente e gasta provando que nao da pra melhorar mais, nao achando
    # a solucao boa em si (ver documentacao oficial do OR-Tools). Como o
    # objetivo aqui e "minimizar janelas" (conforto, nao regra dura da
    # SEED-PR), aceitar uma folga pequena e uma troca segura que costuma
    # cortar o tempo de resolucao de forma significativa.
    # Configuravel via env var; 0 = comportamento antigo (exige otimo
    # provado). Default 0.03 = aceita ate 3% de distancia do melhor valor
    # teorico possivel.
    gap_relativo = float(os.getenv("CPSAT_GAP_RELATIVO", "0.03"))
    if gap_relativo > 0:
        solver.parameters.relative_gap_limit = gap_relativo

    # [OTIMIZACAO-PRIMEIRA-SOLUCAO] Quando ligado, o solver para assim
    # que acha a PRIMEIRA grade que satisfaz todas as restricoes -- abre
    # mao de tentar reduzir mais as janelas, em troca de velocidade. Util
    # pra turnos densos (muitos professores "apertados"), onde achar
    # qualquer solucao valida ja e dificil e a etapa de otimizar em cima
    # dela consome a maior parte do tempo. Desligado por padrao (mantem
    # o comportamento de sempre tentar minimizar janelas).
    parar_na_primeira = os.getenv("CPSAT_PARAR_NA_PRIMEIRA", "0") == "1"
    if parar_na_primeira:
        solver.parameters.stop_after_first_solution = True


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
    # [LIMITE-PRATICO] Objetivo de janela de professor e' custoso e
    # instavel em tempo de execucao para turnos grandes (24 turmas) --
    # confirmado em testes extensivos (variacao de 46s a >300s com os
    # mesmos dados). Acima de 16 turmas, usa so objetivo de turma
    # (rapido e confiavel, ~1-4s, sempre OPTIMAL). Turno Parcial
    # (tipicamente <=16 turmas) mantem o objetivo completo (turma +
    # professor).
    apenas_turma_auto = len(turmas_nomes) > 16
    solver, status, aula_var = resolver(
        disciplinas_turma, bloqueios, turno, aulas_por_dia, turmas_nomes,
        tempo_limite_s, apenas_turma=apenas_turma_auto,
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







