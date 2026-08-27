with open("lib/db/src/schema/disciplinas.ts", "r", encoding="utf-8") as f:
    conteudo1 = f.read()

antigo1 = """  categoriaCurricularPadrao: composicaoCurricularEnum("categoria_curricular_padrao"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),"""
novo1 = """  categoriaCurricularPadrao: composicaoCurricularEnum("categoria_curricular_padrao"),
  // [NOVO] Disciplinas do tipo PAEE (Atendimento Educacional
  // Especializado) e similares nao tem vinculo com turma -- o
  // professor da essa "aula" pra registrar carga horaria, mas nao
  // existe uma turma especifica associada. Quando true, o campo
  // turmaId em horariosTable fica opcional pra essa disciplina (a
  // interface tambem esconde o seletor de turma ao criar/editar).
  semTurma: boolean("sem_turma").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),"""
count1 = conteudo1.count(antigo1)
print(f"1) disciplinas.ts: {count1} ocorrencia(s)")
assert count1 == 1
conteudo1 = conteudo1.replace(antigo1, novo1)

antigo1b = 'import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";'
novo1b = 'import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";'
count1b = conteudo1.count(antigo1b)
print(f"1b) import boolean: {count1b} ocorrencia(s)")
assert count1b == 1
conteudo1 = conteudo1.replace(antigo1b, novo1b)

with open("lib/db/src/schema/disciplinas.ts", "w", encoding="utf-8") as f:
    f.write(conteudo1)

with open("lib/db/src/schema/horarios.ts", "r", encoding="utf-8") as f:
    conteudo2 = f.read()

antigo2 = '  turmaId: integer("turma_id").notNull().references(() => turmasTable.id, { onDelete: "cascade" }),'
novo2 = '''  // [ALTERADO] Nulavel -- disciplinas marcadas como semTurma (ex.:
  // PAEE) ocupam um horario na grade do professor sem estar ligadas
  // a nenhuma turma especifica.
  turmaId: integer("turma_id").references(() => turmasTable.id, { onDelete: "cascade" }),'''
count2 = conteudo2.count(antigo2)
print(f"2) horarios.ts: {count2} ocorrencia(s)")
assert count2 == 1
conteudo2 = conteudo2.replace(antigo2, novo2)

with open("lib/db/src/schema/horarios.ts", "w", encoding="utf-8") as f:
    f.write(conteudo2)

print("OK: schemas atualizados")
