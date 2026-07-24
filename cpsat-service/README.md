# NexGrade CP-SAT Service

Microserviço Python (FastAPI + OR-Tools) que expõe o motor de geração de grade
horária via HTTP, para ser chamado pelo backend Express do monorepo principal.

Reaproveita a mesma modelagem validada em `spike-cp-sat/spike_teste_escala_real.py`
(testada com dados reais dos 3 turnos — todos OPTIMAL em menos de 1s), estendida
para devolver a alocação completa em vez de só o status do solver.

## Estrutura

```
cpsat-service/
  app/
    main.py       # FastAPI app, endpoint POST /gerar-grade
    solver.py      # Lógica do CP-SAT (restrições + objetivo)
  requirements.txt
  Dockerfile
```

## Rodar localmente (opcional, pra testar antes do deploy)

```powershell
cd cpsat-service
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Testar (comando):

```powershell
curl http://localhost:8000/api/healthz
```

## Endpoint principal

`POST /gerar-grade`

Recebe o **mesmo formato JSON** que `scripts/exportar-dados-cpsat.ts` já gera
(um turno por vez, mesmo padrão que o backend usa hoje com o motor heurístico):

```json
{
  "turno": "matutino",
  "aulasPorDia": 6,
  "turmas": [{"nome": "1A", "turno": "matutino"}],
  "disciplinasTurma": [
    {"turma": "1A", "codigoSae": "MAT", "nome": "Matemática", "aulasSemana": 4, "professor": "Prof1", "maxAulasDia": 2}
  ],
  "bloqueiosProfessor": [],
  "tempoLimiteS": 120
}
```

Resposta:

```json
{
  "status": "OPTIMAL",
  "otimo": true,
  "viavel": true,
  "tempoResolucaoS": 0.68,
  "tempoParedeS": 0.52,
  "aulas": [
    {"turma": "1A", "codigoSae": "MAT", "disciplina": "Matemática", "professor": "Prof1", "dia": 0, "diaNome": "Segunda", "aula": 3}
  ]
}
```

Se `status` for `INFEASIBLE`, o campo `aulas` vem vazio e `mensagem` explica que
não existe grade possível com esses dados (confirma matematicamente conflito de
carga vs. disponibilidade — mesmo comportamento que o spike já mostrava no terminal).

## Deploy no Render (novo Web Service)

1. Suba a pasta `cpsat-service/` como um novo diretório dentro do repositório
   `nexgrade-app` (ex: raiz do monorepo, ao lado de `spike-cp-sat/`)
2. No painel do Render: **New → Web Service**
3. Conecte o repositório `NexGrade/nexgrade-app`
4. Em **Root Directory**, aponte para `cpsat-service`
5. Runtime: **Docker** (ele vai detectar o `Dockerfile` automaticamente)
6. Nome sugerido: `nexgrade-cpsat` (fica algo como `nexgrade-cpsat.onrender.com`)
7. Plano: como o backend principal, evite o free tier em produção (hibernação
   causa 502 — mesmo problema que você já teve no backend Node)
8. Deploy

Depois do deploy, teste (comando):

```powershell
curl https://nexgrade-cpsat.onrender.com/api/healthz
```

Se quiser, dá pra adicionar esse endpoint no UptimeRobot também, do mesmo jeito
que já monitora `/api/healthz` do backend principal.

## Próximo passo — integração com o backend Express

O backend precisa de uma rota nova que:
1. Monta o mesmo payload que `exportar-dados-cpsat.ts` gera (a partir do banco,
   não de arquivo — a lógica de consulta já existe nesse script, é só adaptar
   pra rodar dentro do backend em vez de escrever um `.json`)
2. Faz um `fetch`/`axios.post` para `https://nexgrade-cpsat.onrender.com/gerar-grade`
3. Recebe o array `aulas` e grava na tabela de horários do jeito que a UI espera

Recomendo manter o motor heurístico atual como **fallback** nas primeiras semanas
do pilot: se a chamada ao microserviço falhar (timeout, erro de rede, serviço
hibernado no free tier), o backend cai pro heurístico em vez de travar a geração
de grade pro usuário. Depois de validar o CP-SAT em produção com a escola real,
dá pra remover o fallback.

Posso montar essa rota de integração no backend quando você quiser — é só avisar.
