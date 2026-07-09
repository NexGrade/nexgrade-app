# NexGrade — Relatório de Conformidade SEED-PR

**Data:** 08/07/2026
**Escopo:** Verificação das normas da Secretaria de Estado da Educação do Paraná (SEED-PR) aplicáveis ao gerador de horário do NexGrade, e registro do que foi implementado nesta rodada.

---

## 1. Contexto

Ao longo desta rodada de trabalho, informações sobre regras de distribuição de aulas, hora-atividade e montagem de matriz curricular chegaram por dois canais diferentes:

1. **Dados reais da escola** (planilhas de Código SAE, matriz curricular por série, e vínculo turma/professor) — fornecidos diretamente e usados no seed de dados de teste.
2. **"Regras oficiais"** repassadas por conversas com outra ferramenta de IA — que precisaram ser **verificadas uma a uma** contra fonte primária antes de qualquer coisa virar código, porque parte do que chegou por esse canal estava desatualizada ou não tinha fonte válida.

Este relatório separa claramente o que foi **confirmado por documento oficial** do que **ainda precisa de confirmação**, e lista o que foi de fato implementado no sistema.

---

## 2. Informações relevantes — o que foi confirmado e o que não foi

### 2.1 Dados da escola (alta confiabilidade — fonte direta)

| Dado | Status |
|---|---|
| Códigos SAE de 79 disciplinas (Ensino Médio + 9 cursos técnicos) | ✅ Fornecido diretamente pela escola, usado no seed |
| Matriz curricular real (Fundamental II 6º Ano, Médio Regular 1ª Série, Técnico ADM 1ª Série) | ✅ Fornecido diretamente pela escola |
| Vínculo turma/turno/disciplina/professor real (6 Ano A, 1 Serie A, 1 Serie Tec ADM) | ✅ Fornecido diretamente pela escola |

### 2.2 Normas SEED-PR — confirmadas por fonte primária (PDF oficial lido diretamente)

| Norma | Confirmação |
|---|---|
| **Proporção hora-aula/hora-atividade — padrão 20h**: 15 aulas de regência + 9 horas-atividade (5 na instituição + 4 em local de livre escolha) = 7h30 de HA | ✅ Resolução SEED n.º 7.200/2025, Art. 11, §1º, I — lida diretamente no PDF oficial |
| **Proporção — padrão 40h**: 30 aulas + 18 horas-atividade (10 + 8) = 15h de HA | ✅ Mesma fonte, Art. 11, §1º, II |
| **Hora-atividade no mesmo turno**: professor com até 19 aulas num turno deve cumprir a HA nesse mesmo turno/local | ✅ Mesma fonte, Art. 11, §4º — confirmado ao pé da letra |
| **Teto de aulas por turno**: até 19 aulas no turno da noite, até 24 nos demais turnos (por semana, não por dia) | ✅ Mesma fonte, Art. 11, §3º |

### 2.3 Normas SEED-PR — descartadas ou corrigidas após verificação

| Alegação recebida | Veredito |
|---|---|
| "13 aulas + 7h de HA" (20h) / "26 aulas + 14h" (40h) | ❌ **Não é o que está em vigor.** É a posição do sindicato dos professores (APP-Sindicato), respaldada por decisão do STJ, de que a SEED-PR calcula errado há anos. O Estado recorreu e **continua aplicando 15+9/30+18 na prática** (confirmado no PDF de 2025/2026). Os dois números são "reais" em sentidos diferentes — um é o que a lei deveria determinar, o outro é o que está de fato em vigor. |
| "Teto de 5 aulas diárias por turno" | ❌ **Não existe essa regra.** A fonte citada incluía um post do Instagram, que não é norma de governo. O teto real é semanal (19/24), não diário. |
| "Itinerários Formativos com aulas simultâneas obrigatórias entre turmas" | ⚠️ **Não confirmado.** A Instrução Normativa nº 010/2025 citada como fonte é sobre atendimento a jovens em medida socioeducativa — assunto completamente diferente. A norma real que rege a atribuição de aula do Itinerário Formativo de Aprofundamento (IFA) é a **Instrução Normativa nº 001/2026 – DEDUC/SEED**, que não foi lida ainda. A prática de turmas cursando itinerário junto é comum no Novo Ensino Médio, mas o artigo exato que obriga isso não foi verificado. |
| "Janela de deslocamento entre escolas travada no sistema" | ⚠️ Existe uma regra relacionada (Art. 44, sobre professor com carga dividida entre escolas do mesmo município), mas trata de ajuste de aulas, não de "bloquear horário para deslocamento" como funcionalidade de sistema — isso é mais boa prática operacional do que norma explícita encontrada. |

