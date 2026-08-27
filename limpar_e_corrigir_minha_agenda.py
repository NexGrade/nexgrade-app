import re

with open("artifacts/api-server/src/routes/minha-agenda.ts", "r", encoding="utf-8") as f:
    conteudo = f.read()

# --- 1) Remove TODAS as ocorrencias do bloco /agenda.ics (codigo morto
# desde que a funcionalidade foi removida do frontend) ---
padrao_bloco_ics = re.compile(
    r'\nrouter\.get\("/agenda\.ics".*?(?=\nrouter\.(get|post|patch|delete)\(|\nexport default router;)',
    re.DOTALL,
)
blocos_removidos, n = padrao_bloco_ics.subn("", conteudo)
print(f"1) Blocos /agenda.ics removidos: {n}")
conteudo = blocos_removidos

# --- 2) Corrige o innerJoin da rota real /horario para leftJoin,
# ja que turmaId agora pode ser NULL (disciplinas semTurma, ex. PAEE) ---
antigo_join = """    .innerJoin(disciplinasTable, eq(disciplinasTable.id, horariosTable.disciplinaId))
    .innerJoin(turmasTable, eq(turmasTable.id, horariosTable.turmaId))"""
novo_join = """    .innerJoin(disciplinasTable, eq(disciplinasTable.id, horariosTable.disciplinaId))
    .leftJoin(turmasTable, eq(turmasTable.id, horariosTable.turmaId))"""
count_join = conteudo.count(antigo_join)
print(f"2) innerJoin -> leftJoin: {count_join} ocorrencia(s)")
assert count_join == 1, f"Esperava 1 ocorrencia restante, achou {count_join} -- confira manualmente"
conteudo = conteudo.replace(antigo_join, novo_join)

# --- 3) turmaNome precisa de fallback, ja que agora pode vir NULL do leftJoin ---
antigo_turmanome = "      turmaNome: turmasTable.nome,"
novo_turmanome = '      turmaNome: sql<string>`COALESCE(${turmasTable.nome}, \'PAEE\')`,'
count_turmanome = conteudo.count(antigo_turmanome)
print(f"3) turmaNome fallback: {count_turmanome} ocorrencia(s)")
assert count_turmanome == 1
conteudo = conteudo.replace(antigo_turmanome, novo_turmanome)

# --- 4) Import do helper sql do drizzle-orm ---
antigo_import = 'import { and, eq, gte, ne, or, isNull } from "drizzle-orm";'
novo_import = 'import { and, eq, gte, ne, or, isNull, sql } from "drizzle-orm";'
count_import = conteudo.count(antigo_import)
print(f"4) Import sql: {count_import} ocorrencia(s)")
assert count_import == 1
conteudo = conteudo.replace(antigo_import, novo_import)

with open("artifacts/api-server/src/routes/minha-agenda.ts", "w", encoding="utf-8") as f:
    f.write(conteudo)

print("\nOK: arquivo limpo e corrigido")
