"""
[PROGRESSO-MOTOR] (16/10/2026) Andamento de uma geracao, para a tela do NexGrade mostrar ao vivo.

O NexGrade manda "progressoId" no payload de /gerar-grade (e das outras rotas). Enquanto o solver
roda, cada grade melhor que ele encontra e registrada aqui (janelas de professor, janelas de turma,
HA sem espaco), junto com a fase atual. O NexGrade consulta GET /progresso/{id} a cada poucos
segundos. Tudo fica so na memoria do processo e some depois de 1 hora.
"""

import threading
import time

_lock = threading.Lock()
_registros: dict[str, dict] = {}
_ctx = threading.local()
MAX_SOLUCOES = 300


def _limpar_antigos() -> None:
    limite = time.time() - 3600
    for pid in [p for p, r in _registros.items() if r["atualizadoEm"] < limite]:
        del _registros[pid]


def iniciar(progresso_id) -> None:
    """Chamado no inicio da requisicao (mesma thread que vai rodar o solver)."""
    pid = str(progresso_id) if progresso_id else None
    _ctx.id = pid
    if not pid:
        return
    agora = time.time()
    with _lock:
        _limpar_antigos()
        _registros[pid] = {"inicio": agora, "atualizadoEm": agora, "fase": "Preparando o modelo", "solucoes": [], "terminou": False, "parar": False}


def id_atual():
    return getattr(_ctx, "id", None)


def definir_fase(nome: str, pid=None) -> None:
    pid = pid or id_atual()
    if not pid:
        return
    with _lock:
        r = _registros.get(pid)
        if r:
            r["fase"] = nome
            r["atualizadoEm"] = time.time()


def registrar_solucao(pid, janelas_professor: int | None, janelas_turma: int | None = None, ha_faltando: int | None = None) -> None:
    if not pid:
        return
    with _lock:
        r = _registros.get(pid)
        if not r:
            return
        agora = time.time()
        r["solucoes"].append({
            "t": round(agora - r["inicio"], 1),
            "fase": r["fase"],
            **({"janelasProfessor": int(janelas_professor)} if janelas_professor is not None else {}),
            **({"janelasTurma": int(janelas_turma)} if janelas_turma is not None else {}),
            **({"haFaltando": int(ha_faltando)} if ha_faltando is not None else {}),
        })
        if len(r["solucoes"]) > MAX_SOLUCOES:
            r["solucoes"] = r["solucoes"][:1] + r["solucoes"][-(MAX_SOLUCOES - 1):]
        r["atualizadoEm"] = agora


def terminar(pid=None) -> None:
    pid = pid or id_atual()
    if not pid:
        return
    with _lock:
        r = _registros.get(pid)
        if r:
            r["terminou"] = True
            r["atualizadoEm"] = time.time()


def pedir_parada(pid: str) -> bool:
    """[PARAR-MOTOR] pede para o solver parar e devolver a melhor grade que ja tem."""
    with _lock:
        r = _registros.get(str(pid))
        if not r:
            return False
        r["parar"] = True
        r["atualizadoEm"] = time.time()
        return True


def pedido_parar(pid=None) -> bool:
    pid = pid or id_atual()
    if not pid:
        return False
    with _lock:
        r = _registros.get(pid)
        return bool(r and r.get("parar"))


def obter(pid: str) -> dict | None:
    with _lock:
        r = _registros.get(str(pid))
        if not r:
            return None
        return {
            "fase": r["fase"],
            "decorridoS": round(time.time() - r["inicio"], 1),
            "terminou": r["terminou"],
            "parar": r.get("parar", False),
            "solucoes": list(r["solucoes"]),
        }