### 2.4 Lição sobre as fontes

Um "comunicado interno" chegou a ser redigido a partir dessas alegações **antes** da verificação, afirmando que o NexGrade "já foi programado" respeitando essas regras — o que não era verdade em nenhum dos dois sentidos (nem os números estavam certos, nem o sistema tinha essas validações implementadas). Esse documento foi **barrado antes de ir para a Direção**. A prática que se estabeleceu nesta rodada — e que vale manter — é: toda alegação de norma vinda de ferramenta de IA passa por busca e leitura do PDF oficial antes de virar configuração, código ou comunicado oficial da escola.

---

## 3. O que foi implementado nesta rodada

### 3.1 Schema do banco (`lib/db/src/schema/`)

| Tabela | Campo novo | Para quê |
|---|---|---|
| `disciplinas` | `tipoSalaExigido` | Trava disciplina a um tipo de sala (ex. laboratório, quadra) |
| `turma_disciplinas` | `maxAulasConsecutivasDia` | Limite de aulas geminadas da mesma disciplina/turma por dia (o `Max_Aulas_Dia` que faltava desde a planilha de vínculo turma/professor) |
| `turma_disciplinas` | `grupoCompartilhadoId` | Agrupa disciplina entre turmas diferentes para horário simultâneo (itinerários) — recurso opcional, não trava obrigatória |
| `disponibilidade_professores` | `horaAtividadeObrigatoria` | Distingue bloqueio de HA obrigatória de outras indisponibilidades |
| `disponibilidade_professores` | `turno` | Necessário para validar concentração de HA no mesmo turno das aulas (Art. 11, §4º) |

Typecheck do pacote `lib/db` limpo após as mudanças.

### 3.2 Detector de conflitos (`artifacts/api-server/src/routes/conflitos.ts`)

5 novas regras adicionadas, seguindo exatamente o padrão das 6 regras que já existiam:

1. **Sala incompatível** — disciplina exige tipo de sala e a aula foi alocada em outra
2. **Sala restrita duplicada** — duas turmas usando o mesmo laboratório/quadra no mesmo horário
3. **Aulas geminadas excedidas** — mais aulas seguidas da mesma disciplina/turma no dia do que o limite configurado
4. **Teto de aulas por turno excedido** — professor passa de 19 (noturno) ou 24 (demais turnos) aulas semanais naquele turno
5. **Hora-atividade insuficiente / fora do turno** — professor sem HA suficiente marcada, ou com HA fora do turno das aulas quando tem até 19 aulas nesse turno

Cada uma tem sugestão de correção cadastrada em `gerarSugestoes()`. Typecheck do `api-server` inteiro limpo (0 erros).

### 3.3 Configurações SEED-PR (`scripts/src/seed-config-seed-pr.ts`)

Script que popula a tabela `configuracoes` (já existente, key-value) com os valores confirmados:
- `seed_pr.padrao_20h` = `{ aulasRegencia: 15, horasAtividade: 9 }`
- `seed_pr.padrao_40h` = `{ aulasRegencia: 30, horasAtividade: 18 }`
- `seed_pr.teto_aulas_turno` = `{ noturno: 19, diurno: 24 }`
- `seed_pr.hora_atividade_mesmo_turno_ate` = `19`
- `seed_pr.max_aulas_geminadas_padrao` = `2` (recomendação operacional, não norma confirmada)

Cada valor documenta sua fonte (artigo da resolução) no campo `descricao`, editável pelo painel sem precisar de código.

