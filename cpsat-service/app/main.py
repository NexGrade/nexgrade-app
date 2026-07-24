"""
Microserviço CP-SAT do NexGrade.

Expõe o motor de geração de grade horária (OR-Tools CP-SAT) via HTTP,
para ser chamado pelo backend Express (Node) do monorepo principal.

Endpoint principal: POST /gerar-grade
  - Recebe o mesmo formato JSON exportado por scripts/exportar-dados-cpsat.ts
  - Devolve a grade otimizada por turno (turmas de um turno por vez,
    mesmo padrão que o backend já usa hoje com o motor heurístico)

Rodar localmente:
    pip install -r requirements.txt
    uvicorn app.main:app --reload --port 8000

Deploy: novo Web Service no Render, apontando pro Dockerfile deste diretório.
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import Optional

from app.solver import gerar_grade

app = FastAPI(
    title="NexGrade CP-SAT Service",
    description="Motor de geração de grade horária com OR-Tools CP-SAT",
    version="1.0.0",
)


class DisciplinaTurmaIn(BaseModel):
    turma: str
    codigoSae: str
    nome: str
    aulasSemana: int
    professor: str
    maxAulasDia: int


class BloqueioIn(BaseModel):
    professor: str
    dia: int
    aula: int


class TurmaIn(BaseModel):
    nome: str
    turno: str


class GerarGradeRequest(BaseModel):
    turno: str
    aulasPorDia: int
    turmas: list[TurmaIn]
    disciplinasTurma: list[DisciplinaTurmaIn]
    bloqueiosProfessor: list[BloqueioIn]
    tempoLimiteS: Optional[int] = Field(
        default=120, description="Tempo máximo de resolução em segundos antes de devolver a melhor solução encontrada até então."
    )


@app.get("/api/healthz")
def healthz():
    """Endpoint de health check — mesmo padrão usado pelo backend principal (UptimeRobot)."""
    return {"status": "ok", "service": "nexgrade-cpsat"}


@app.post("/gerar-grade")
def gerar_grade_endpoint(req: GerarGradeRequest):
    if req.turno not in ("matutino", "vespertino", "noturno"):
        raise HTTPException(status_code=400, detail=f"Turno inválido: {req.turno}")

    if not req.disciplinasTurma:
        raise HTTPException(status_code=400, detail="disciplinasTurma vazio — nada para alocar.")

    resultado = gerar_grade(
        disciplinas_turma_raw=[d.model_dump() for d in req.disciplinasTurma],
        bloqueios_raw=[b.model_dump() for b in req.bloqueiosProfessor],
        turno=req.turno,
        aulas_por_dia=req.aulasPorDia,
        turmas_raw=[t.model_dump() for t in req.turmas],
        tempo_limite_s=req.tempoLimiteS or 120,
    )

    return resultado
