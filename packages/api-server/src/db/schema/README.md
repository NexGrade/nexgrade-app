# Schema NexGrade — ALTA + MÉDIA prioridade

Schema Drizzle (Postgres/Supabase) cobrindo os 5 itens **ALTA** e os 5 itens
**MÉDIA** do plano de implementação consolidado (v2). Compilado e validado
com `tsc --strict` (zero erros no código do pacote).

## Arquivos

| Arquivo | Conteúdo | Itens do roadmap |
|---|---|---|
| `enums.ts` | Todos os enums fechados usados pelo schema | Composição Curricular, turno, dia da semana, parâmetros do motor |
| `referencias-existentes.ts` | **Stub** — trocar pelas tabelas reais de `escolas`/`professores` do projeto | — |
| `disciplinas.ts` | Cadastro de disciplina | ALTA: `codigo_sae` · MÉDIA: `abreviatura` |
| `matriz-curricular.ts` | Curso, matriz, série da matriz, disciplina×série | ALTA: `codigo_matriz_sere`, enum, `obrigatoriedade` · MÉDIA: `grupo_disciplina`/`padrao_do_grupo` |
| `turmas.ts` | Turma e vínculo docente (turma×disciplina×professor) | BAIXA: `sufixo_itinerario` (incluído de graça, é trivial) |
| `horarios.ts` | Slots de horário por turno | ALTA: `configuracao_horario` |
| `restricoes.ts` | Indisponibilidade do professor e aulas fixas | MÉDIA: `indisponibilidade_professor`, tela de aulas fixas |
| `motor-config.ts` | Parâmetros de otimização do motor | MÉDIA: sincronismo, geminação, multi-disciplina, teto diário |
| `index.ts` | Barrel export — importar isso no `db.ts` do projeto | — |

## O que **não** está aqui (de propósito)

Os três itens marcados **CONFIRMAR** no plano — bloco `FORM`, agrupamento de
turmas `IF-XX` e o pseudo-professor `HIBRIDA-XX` — não têm tabela própria
ainda. Modelar isso agora seria adivinhar a partir de capturas de tela,
e o risco de retrabalho é alto o suficiente para valer a pena esperar a
resposta da escola (email já enviado). Quando a resposta chegar, o desenho
mais provável é:

- `FORM` → um quarto valor no que hoje é a distinção aula/indisponível/HA
  (viraria um enum `tipo_periodo` em vez de tabelas separadas).
- `IF-XX` → uma tabela `turma_pool` (grupo de turmas) que `turma_disciplina_professor`
  referenciaria opcionalmente no lugar de `turma_id` único.
- `HIBRIDA-XX` → provavelmente **não** deveria ser uma linha na tabela
  `professores` — mas isso é exatamente o tipo de decisão que depende da
  resposta.

## Integração no monorepo

1. Apagar `referencias-existentes.ts` e trocar `escolasRef` / `professoresRef`
   pelas tabelas reais do `@workspace/api-server`.
2. Copiar os demais arquivos para o diretório de schema do Drizzle do projeto
   (provavelmente algo como `packages/api-server/src/db/schema/`).
3. Adicionar `abreviatura` na tabela de professores real, se ainda não existir
   (só esse campo é retroativo — todo o resto é tabela nova).
4. Rodar `drizzle-kit generate` para gerar a migration a partir deste schema.
5. Popular `configuracao_horario` manualmente por escola antes de qualquer
   outra coisa — nada no motor funciona sem os slots de horário.

## Decisões de design que valem revisão

- **Multi-tenant**: toda tabela carrega `escola_id` direto (não só via
  cascata de FK), para consultas simples de isolamento por tenant — mesmo
  padrão que já existe no projeto (Clerk Organizations).
- **`ano_letivo` como `int`, não como FK de "período letivo"**: mais simples
  de consultar/filtrar. Se o projeto já tem uma entidade de período letivo
  formal, vale substituir.
- **Co-docência permitida em `turma_disciplina_professor`**: mais de um
  professor pode dividir a carga de uma mesma disciplina numa turma —
  modelado como múltiplas linhas, não como array. Se isso nunca acontece
  na prática, pode simplificar para `unique(turma, disciplina, ano)`.
- **`aulas_fixas` com duas constraints de unicidade** (turma+slot e
  professor+slot): impede dois conflitos óbvios no nível do banco, mas o
  motor ainda precisa validar o resto (ex.: carga horária semanal batendo).
