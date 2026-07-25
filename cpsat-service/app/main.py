import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from google import genai
from .solver import resolver_grade

app = FastAPI(title="Nexgrade CP-SAT Solver API")

# Inicializa o cliente Gemini com a chave configurada no Render
api_key = os.getenv("GEMINI_API_KEY")
gemini_client = genai.Client(api_key=api_key) if api_key else None

def explicar_inviabilidade_com_gemini(dados_requisicao: dict, log_solver: str = "") -> str:
    """Gera um diagnóstico amigável para o coordenador quando a grade for INFEASIBLE."""
    if not gemini_client:
        return "Serviço de IA não configurado (GEMINI_API_KEY ausente nas variáveis de ambiente)."
    
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
    
    Por favor, retorne uma explicação curta com:
    1. Qual é o problema principal.
    2. Onde está o gargalo matemático/logístico.
    3. Qual a recomendação direta de ajuste.
    """
    
    try:
        response = gemini_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
        )
        return response.text
    except Exception as e:
        return f"Erro ao consultar IA Gemini: {str(e)}"

@app.get("/")
def read_root():
    return {"status": "online", "service": "Nexgrade CP-SAT Solver"}

@app.post("/gerar-grade")
def gerar_grade_endpoint(payload: dict):
    try:
        resultado = resolver_grade(payload)
        
        # Se for inviável, chama a IA Gemini para diagnosticar o erro
        if resultado.get("status") in ["INFEASIBLE", "MODEL_INVALID"]:
            resultado["mensagem_ia"] = explicar_inviabilidade_com_gemini(
                dados_requisicao=payload,
                log_solver=resultado.get("mensagem", "")
            )
            
        return resultado
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
