# Spike técnico — Motor de horário com Constraint Programming (CP-SAT)

**Status: prova de conceito isolada. NÃO está integrado ao NexGrade em produção.**

## O que este spike prova

Que o **Google OR-Tools (solver CP-SAT)** resolve o problema real de geração de
horário do NexGrade — incluindo as regras SEED-PR que já estão implementadas
no detector de conflitos (`artifacts/api-server/src/routes/conflitos.ts`) —
e que ele faz as duas coisas que a heurística gulosa atual não faz:

1. **Encontra uma combinação que satisfaz todas as restrições ao mesmo tempo**
   (não turma por turma, isoladamente)
2. **Prova matematicamente quando é impossível**, em vez de gerar uma grade
   que desrespeita alguma regra sem avisar

## Resultados obtidos (rodados de verdade, não simulados)

| Teste | Resultado |
|---|---|
| `spike_horario_cp_sat.py` — 3 turmas reais (6 Ano A, 1 Serie A, 1 Serie Tec ADM), matriz curricular real, professores reais, teto de turno e limite de geminada respeitados | ✅ Solução ótima em **0.013 segundos** |
| `spike_teste_inviabilidade.py` — professor forçado a 25 aulas/semana num turno com teto legal de 19 | ✅ Solver identifica corretamente como `INFEASIBLE` e explica por quê |

## Como rodar

```bash
pip install ortools
python3 spike_horario_cp_sat.py
python3 spike_teste_inviabilidade.py
```

## O que ESTE spike não cobre ainda (de propósito — é escopo de spike, não de produto)

- Sala obrigatória (laboratório/quadra) — modelável, mas não incluído aqui para manter o exemplo legível
- Itinerários compartilhados entre turmas (grupo simultâneo) — mesma observação
- Múltiplas salas físicas concorrendo pelo mesmo recurso
- Preferências pedagógicas mais sofisticadas (ex. evitar professor com 4 dias longos seguidos)

Nenhum desses é um problema técnico — CP-SAT modela tudo isso de forma
declarativa, é só mais restrição adicionada ao mesmo `model.Add(...)`. Ficaram
de fora aqui só para o spike ficar rápido de ler e rodar.

## Caminho de integração (se decidirem seguir em frente)

O OR-Tools é nativo em Python/C++/Java/.NET — não roda direto dentro do
backend Node/Express atual. O caminho mais direto e de menor risco:

1. **Microserviço Python separado**, só com esse solver, exposto como uma
   rota HTTP simples (ex. `POST /solve` recebendo o JSON de turmas/disciplinas/
   professores/restrições e devolvendo a grade ou o motivo da inviabilidade)
2. O backend Express atual chama esse microserviço via `fetch`, do mesmo jeito
   que já chama a API da OpenAI hoje — é o mesmo padrão de integração, só troca
   o destino
3. **Rodar em paralelo com a heurística atual no início** (não substituir de
   uma vez): gerar a grade pelos dois motores, comparar, e só trocar de vez
   quando o CP-SAT tiver se provado consistentemente melhor ou igual em
   escolas piloto reais

## Custo de infraestrutura

Um serviço Python simples desse tipo roda tranquilo no free tier ou no plano
de entrada do Render (mesma plataforma que já hospeda o backend) — não é um
custo significativo a mais.

## Próximo passo, se topar avançar

Modelar as restrições que ficaram de fora (sala obrigatória e itinerários
compartilhados) e testar com uma massa de dados maior (uma escola inteira,
não só 3 turmas) para confirmar que o tempo de resolução continua rápido em
escala real.
