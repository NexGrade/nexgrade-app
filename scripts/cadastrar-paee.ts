import { db, professoresTable, professorDisciplinasTable, disciplinasTable } from "@workspace/db";
import { eq } from "drizzle-orm";
async function run() {
  const [paee] = await db.select().from(disciplinasTable).where(eq(disciplinasTable.nome, "PAEE"));
  if (!paee) { console.error("Disciplina PAEE nao encontrada"); process.exit(1); }

  const novos = ["Camila", "Doraci", "Noeli", "Hericleia", "Kauana", "Silvana", "Rosinei"];
  const criados = await db.insert(professoresTable).values(
    novos.map(nome => ({ nome, escolaId: "escola_default", ativo: true, email: nome.toLowerCase() + "@sistema.local" }))
  ).returning();
  console.log("Criados:", criados.map(p => ({ id: p.id, nome: p.nome })));

  const idsExistentes = [687, 625, 686];
  const todosIds = [...criados.map(p => p.id), ...idsExistentes];

  const vinculos = await db.insert(professorDisciplinasTable).values(
    todosIds.map(professorId => ({ professorId, disciplinaId: paee.id }))
  ).returning();
  console.log("Vinculos criados:", vinculos.length);
  process.exit(0);
}
run();
