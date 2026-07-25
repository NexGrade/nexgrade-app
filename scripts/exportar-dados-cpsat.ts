// Script de exportação — roda localmente (tem acesso ao DATABASE_URL
// do projeto), exporta os dados reais de um turno num JSON que
// o spike CP-SAT consegue ler. Não altera nada no banco, é só leitura.
//
// Como rodar:
//   cd C:\Projetos\nexgrade-app
//   npx tsx scripts/exportar-dados-cpsat.ts matutino
//   npx tsx scripts/exportar-dados-cpsat.ts vespertino
//   npx tsx scripts/exportar-dados-cpsat.ts noturno
//
// Gera: spike-cp-sat/dados-reais-<turno>.json
import { db } from "@workspace/db";
import {
  turmasTable,
  turmaDisciplinasTable,
  disciplinasTable,
  professoresTable,
  disponibilidadeTable,
  horarioSlotsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { writeFileSync } from "fs";
async function main() {
  const TURNO = process.argv[2];
  if (!TURNO || !["matutino", "vespertino", "noturno"].includes(TURNO)) {
    console.error(`Uso: npx tsx scripts/exportar-dados-cpsat.ts <matutino|vespertino|noturno>`);
    process.exit(1);
  }
  const turmas = await db.select().from(turmasTable).where(eq(turmasTable.turno, TURNO));
  if (turmas.length === 0) {
    console.error(`Nenhuma turma encontrada no turno "${TURNO}".`);
    process.exit(1);
  }
  const turmaIds = new Set(turmas.map((t) => t.id));
  const [turmaDiscsTodos, disciplinas, professoresTodos, disponibilidades, horarioSlots] = await Promise.all([
    db.select().from(turmaDisciplinasTable),
    db.select().from(disciplinasTable),
    db.select().from(professoresTable),
    db.select().from(disponibilidadeTable),
    db.select().from(horarioSlotsTable).where(eq(horarioSlotsTable.turno, TURNO)),
  ]);
  const turmaDiscs = turmaDiscsTodos.filter((td) => turmaIds.has(td.turmaId));
  const professorIdsUsados = new Set(turmaDiscs.map((td) => td.professorId).filter((id): id is number => id != null));
  const professores = professoresTodos.filter((p) => professorIdsUsados.has(p.id));
  const disponibilidadesRelevantes = disponibilidades.filter(
    (d) => professorIdsUsados.has(d.professorId) && (d.turno === TURNO || d.turno == null),
  );
  const disciplinaMap = new Map(disciplinas.map((d) => [d.id, d]));
  const professorMap = new Map(professores.map((p) => [p.id, p]));
  const disciplinasTurma = turmaDiscs
    .filter((td) => td.professorId != null)
    .map((td) => {
      const turma = turmas.find((t) => t.id === td.turmaId)!;
      const disc = disciplinaMap.get(td.disciplinaId);
      const prof = professorMap.get(td.professorId!);
      return {
        turma: turma.nome,
        codigoSae: disc?.codigoSae ?? disc?.sigla ?? String(td.disciplinaId),
        nome: disc?.nome ?? `Disciplina #${td.disciplinaId}`,
        aulasSemana: td.cargaHorariaSemanalOverride ?? disc?.cargaSemanal ?? 0,
        professor: prof?.nome ?? `Professor #${td.professorId}`,
        maxAulasDia: td.maxAulasConsecutivasDia ?? 2,
      };
    })
    .filter((d) => d.aulasSemana > 0);
  const bloqueiosProfessor = disponibilidadesRelevantes
    .filter((d) => !d.disponivel)
    .map((d) => ({
      professor: professorMap.get(d.professorId)?.nome ?? `Professor #${d.professorId}`,
      dia: d.diaSemana,
      aula: d.horarioSlot,
    }));
  const aulasPorDia = horarioSlots.length > 0 ? Math.max(...horarioSlots.map((s) => s.numeroAula)) : 6;
  const saida = {
    turno: TURNO,
    aulasPorDia,
    turmas: turmas.map((t) => ({ nome: t.nome, turno: t.turno })),
    disciplinasTurma,
    bloqueiosProfessor,
  };
  const caminho = `spike-cp-sat/dados-reais-${TURNO}.json`;
  writeFileSync(caminho, JSON.stringify(saida, null, 2), "utf-8");
  console.log(`Exportado: ${turmas.length} turmas, ${disciplinasTurma.length} turma+disciplina, ${professores.length} professores, ${bloqueiosProfessor.length} bloqueios de disponibilidade.`);
  console.log(`Arquivo: ${caminho}`);
  process.exit(0);
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
