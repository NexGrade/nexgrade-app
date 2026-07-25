// Script pontual — corrige efeito colateral do script anterior
// (criar-professor-hibrida.ts): usar UM professor placeholder só pra
// 3 turmas gerou um falso "professor duplicado" (2NB e 2NC caem no
// mesmo horário, Segunda 19:35, então o mesmo "professor" apareceria
// em 2 lugares ao mesmo tempo) e um falso "professor não habilitado"
// (nunca vinculamos a disciplina "Hibrida" ao professor placeholder).
//
// Correção: cada turma passa a ter seu PRÓPRIO professor placeholder
// (não é gente de verdade, então não custa nada ter um por turma), e
// cada um fica vinculado à disciplina "Hibrida" via professor_disciplinas.
//
// Seguro rodar mais de uma vez.
//
// Como rodar:
//   pnpm --filter @workspace/scripts exec tsx src/corrigir-professores-hibrida.ts

import { db, pool } from "@workspace/db";
import { professoresTable, disciplinasTable, turmasTable, horariosTable, professorDisciplinasTable } from "@workspace/db/schema";
import { eq, and, ilike } from "drizzle-orm";

const ESCOLA_ID = "escola_default";

const TURMAS_HIBRIDA = ["1NB", "2NB", "2NC"];

async function main() {
  console.log("🔧 Separando o professor placeholder 'Híbrida' em um por turma...\n");

  const [discHibrida] = await db.select().from(disciplinasTable)
    .where(and(eq(disciplinasTable.escolaId, ESCOLA_ID), ilike(disciplinasTable.nome, "%hibrid%")));
  if (!discHibrida) {
    console.error('❌ Não encontrei a disciplina "Hibrida".');
    await pool.end();
    process.exit(1);
  }

  for (const nomeTurma of TURMAS_HIBRIDA) {
    const nomeProfessor = `Híbrida (${nomeTurma})`;

    let [professor] = await db.select().from(professoresTable)
      .where(and(eq(professoresTable.escolaId, ESCOLA_ID), eq(professoresTable.nome, nomeProfessor)));

    if (!professor) {
      [professor] = await db.insert(professoresTable).values({
        escolaId: ESCOLA_ID,
        nome: nomeProfessor,
        email: `hibrida.${nomeTurma.toLowerCase()}@placeholder.nexgrade.local`,
        cargaHorariaTotal: 0,
      }).returning();
      console.log(`✅ Professor placeholder "${nomeProfessor}" criado (id ${professor.id})`);
    } else {
      console.log(`⏭️  Professor placeholder "${nomeProfessor}" já existia (id ${professor.id})`);
    }

    // Vincula a disciplina "Hibrida" a esse placeholder (silencia o
    // conflito de "professor não habilitado").
    const [jaVinculado] = await db.select().from(professorDisciplinasTable)
      .where(and(eq(professorDisciplinasTable.professorId, professor.id), eq(professorDisciplinasTable.disciplinaId, discHibrida.id)));
    if (!jaVinculado) {
      await db.insert(professorDisciplinasTable).values({ professorId: professor.id, disciplinaId: discHibrida.id });
      console.log(`   ✅ Vinculado à disciplina "${discHibrida.nome}"`);
    }

    // Repassa a aula dessa turma (gravada antes com o professor
    // placeholder compartilhado) para o placeholder específico dela.
    const [turma] = await db.select().from(turmasTable)
      .where(and(eq(turmasTable.escolaId, ESCOLA_ID), eq(turmasTable.nome, nomeTurma)));
    if (!turma) {
      console.log(`   ⚠️  Turma "${nomeTurma}" não encontrada — pulei o horário`);
      continue;
    }

    const atualizado = await db.update(horariosTable)
      .set({ professorId: professor.id })
      .where(and(
        eq(horariosTable.escolaId, ESCOLA_ID),
        eq(horariosTable.turmaId, turma.id),
        eq(horariosTable.disciplinaId, discHibrida.id),
      ))
      .returning();
    console.log(`   ✅ ${atualizado.length} aula(s) de "${nomeTurma}" repassada(s) pro placeholder específico`);
  }

  console.log("\n🎉 Concluído. Cada turma agora tem seu próprio professor placeholder de Híbrida.");
  await pool.end();
}

main().catch((err) => {
  console.error("❌ Erro:", err);
  process.exit(1);
});
