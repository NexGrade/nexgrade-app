with open("lib/db/src/schema/horarios.ts", "r", encoding="utf-8") as f:
    conteudo = f.read()

antigo = '''  diaSemana: integer("dia_semana").notNull(),
  numeroAula: integer("numero_aula").notNull(),
  sala: text("sala"),'''

novo = '''  diaSemana: integer("dia_semana").notNull(),
  numeroAula: integer("numero_aula").notNull(),
  // [NOVO] So e necessario/usado quando turmaId e NULL (disciplinas
  // semTurma, ex.: PAEE) -- pra aulas normais, o turno ja e conhecido
  // via turmasTable.turno, entao esse campo fica nulo. Existe so pra
  // desambiguar professores que dao a mesma disciplina semTurma em
  // mais de um turno no mesmo dia/numero de aula (a numeracao de aula
  // se repete entre turnos).
  turno: text("turno"),
  sala: text("sala"),'''

count = conteudo.count(antigo)
print(f"Ocorrencias encontradas: {count}")
assert count == 1
conteudo = conteudo.replace(antigo, novo)

with open("lib/db/src/schema/horarios.ts", "w", encoding="utf-8") as f:
    f.write(conteudo)

print("OK: coluna turno adicionada")
