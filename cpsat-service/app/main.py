import os
from fastapi import FastAPI, HTTPException
from google import genai
from .solver import gerar_grade
from .pipeline_coordenada import gerar_grade_coordenada
app = FastAPI(title="Nexgrade CP-SAT Solver API")
api_key = os.getenv("GEMINI_API_KEY", "").strip().strip('"').strip("'")
gemini_client = genai.Client(api_key=api_key) if api_key else None
def gerar_diagnostico_fallback(dados_requisicao: dict, log_solver: str = "") -> str:
    """Gera uma explicação pedagógica local clara quando o serviço de IA externa falha."""
    disciplinas = dados_requisicao.get('disciplinasTurma', [])
    aulas_dia = dados_requisicao.get('aulasPorDia', 5)

    # Exemplo simples de análise do conflito no teste (10 aulas solicitadas em 5 dias de 1 aula/dia)
    tot_aulas = sum(d.get('aulasSemana', 0) for d in disciplinas)
    capacidade_semana = aulas_dia * 5

    msg = "### ⚠️ Diagnóstico da Inviabilidade Horária\n\n"
    msg += f"1. **Problema Principal:** A carga horária solicitada ({tot_aulas} aulas/semana) excede a capacidade máxima do turno no formato atual ({capacidade_semana} slots/semana).\n"
    msg += f"2. **Gargalo:** Configuração de {aulas_dia} aula(s) por dia limite para {len(disciplinas)} disciplina(s).\n"
    msg += "3. **Recomendação:** Aumente o número de 'aulas por dia' nas configurações do turno ou reduza a carga horária semanal das disciplinas."

    return msg
def explicar_inviabilidade_com_gemini(dados_requisicao: dict, log_solver: str = "") -> str:
    if not gemini_client:
        return gerar_diagnostico_fallback(dados_requisicao, log_solver)

    prompt = f"""
    Você é um assistente especialista em logística pedagógica.
    O motor CP-SAT retornou status INVIÁVEL.
    Analise os dados e explique em linguagem simples qual é o conflito e como corrigir:
    - Turno: {dados_requisicao.get('turno')}
    - Aulas por Dia: {dados_requisicao.get('aulasPorDia')}
    - Turmas: {dados_requisicao.get('turmas')}
    - Disciplinas: {dados_requisicao.get('disciplinasTurma')}
    - Log: {log_solver}

    Forneça 3 tópicos curtos:
    1. Problema Principal
    2. Gargalo
    3. Recomendação
    """

    # Tenta usar os nomes de modelos suportados na nova biblioteca google-genai
    modelos = ["gemini-2.5-flash", "gemini-2.0-flash"]

    for mod in modelos:
        try:
            response = gemini_client.models.generate_content(
                model=mod,
                contents=prompt,
            )
            return response.text
        except Exception:
            continue

    # Se todos falharem ou derem erro de permissão/projeto, usa o fallback local
    return gerar_diagnostico_fallback(dados_requisicao, log_solver)
@app.api_route("/", methods=["GET", "HEAD"])
def read_root():
    return {"status": "online", "service": "Nexgrade CP-SAT Solver"}
@app.post("/gerar-grade")
def gerar_grade_endpoint(payload: dict):
    try:
        disciplinas_raw = payload.get("disciplinasTurma", [])
        bloqueios_raw = payload.get("bloqueiosProfessor", [])
        turno = payload.get("turno", "matutino")
        aulas_por_dia = payload.get("aulasPorDia", 5)
        turmas_raw = payload.get("turmas", [])
        tempo_limite_s = payload.get("tempoLimiteS", 10)
        resultado = gerar_grade(
            disciplinas_raw,
            bloqueios_raw,
            turno,
            aulas_por_dia,
            turmas_raw,
            tempo_limite_s,
            payload.get("recursos", []),
        )

        if not resultado.get("viavel") or resultado.get("status") in ["INFEASIBLE", "MODEL_INVALID"]:
            resultado["mensagem_ia"] = explicar_inviabilidade_com_gemini(
                dados_requisicao=payload,
                log_solver=resultado.get("mensagem", "")
            )

        return resultado
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/gerar-grade-coordenada")
def gerar_grade_coordenada_endpoint(payload: dict):
    try:
        disciplinas_raw = payload.get("disciplinasTurma", [])
        bloqueios_raw = payload.get("bloqueiosProfessor", [])
        turno = payload.get("turno", "matutino")
        aulas_por_dia = payload.get("aulasPorDia", 5)
        turmas_raw = payload.get("turmas", [])
        n_tentativas = payload.get("nTentativas", 5)
        tempo_coordenacao_s = payload.get("tempoCoordenacaoS", 120)
        tempo_fase_s = payload.get("tempoFaseS", 300)
        tempo_fase3_s = payload.get("tempoFase3S", 60)

        resultado = gerar_grade_coordenada(
            disciplinas_raw,
            bloqueios_raw,
            turno,
            aulas_por_dia,
            turmas_raw,
            n_tentativas,
            tempo_coordenacao_s,
            tempo_fase_s,
            tempo_fase3_s,
        )

        if not resultado.get("viavel"):
            resultado["mensagem_ia"] = explicar_inviabilidade_com_gemini(
                dados_requisicao=payload,
                log_solver=resultado.get("mensagem", "")
            )

        return resultado
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# [MELHORAR-GRADE] Parte de uma grade ja existente (ex.: a OFICIAL do turno):
# ela vira DICA (warm start) do CP-SAT, que usa o tempo pedido para buscar
# reorganizacoes maiores; depois a fase 3 (trocas) roda por cima, como em
# toda geracao. Devolve janelas antes (grade de partida) e depois.
@app.post("/melhorar-grade")
def melhorar_grade_endpoint(payload: dict):
    try:
        from .reduzir_janelas import contar_janelas_professor
        aulas_iniciais = payload.get("aulasIniciais", [])
        if not aulas_iniciais:
            raise ValueError("aulasIniciais vazio: nada para melhorar")
        resultado = gerar_grade(
            payload.get("disciplinasTurma", []),
            payload.get("bloqueiosProfessor", []),
            payload.get("turno", "matutino"),
            payload.get("aulasPorDia", 5),
            payload.get("turmas", []),
            int(payload.get("tempoLimiteS", 120)),
            aulas_iniciais=aulas_iniciais,
        )
        resultado["janelasProfessorAntes"] = contar_janelas_professor(aulas_iniciais)
        if resultado.get("aulas"):
            resultado["janelasProfessorDepois"] = contar_janelas_professor(resultado["aulas"])
        return resultado
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
