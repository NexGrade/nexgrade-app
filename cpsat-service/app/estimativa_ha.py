"""
[JANELAS-COM-HA-ENCAIXADA] (04/11/2026) Numero de janelas que a tela do "Melhorar" mostra ao vivo.

O Melhorar otimiza com a HA presa no lugar de hoje e, depois, a simulacao e a promocao encaixam a HA movel nas
janelas (modelo validado pela dona: rodar o horario e encaixar a HA onde ficam as janelas). A tela, porem, mostrava
as janelas contadas com a HA presa (ex.: 20 ate o fim) e a simulacao terminava com 0 ou 1.

Aqui so se ESTIMA, para cada grade encontrada, quantas janelas sobram depois de encaixar a HA movel: por professor,
os buracos entre a primeira e a ultima ocupacao do dia (aula ou o que nao sai do lugar: HA fixa, atividade, aula na
integral ou em outra turma) e a HA movel dele (cota) tapa os buracos livres, ate 3 por dia. Nao muda a otimizacao.
"""

import os
from collections import defaultdict


def criar_estimador(dados: dict | None, bloqueios_raw: list | None):
    """dados = {"cotas": {professor: HA movel}, "ocupados": [{professor, dia, aula}]}; None se nao veio."""
    if not dados:
        return None
    cotas = {str(k): int(v or 0) for k, v in (dados.get("cotas") or {}).items()}
    ocupados = defaultdict(set)
    for o in dados.get("ocupados") or []:
        ocupados[(o["professor"], int(o["dia"]))].add(int(o["aula"]))
    bloqueios = {(b["professor"], int(b["dia"]), int(b["aula"])) for b in (bloqueios_raw or [])}
    teto_dia = int(os.getenv("RECALCULO_HA_MAX_POR_DIA", "3"))

    def estimar(posicoes) -> int:
        """posicoes: iteravel de (professor, dia, aula) das aulas da grade."""
        por_prof_dia = defaultdict(set)
        for (p, d, a) in posicoes:
            por_prof_dia[(p, d)].add(a)
        buracos = defaultdict(int)
        livres = defaultdict(int)
        for (p, d), aulas in por_prof_dia.items():
            slots = aulas | ocupados.get((p, d), set())
            if len(slots) < 2:
                continue
            vazios = [s for s in range(min(slots), max(slots) + 1) if s not in slots]
            buracos[p] += len(vazios)
            livres[p] += min(teto_dia, sum(1 for s in vazios if (p, d, s) not in bloqueios))
        return sum(max(0, n - min(cotas.get(p, 0), livres[p])) for p, n in buracos.items())

    return estimar
