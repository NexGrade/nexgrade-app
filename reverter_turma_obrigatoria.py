import re

# --- 1) Reverte horarios.ts: turmaId de volta para NOT NULL ---
with open("lib/db/src/schema/horarios.ts", "r", encoding="utf-8") as f:
    conteudo1 = f.read()

antigo1 = '''  // [ALTERADO] Nulavel -- disciplinas marcadas como semTurma (ex.:
  // PAEE) ocupam um horario na grade do professor sem estar ligadas
  // a nenhuma turma especifica.
  turmaId: integer("turma_id").references(() => turmasTable.id, { onDelete: "cascade" }),'''
novo1 = '  turmaId: integer("turma_id").notNull().references(() => turmasTable.id, { onDelete: "cascade" }),'
count1 = conteudo1.count(antigo1)
print(f"1) turmaId NOT NULL de volta: {count1} ocorrencia(s)")
assert count1 == 1
conteudo1 = conteudo1.replace(antigo1, novo1)

# --- 2) Remove a coluna turno (nao e mais necessaria, resolvido via turma fantasma) ---
antigo2 = '''  // [NOVO] So e necessario/usado quando turmaId e NULL (disciplinas
  // semTurma, ex.: PAEE) -- pra aulas normais, o turno ja e conhecido
  // via turmasTable.turno, entao esse campo fica nulo. Existe so pra
  // desambiguar professores que dao a mesma disciplina semTurma em
  // mais de um turno no mesmo dia/numero de aula (a numeracao de aula
  // se repete entre turnos).
  turno: text("turno"),
'''
count2 = conteudo1.count(antigo2)
print(f"2) Remove coluna turno: {count2} ocorrencia(s)")
assert count2 == 1
conteudo1 = conteudo1.replace(antigo2, "")

with open("lib/db/src/schema/horarios.ts", "w", encoding="utf-8") as f:
    f.write(conteudo1)

# --- 3) Reverte minha-agenda.ts: leftJoin de volta para innerJoin, remove fallback ---
with open("artifacts/api-server/src/routes/minha-agenda.ts", "r", encoding="utf-8") as f:
    conteudo2 = f.read()

antigo3 = """    .innerJoin(disciplinasTable, eq(disciplinasTable.id, horariosTable.disciplinaId))
    .leftJoin(turmasTable, eq(turmasTable.id, horariosTable.turmaId))"""
novo3 = """    .innerJoin(disciplinasTable, eq(disciplinasTable.id, horariosTable.disciplinaId))
    .innerJoin(turmasTable, eq(turmasTable.id, horariosTable.turmaId))"""
count3 = conteudo2.count(antigo3)
print(f"3) leftJoin -> innerJoin: {count3} ocorrencia(s)")
assert count3 == 1
conteudo2 = conteudo2.replace(antigo3, novo3)

antigo4 = "      turmaNome: sql<string>`COALESCE(${turmasTable.nome}, 'PAEE')`,"
novo4 = "      turmaNome: turmasTable.nome,"
count4 = conteudo2.count(antigo4)
print(f"4) Remove fallback turmaNome: {count4} ocorrencia(s)")
assert count4 == 1
conteudo2 = conteudo2.replace(antigo4, novo4)

antigo5 = 'import { and, eq, gte, ne, or, isNull, sql } from "drizzle-orm";'
novo5 = 'import { and, eq, gte, ne, or, isNull } from "drizzle-orm";'
count5 = conteudo2.count(antigo5)
print(f"5) Remove import sql: {count5} ocorrencia(s)")
assert count5 == 1
conteudo2 = conteudo2.replace(antigo5, novo5)

with open("artifacts/api-server/src/routes/minha-agenda.ts", "w", encoding="utf-8") as f:
    f.write(conteudo2)

print("\nOK: reversao completa")
