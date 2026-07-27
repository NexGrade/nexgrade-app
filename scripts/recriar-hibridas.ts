import { db, professoresTable, professorDisciplinasTable } from "@workspace/db";
async function run() {
  const criados = await db.insert(professoresTable).values([
    { nome: "Híbrida (1NB)", escolaId: "escola_default", ativo: true, email: "hibrida-1nb@sistema.local" },
    { nome: "Híbrida (2NB)", escolaId: "escola_default", ativo: true, email: "hibrida-2nb@sistema.local" },
    { nome: "Híbrida (2NC)", escolaId: "escola_default", ativo: true, email: "hibrida-2nc@sistema.local" },
  ]).returning();
  console.log("Professores criados:", criados);
  const vinculos = await db.insert(professorDisciplinasTable).values(
    criados.map(p => ({ professorId: p.id, disciplinaId: 1669 }))
  ).returning();
  console.log("Vinculos criados:", vinculos);
  process.exit(0);
}
run();
