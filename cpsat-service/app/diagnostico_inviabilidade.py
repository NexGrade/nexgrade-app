"""
diagnostico_inviabilidade.py -- [DIAGNOSTICO-INVIAVEL] (22/10/2026)

Quando o CP-SAT responde INFEASIBLE, ele so diz "nao existe grade". Este modulo faz contas simples
(sem solver) sobre os MESMOS dados do modelo e aponta contradicoes obvias, para a mensagem dizer
QUEM trava (professor, turma, disciplina) em vez de so "disponibilidade + teto".

So acha contradicoes "de contagem" (nao cabe, mesmo no melhor caso). Se nada aparecer, a inviabilidade
vem da combinacao de varias restricoes e a mensagem diz isso. Nao importa ortools: roda sozinho.
"""

from collections import defaultdict

NOMES_DIA = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"]


def _fixas_da_linha(fixar, dt):
    return (fixar or {}).get((dt.turma, dt.codigo_sae, dt.professor), [])


def diagnosticar_inviabilidade(disciplinas_turma, bloqueios, aulas_por_dia, teto, fixar=None, dias=5, teto_por_professor=None):
    """Devolve uma lista de frases (mais graves primeiro). Lista vazia = nenhuma contradicao de contagem."""
    achados = []  # (prioridade, texto)

    bloqueados_do_prof = defaultdict(set)  # prof -> {(dia, aula)}
    for (prof, dia, aula) in bloqueios:
        if 1 <= aula <= aulas_por_dia:
            bloqueados_do_prof[prof].add((dia, aula))

    # 1) aulas fixas que se chocam entre si ou caem em horario bloqueado
    ocup_prof, ocup_turma = {}, {}
    for dt in disciplinas_turma:
        for (dia, aula) in _fixas_da_linha(fixar, dt):
            nome = f"{dt.professor} · {dt.turma} · {dt.nome}"
            quando = f"{NOMES_DIA[dia] if 0 <= dia < len(NOMES_DIA) else dia}, {aula}ª aula"
            if (dia, aula) in bloqueados_do_prof[dt.professor]:
                achados.append((1, f"Aula fixa de {nome} ({quando}) cai num horário bloqueado do professor."))
            if (dt.professor, dia, aula) in ocup_prof and ocup_prof[(dt.professor, dia, aula)] != dt.grupo_dupla:
                achados.append((1, f"{dt.professor} tem duas aulas fixas no mesmo horário ({quando})."))
            ocup_prof.setdefault((dt.professor, dia, aula), dt.grupo_dupla)
            if not dt.assincrona:
                anterior = ocup_turma.get((dt.turma, dia, aula), "livre")
                if anterior != "livre" and (anterior is None or anterior != dt.grupo_dupla):
                    achados.append((1, f"A turma {dt.turma} tem duas aulas fixas no mesmo horário ({quando})."))
                ocup_turma.setdefault((dt.turma, dia, aula), dt.grupo_dupla)

    # 2) professor: aulas no turno acima do teto, ou mais aulas do que horarios livres
    aulas_do_prof = defaultdict(int)
    for dt in disciplinas_turma:
        aulas_do_prof[dt.professor] += dt.aulas_semana
    for prof, total in sorted(aulas_do_prof.items()):
        teto_prof = max(teto, (teto_por_professor or {}).get(prof, 0))  # [TETO-AUTORIZADO]
        if total > teto_prof:
            achados.append((2, f"{prof}: {total} aulas no turno, acima do teto de {teto_prof}."))
        livres = dias * aulas_por_dia - len(bloqueados_do_prof[prof])
        if total > livres:
            achados.append((3, f"{prof}: {total} aulas no turno, mas só tem {livres} horário(s) livre(s) "
                               f"({len(bloqueados_do_prof[prof])} bloqueados)."))
            continue
        # [DIAGNOSTICO-ULTIMA-AULA] (03/11/2026) turma que termina antes (Fundamental vai ate a 5a no matutino):
        # as aulas dessas turmas tem que caber nos horarios livres ATE a ultima aula delas. Antes a conta usava a
        # ultima aula do turno, e o professor so do Fundamental com 16 aulas em 15 horarios passava sem causa.
        linhas_prof = [dt for dt in disciplinas_turma if dt.professor == prof]
        for limite in sorted({min(aulas_por_dia, dt.ultima_aula_turma) for dt in linhas_prof if dt.ultima_aula_turma}):
            if limite >= aulas_por_dia:
                continue
            aulas_ate = sum(dt.aulas_semana for dt in linhas_prof if dt.ultima_aula_turma and dt.ultima_aula_turma <= limite)
            livres_ate = sum(1 for dia in range(dias) for a in range(1, limite + 1) if (dia, a) not in bloqueados_do_prof[prof])
            if aulas_ate > livres_ate:
                achados.append((3, f"{prof}: {aulas_ate} aulas em turmas que vão até a {limite}ª aula, mas só tem "
                                   f"{livres_ate} horário(s) livre(s) até a {limite}ª aula "
                                   f"({dias * limite - livres_ate} bloqueados)."))
                break

    # 3) linha (professor + turma + disciplina): nao cabe na semana com o limite por dia e os bloqueios
    for dt in disciplinas_turma:
        limite_aula = min(aulas_por_dia, dt.ultima_aula_turma or aulas_por_dia)
        fixas = _fixas_da_linha(fixar, dt)
        cabem = 0
        for dia in range(dias):
            livres_dia = sum(1 for a in range(1, limite_aula + 1) if (dia, a) not in bloqueados_do_prof[dt.professor])
            fix_dia = sum(1 for (df, _a) in fixas if df == dia)
            cabem += min(max(dt.max_aulas_dia, fix_dia), livres_dia)
        if cabem < dt.aulas_semana:
            achados.append((4, f"{dt.professor} · {dt.turma} · {dt.nome}: precisa de {dt.aulas_semana} aula(s) por semana, "
                               f"mas só cabem {cabem} (limite de {dt.max_aulas_dia} por dia e horários livres do professor)."))

    # 4) turma: mais aulas do que horarios na semana
    por_turma = defaultdict(list)
    for dt in disciplinas_turma:
        if not dt.assincrona:
            por_turma[dt.turma].append(dt)
    for turma, linhas in sorted(por_turma.items()):
        vistos, total = set(), 0
        for dt in linhas:
            if dt.grupo_dupla is not None:
                if dt.grupo_dupla in vistos:
                    continue
                vistos.add(dt.grupo_dupla)
            total += dt.aulas_semana
        limite_aula = min(aulas_por_dia, min((dt.ultima_aula_turma or aulas_por_dia) for dt in linhas))
        if total > dias * limite_aula:
            achados.append((5, f"Turma {turma}: {total} aulas por semana, mas só tem {dias * limite_aula} horários "
                               f"({limite_aula} por dia)."))

    # 5) [TURMA-POR-DIA] (05/11/2026) turma: dia a dia, quantas aulas os professores dela conseguem cobrir, com os
    # bloqueios de cada um e o limite por dia de cada disciplina. Pega a turma cheia (ex.: 30 aulas em 30 horarios)
    # que tem um dia em que poucos professores podem vir -- caso do C. E. Iedo em 05/11, em que o motor so dizia
    # "combinacao de varias regras" ou parava no tempo limite. Conta sempre o MELHOR caso (limite superior), entao so
    # acusa o que e impossivel de verdade: demanda igual a do item 4 (sem assincronas, dupla uma vez so).
    linhas_por_turma = defaultdict(list)
    for dt in disciplinas_turma:
        linhas_por_turma[dt.turma].append(dt)
    for turma, linhas in sorted(linhas_por_turma.items()):
        vistos, demanda = set(), 0
        for dt in linhas:
            if dt.assincrona:
                continue
            if dt.grupo_dupla is not None:
                if dt.grupo_dupla in vistos:
                    continue
                vistos.add(dt.grupo_dupla)
            demanda += dt.aulas_semana
        limite_aula = min(aulas_por_dia, min((dt.ultima_aula_turma or aulas_por_dia) for dt in linhas))
        if demanda <= 0 or demanda > dias * limite_aula:  # acima dos horarios da semana o item 4 ja acusa
            continue
        # dupla = uma unidade: so da aula onde TODOS do grupo estao livres
        unidades = defaultdict(list)
        for i, dt in enumerate(linhas):
            unidades[dt.grupo_dupla if dt.grupo_dupla is not None else f"__linha_{i}"].append(dt)
        cobertura_semana, dias_curtos, sem_ninguem = 0, [], []
        for dia in range(dias):
            cobertos, soma = set(), 0
            for membros in unidades.values():
                livres_unidade = None
                cap_unidade = None
                for dt in membros:
                    fixas_dia = {a for (df, a) in _fixas_da_linha(fixar, dt) if df == dia}
                    livres = {a for a in range(1, limite_aula + 1)
                              if (dia, a) not in bloqueados_do_prof[dt.professor] or a in fixas_dia}
                    cap = min(max(dt.max_aulas_dia, len(fixas_dia)), len(livres))
                    livres_unidade = livres if livres_unidade is None else (livres_unidade & livres)
                    cap_unidade = cap if cap_unidade is None else min(cap_unidade, cap)
                cap_unidade = min(cap_unidade or 0, len(livres_unidade or ()))
                cobertos |= (livres_unidade or set())
                soma += cap_unidade
            cobre_dia = min(limite_aula, len(cobertos), soma)
            cobertura_semana += cobre_dia
            if cobre_dia < limite_aula:
                dias_curtos.append(f"{NOMES_DIA[dia] if dia < len(NOMES_DIA) else dia} {cobre_dia} de {limite_aula}")
            sem_ninguem += [f"{NOMES_DIA[dia] if dia < len(NOMES_DIA) else dia} {a}ª aula"
                            for a in range(1, limite_aula + 1) if a not in cobertos]
        if cobertura_semana < demanda:
            detalhe = f" Por dia: {', '.join(dias_curtos)}." if dias_curtos else ""
            if sem_ninguem:
                detalhe += f" Sem nenhum professor da turma livre: {', '.join(sem_ninguem[:6])}" + (" e outros" if len(sem_ninguem) > 6 else "") + "."
            achados.append((5, f"Turma {turma}: precisa de {demanda} aulas por semana, mas os professores dela só conseguem "
                               f"cobrir {cobertura_semana} (bloqueios de cada um + limite por dia de cada disciplina).{detalhe}"))

    achados.sort(key=lambda x: x[0])
    vistos_txt, saida = set(), []
    for _p, texto in achados:
        if texto not in vistos_txt:
            vistos_txt.add(texto)
            saida.append(texto)
    return saida


def montar_mensagem(mensagem_base, causas, mostrar=5):
    """Junta a mensagem generica com as causas encontradas (as `mostrar` primeiras)."""
    if not causas:
        return (mensagem_base + " Nenhuma contradição simples foi encontrada: a inviabilidade vem da combinação de "
                "várias regras (por exemplo, bloqueios + aulas seguidas + limites por dia).")
    linhas = [f"- {c}" for c in causas[:mostrar]]
    if len(causas) > mostrar:
        linhas.append(f"- ... e mais {len(causas) - mostrar} caso(s)")
    return mensagem_base + "\nCausas encontradas:\n" + "\n".join(linhas)
