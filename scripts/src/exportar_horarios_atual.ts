// Script pontual — exporta TODAS as aulas reais atualmente no sistema
// (horarios + professor + turma + disciplina, nos 3 turnos) pra um
// arquivo JSON, no mesmo formato usado pra comparar com o PDF real.
//
// Não altera nada no banco -- só leitura.
//
// Como rodar:
//   pnpm --filter @workspace/scripts exec tsx src/exportar_horarios_atual.ts
//
// Depois, envie o conteúdo do arquivo gerado
// (horarios_atual_export.json, na pasta scripts) de volta pra mim.

import { db, pool } from "@workspace/db";
import { horariosTable, professoresTable, turmasTable, disciplinasTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { writeFileSync } from "fs";

const ESCOLA_ID = "escola_default";
const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex"];

async function main() {
  console.log("🔧 Exportando horários atuais do sistema...\n");

  const [horarios, professores, turmas, disciplinas] = await Promise.all([
    db.select().from(horariosTable).where(eq(horariosTable.escolaId, ESCOLA_ID)),
    db.select().from(professoresTable).where(eq(professoresTable.escolaId, ESCOLA_ID)),
    db.select().from(turmasTable).where(eq(turmasTable.escolaId, ESCOLA_ID)),
    db.select().from(disciplinasTable).where(eq(disciplinasTable.escolaId, ESCOLA_ID)),
  ]);

  const profMap = new Map(professores.map((p) => [p.id, p]));
  const turmaMap = new Map(turmas.map((t) => [t.id, t]));
  const discMap = new Map(disciplinas.map((d) => [d.id, d]));

  const resultado = horarios.map((h) => {
    const prof = profMap.get(h.professorId);
    const turma = turmaMap.get(h.turmaId);
    const disc = discMap.get(h.disciplinaId);
    return {
      professor: prof?.nome ?? `#${h.professorId}`,
      turno: turma?.turno ?? "?",
      dia: DIAS[h.diaSemana] ?? String(h.diaSemana),
      numeroAula: h.numeroAula,
      turma: turma?.nome ?? `#${h.turmaId}`,
      disciplina: disc?.nome ?? `#${h.disciplinaId}`,
      codigoSae: disc?.codigoSae ?? null,
    };
  });

  resultado.sort((a, b) =>
    a.turno.localeCompare(b.turno) ||
    a.professor.localeCompare(b.professor) ||
    a.dia.localeCompare(b.dia) ||
    a.numeroAula - b.numeroAula,
  );

  writeFileSync("horarios_atual_export.json", JSON.stringify(resultado, null, 1), "utf-8");
  console.log(`✅ ${resultado.length} aulas exportadas para horarios_atual_export.json`);
  console.log("\n🎉 Concluído. Envie o conteúdo desse arquivo de volta.");
  await pool.end();
}

main().catch((err) => {
  console.error("❌ Erro:", err);
  process.exit(1);
});
