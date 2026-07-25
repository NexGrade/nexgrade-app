import os
import logging
from fastapi import FastAPI, HTTPException
from google import genai
from .solver import resolver_grade

app = FastAPI(title="Nexgrade CP-SAT Solver API")

# Inicializa o cliente Gemini
api_key = os.getenv("GEMINI_API_KEY")
gemini_client = genai.Client(api_key=api_key) if api_key else None

def explicar_inviabilidade_com_gemini(dados_requisicao: dict, log_solver: str = "") -> str:
    if not gemini_client:
        return "Serviço de IA não configurado (GEMINI_API_KEY ausente nas variáveis de ambiente)."
    
    prompt = f"""
    Você é um assistente especialista em logística pedagógica.
    O motor de otimização CP-SAT retornou status INVIÁVEL (INFEASIBLE).

    Analise os dados e explique em linguagem simples qual é o conflito e como o coordenador pode corrigir:
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
        resultado = resolver_grade(payload)
        
        # Garante que qualquer resposta não viável receba a análise da IA
        if not resultado.get("viavel") or resultado.get("status") in ["INFEASIBLE", "MODEL_INVALID"]:
            diagnostico = explicar_inviabilidade_com_gemini(
                dados_requisicao=payload,
                log_solver=resultado.get("mensagem", "")
            )
            resultado["mensagem_ia"] = diagnostico
            
        return resultado
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
