// Script pontual — bloqueia automaticamente, na disponibilidade de
// cada professor, os dias em que ele não tem NENHUMA aula real
// marcada (naquele turno em que ele efetivamente trabalha).
//
// Regra:
//   - Só processa turnos onde o professor tem PELO MENOS 1 aula real
//     (se ele nunca dá aula de manhã, não mexe na disponibilidade da
//     manhã dele -- fica em branco, sem opinião).
//   - Dentro de um turno em que ele trabalha, bloqueia os dias (0-4)
//     em que ele não tem aula NENHUMA naquele turno.
//   - Nunca sobrescreve nada que já esteja marcado (HA institucional,
//     bloqueio manual, disponível manual) -- só preenche onde estava
//     em branco (sem registro nenhum na disponibilidade).
//
// Seguro rodar mais de uma vez (idempotente -- pula o que já existe).
//
// Como rodar:
//   pnpm --filter @workspace/scripts exec tsx src/bloquear-dias-sem-aula.ts

import { db, pool } from "@workspace/db";
import { professoresTable, turmasTable, horariosTable, horarioSlotsTable, disponibilidadeTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const ESCOLA_ID = "escola_default";
const TURNOS = ["matutino", "vespertino", "noturno"] as const;
const MOTIVO = "Bloqueado automaticamente — professor não tem aula real nesse dia/turno";

async function main() {
  console.log("🔧 Bloqueando dias sem aula real na disponibilidade de cada professor...\n");

  const [professores, turmas, horarios, disponibilidadesExistentes] = await Promise.all([
    db.select().from(professoresTable).where(and(eq(professoresTable.escolaId, ESCOLA_ID), eq(professoresTable.ativo, true))),
    db.select().from(turmasTable).where(eq(turmasTable.escolaId, ESCOLA_ID)),
    db.select().from(horariosTable).where(eq(horariosTable.escolaId, ESCOLA_ID)),
    db.select().from(disponibilidadeTable),
  ]);

  const turnoPorTurmaId = new Map(turmas.map((t) => [t.id, t.turno]));
  const existentesSet = new Set(
    disponibilidadesExistentes.map((d) => `${d.professorId}-${d.turno ?? "null"}-${d.diaSemana}-${d.horarioSlot}`),
  );

  // Slots reais de cada turno (superconjunto pro matutino -- 6 aulas do
  // medio_tecnico cobrem as 5 do fundamental também, mesmo raciocínio
  // já usado na tela de Disponibilidade).
  const slotsPorTurno: Record<string, { numeroAula: number }[]> = {};
  for (const turno of TURNOS) {
    const condicaoNivel = turno === "matutino" ? eq(horarioSlotsTable.nivelEnsino, "medio_tecnico") : undefined;
    const where = condicaoNivel ? and(eq(horarioSlotsTable.turno, turno), condicaoNivel) : eq(horarioSlotsTable.turno, turno);
    const slots = await db.select().from(horarioSlotsTable).where(where);
    slotsPorTurno[turno] = slots.map((s) => ({ numeroAula: s.numeroAula }));
  }

  let totalBloqueados = 0;
  let professoresAfetados = 0;

  for (const prof of professores) {
    const aulasDoProf = horarios.filter((h) => h.professorId === prof.id);
    let afetouEsseProf = false;

    for (const turno of TURNOS) {
      const aulasNesseTurno = aulasDoProf.filter((h) => turnoPorTurmaId.get(h.turmaId) === turno);
      if (aulasNesseTurno.length === 0) continue; // não trabalha nesse turno -- não mexe

      const diasComAula = new Set(aulasNesseTurno.map((h) => h.diaSemana));
      const diasSemAula = [0, 1, 2, 3, 4].filter((d) => !diasComAula.has(d));
      if (diasSemAula.length === 0) continue; // trabalha todo dia nesse turno -- nada pra bloquear

      const slots = slotsPorTurno[turno] ?? [];
      const linhasParaInserir: Array<typeof disponibilidadeTable.$inferInsert> = [];

      for (const dia of diasSemAula) {
        for (const slot of slots) {
          const chave = `${prof.id}-${turno}-${dia}-${slot.numeroAula}`;
          if (existentesSet.has(chave)) continue; // já tem algo marcado -- não mexe
          linhasParaInserir.push({
            professorId: prof.id,
            diaSemana: dia,
            horarioSlot: slot.numeroAula,
            disponivel: false,
            turno,
            horaAtividadeObrigatoria: false,
            motivo: MOTIVO,
          });
          existentesSet.add(chave); // evita duplicar se o mesmo slot aparecer 2x por algum motivo
        }
      }

      if (linhasParaInserir.length > 0) {
        await db.insert(disponibilidadeTable).values(linhasParaInserir);
        totalBloqueados += linhasParaInserir.length;
        afetouEsseProf = true;
      }
    }

    if (afetouEsseProf) professoresAfetados++;
  }

  console.log(`✅ ${totalBloqueados} slot(s) bloqueado(s), afetando ${professoresAfetados} professor(es).`);
  console.log("\n🎉 Concluído.");
  await pool.end();
}

main().catch((err) => {
  console.error("❌ Erro:", err);
  process.exit(1);
});
