import os
from fastapi import FastAPI, HTTPException
from google import genai
from .solver import gerar_grade

app = FastAPI(title="Nexgrade CP-SAT Solver API")

api_key = os.getenv("GEMINI_API_KEY")
gemini_client = genai.Client(api_key=api_key) if api_key else None

def explicar_inviabilidade_com_gemini(dados_requisicao: dict, log_solver: str = "") -> str:
    if not gemini_client:
        return "Serviço de IA não configurado (GEMINI_API_KEY ausente)."
    
    prompt = f"""
    Você é um assistente especialista em logística pedagógica e alocação de horários escolares.
    O motor de otimização CP-SAT tentou gerar a grade horária mas retornou status INVIÁVEL (INFEASIBLE).

    Analise os dados da requisição e explique em linguagem simples, direta e empática qual é o conflito e como o coordenador pedagógico pode corrigir:
    
    Dados da Requisição:
    - Turno: {dados_requisicao.get('turno')}
    - Aulas por Dia: {dados_requisicao.get('aulasPorDia')}
    - Turmas: {dados_requisicao.get('turmas')}
    - Disciplinas e Aulas Semanais: {dados_requisicao.get('disciplinasTurma')}
    
    Detalhes/Log do Solver: {log_solver}
    
    Por favor, retorne uma explicação curta em tópicos:
    1. Problema principal
    2. Gargalo logístico
    3. Recomendação direta de ajuste
    """
    
    try:
        response = gemini_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
        )
        return response.text
    except Exception as e:
        return f"Erro ao consultar Gemini: {str(e)}"

@app.get("/")
def read_root():
    return {"status": "online", "service": "Nexgrade CP-SAT Solver"}

@app.post("/gerar-grade")
def gerar_grade_endpoint(payload: dict):
    try:
        # Extrai os parâmetros necessários para a função do solver
        disciplinas_raw = payload.get("disciplinasTurma", [])
        bloqueios_raw = payload.get("bloqueiosProfessor", [])
        turno = payload.get("turno", "matutino")
        aulas_por_dia = payload.get("aulasPorDia", 5)
        turmas_raw = payload.get("turmas", [])
        tempo_limite_s = payload.get("tempoLimiteS", 10)

        # Chama o solver passando os argumentos posicionais exigidos
        resultado = gerar_grade(
            disciplinas_raw,
            bloqueios_raw,
            turno,
            aulas_por_dia,
            turmas_raw,
            tempo_limite_s
        )
        
        # Se não for viável, enriquece a resposta com o diagnóstico da IA Gemini
        if not resultado.get("viavel") or resultado.get("status") in ["INFEASIBLE", "MODEL_INVALID"]:
            diagnostico = explicar_inviabilidade_com_gemini(
                dados_requisicao=payload,
                log_solver=resultado.get("mensagem", "")
            )
            resultado["mensagem_ia"] = diagnostico
            
        return resultado
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
