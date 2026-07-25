

@app.get("/")
def home():
    return {"status": "online", "servico": "NexGrade CP-SAT Engine", "documentacao": "/docs"}

