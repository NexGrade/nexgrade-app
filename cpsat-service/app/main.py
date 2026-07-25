import os
from fastapi import FastAPI, HTTPException
from google import genai

app = FastAPI()

# Inicializa o cliente Gemini
api_key = os.getenv("GEMINI_API_KEY")
gemini_client = genai.Client(api_key=api_key) if api_key else None

def explicar_inviabilidade_com_gemini(dados_requisicao: dict, log_solver: str = "") -> str:
    if not gemini_client:
        return "Serviço de IA não configurado (GEMINI_API_KEY ausente)."
    
    prompt = f"""
    Você é um assistente especialista em logística pedagógica e alocação de horários escolares.
    O motor de otimização CP-SAT tentou gerar a grade horária mas retornou status INVIÁVEL (INFEASIBLE).

    Analise os dados da requisição e explique em linguagem simples e direta qual é o conflito e como resolver:
    - Turno: {dados_requisicao.get('turno')}
    - Aulas por Dia: {dados_requisicao.get('aulasPorDia')}
    - Turmas: {dados_requisicao.get('turmas')}
    - Disciplinas/Aulas: {dados_requisicao.get('disciplinasTurma')}
    
    Detalhes do Solver: {log_solver}
    """
    
    try:
        response = gemini_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
        )
        return response.text
    except Exception as e:
        return f"Erro ao gerar resposta da IA: {str(e)}"