### 3.4 Contrato de API (`lib/api-spec/openapi.yaml` + codegen Orval)

- `codigoSae` e `tipoSalaExigido` agora expostos nos schemas `Disciplina`/`DisciplinaInput`/`DisciplinaUpdate` — **antes nem apareciam na API**, mesmo já existindo no banco
- `turno` e `horaAtividadeObrigatoria` expostos nos schemas de `Disponibilidade`
- Codegen do Orval rodado com sucesso — `lib/api-zod` e `lib/api-client-react` regenerados a partir do OpenAPI atualizado

---

## 4. Próximas etapas

### 4.1 Curto prazo — completar o que já foi iniciado

| Item | Descrição | Esforço estimado |
|---|---|---|
| **API de `turma_disciplinas`** | Hoje a rota de turma só aceita `disciplinaIds: number[]` (lista simples). Precisa virar `disciplinas: [{ disciplinaId, maxAulasConsecutivasDia?, grupoCompartilhadoId? }]` para os 2 campos novos serem editáveis via API | Médio — mexe em `POST/PATCH /turmas` e no contrato OpenAPI de novo |
| **Tela no painel — Configurações SEED-PR** | Interface para a secretaria ver/editar os 5 valores de `configuracoes` sem precisar rodar script | Médio |
| **Tela de disponibilidade** | Adicionar campo "Turno" e checkbox "Hora-Atividade obrigatória" no formulário de disponibilidade do professor | Pequeno |
| **Cadastro de disciplina** | Expor `codigoSae` e `tipoSalaExigido` no formulário (hoje só existem no banco/API) | Pequeno |

### 4.2 Médio prazo — verificação pendente

| Item | Descrição |
|---|---|
| **Ler a Instrução Normativa nº 001/2026 – DEDUC/SEED** | Única forma de confirmar (ou descartar) a regra de aulas simultâneas obrigatórias entre turmas do Itinerário Formativo |
| **Confirmar se `grupoCompartilhadoId` deve ser obrigatório ou opcional** | Depende do resultado da verificação acima — hoje está implementado como recurso opcional (a escola ativa se quiser) |
| **Acompanhar o desfecho da disputa judicial hora-atividade** | Se o STJ decidir definitivamente a favor do sindicato, os valores padrão de `seed_pr.padrao_20h`/`40h` podem precisar mudar de 15+9/30+18 para 13+7/26+14 — por isso ficaram configuráveis, não fixos no código |

### 4.3 Longo prazo — motor de geração automática

Hoje as 5 novas regras rodam no **detector de conflitos** (avisam depois que a grade já foi montada). O próximo passo natural é levar essas mesmas regras para dentro do **gerador automático de horário** (`RF-SOLV`, hoje uma heurística gulosa), para que ele já monte a grade respeitando:
- Teto de aulas por turno
- Sala obrigatória por disciplina
- Limite de aulas geminadas
- Concentração de hora-atividade no turno certo

Isso evita que a escola gere uma grade, veja os conflitos, e tenha que corrigir manualmente — o sistema já nasceria em conformidade.

---

## 5. Resumo executivo

- **4 normas confirmadas** por leitura direta de PDF oficial (Resolução SEED n.º 7.200/2025) → já implementadas em schema + detector de conflitos + configuração editável
- **2 alegações descartadas** por falta de fonte válida (uma delas citava post de Instagram como norma de governo)
- **1 alegação pendente** de confirmação (itinerários simultâneos) — aponta para a Instrução Normativa nº 001/2026, ainda não lida
- Todo o código novo passou por **typecheck limpo** (schema, backend, contrato de API) antes de ser considerado pronto
- O sistema está mais próximo da conformidade real, mas **ainda não está 100%**: faltam telas no painel e a extensão da API de turma/disciplina para os 2 campos mais recentes

---

*Relatório produzido como registro desta rodada de verificação e implementação. Referências: PDF da Resolução SEED n.º 7.200/2025 (lido via NRE Francisco Beltrão), PDF da Resolução n.º 198/2026 – GS/SEED, e o histórico desta conversa.*
