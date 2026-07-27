// Relatório de conformidade de Hora-Atividade -- compara o TOTAL
// exigido (fórmula oficial SEED-PR, somando todos os turnos) com o
// TOTAL realmente registrado no PDF da escola (posição exata, já
// aplicada). Mesma lógica de agregação usada em conflitos.ts (total,
// não por turno) -- isso é só um RELATÓRIO, não faz nenhuma alteração.
//
// Como rodar:
//   npx tsx scripts/relatorio-conformidade-ha.ts

import { db } from "@workspace/db";
import { professoresTable, turmasTable, horariosTable, disponibilidadeTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const TABELA_OFICIAL_HA: readonly number[] = [
  0,
  0, 0, 1, 1, 2, 2, 2, 2, 3, 3,
  4, 4, 4, 4, 5, 5, 5, 6, 6, 6,
  7, 7, 7, 8, 8, 8, 9, 9, 10, 10,
];

function calcularHoraAtividadeInstitucional(aulas: number): number {
  if (!aulas || aulas <= 0) return 0;
  if (aulas <= 30) return TABELA_OFICIAL_HA[Math.round(aulas)]!;
  return Math.ceil(aulas / 3);
}

async function main() {
  const escolaId = "escola_default";
  const [professores, turmas, horarios, disponibilidades] = await Promise.all([
    db.select().from(professoresTable).where(eq(professoresTable.escolaId, escolaId)),
    db.select().from(turmasTable).where(eq(turmasTable.escolaId, escolaId)),
    db.select().from(horariosTable).where(eq(horariosTable.escolaId, escolaId)),
    db.select().from(disponibilidadeTable),
  ]);

  const turmaMap = new Map(turmas.map((t) => [t.id, t]));

  const aulasPorProfessor = new Map<number, number>();
  for (const h of horarios) {
    if (!turmaMap.get(h.turmaId)) continue;
    aulasPorProfessor.set(h.professorId, (aulasPorProfessor.get(h.professorId) ?? 0) + 1);
  }

  const haPorProfessor = new Map<number, number>();
  for (const d of disponibilidades) {
    if (!d.horaAtividadeObrigatoria) continue;
    haPorProfessor.set(d.professorId, (haPorProfessor.get(d.professorId) ?? 0) + 1);
  }

  const linhas: Array<{ nome: string; aulas: number; exigido: number; marcado: number; diferenca: number }> = [];
  for (const prof of professores) {
    const aulas = aulasPorProfessor.get(prof.id) ?? 0;
    if (aulas === 0 || prof.cargaHorariaTotal === 0) continue; // sem aula real ou placeholder (Hibrida)
    const exigido = calcularHoraAtividadeInstitucional(aulas);
    const marcado = haPorProfessor.get(prof.id) ?? 0;
    linhas.push({ nome: prof.nome, aulas, exigido, marcado, diferenca: marcado - exigido });
  }

  linhas.sort((a, b) => a.diferenca - b.diferenca); // piores casos primeiro

  console.log("=".repeat(70));
  console.log("RELATÓRIO DE CONFORMIDADE -- Hora-Atividade (total real do PDF vs. exigido SEED-PR)");
  console.log("=".repeat(70));

  const emFalta = linhas.filter((l) => l.diferenca < 0);
  const conforme = linhas.filter((l) => l.diferenca >= 0);

  console.log(`\nEM DESACORDO COM A SEED-PR (${emFalta.length} professor(es)):`);
  console.log("Nome".padEnd(22) + "Aulas".padEnd(8) + "Exigido".padEnd(10) + "Real".padEnd(8) + "Faltam");
  for (const l of emFalta) {
    console.log(l.nome.padEnd(22) + String(l.aulas).padEnd(8) + String(l.exigido).padEnd(10) + String(l.marcado).padEnd(8) + String(-l.diferenca));
  }

  console.log(`\nEM CONFORMIDADE (${conforme.length} professor(es)) -- não listados individualmente.`);
  console.log(`\nTotal geral: ${linhas.length} professores com aula real | ${emFalta.length} em desacordo | ${conforme.length} conformes`);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
