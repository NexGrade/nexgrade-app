// Script de seed — popula `horario_slots` (aba "Esquema") com os
// horários reais já confirmados nos PDFs da grade (07:30 na manhã,
// 13:05 na tarde, 18:45 na noite — ver seed-horarios.ts, que já usa
// esses mesmos horários pra converter hora em numeroAula).
//
// 4 esquemas reais:
//   matutino + fundamental   (6º-9º ano manhã)  — 5 aulas, 07:30-11:05
//   matutino + medio_tecnico (1ª-3ª série manhã) — 6 aulas, 07:30-11:55
//   vespertino (uniforme)                        — 5 aulas, 13:05-16:40
//   noturno (uniforme)                            — 5 aulas, 18:45-22:10
//
// Como rodar:
//   pnpm --filter @workspace/scripts exec tsx src/seed-esquema-horarios.ts

import { db, pool } from "@workspace/db";
import { horarioSlotsTable } from "@workspace/db/schema";
import { eq, and, isNull } from "drizzle-orm";

const ESCOLA_ID = "escola_default";
const DURACAO_PADRAO = 50;

type Esquema = {
  turno: string;
  nivelEnsino: "fundamental" | "medio_tecnico" | null;
  horarios: string[];
};

const ESQUEMAS: Esquema[] = [
  { turno: "matutino", nivelEnsino: "fundamental", horarios: ["07:30", "08:20", "09:25", "10:15", "11:05"] },
  { turno: "matutino", nivelEnsino: "medio_tecnico", horarios: ["07:30", "08:20", "09:25", "10:15", "11:05", "11:55"] },
  { turno: "vespertino", nivelEnsino: null, horarios: ["13:05", "13:55", "14:45", "15:50", "16:40"] },
  { turno: "noturno", nivelEnsino: null, horarios: ["18:45", "19:35", "20:35", "21:25", "22:10"] },
];

async function main() {
  console.log("🌱 Configurando Esquema (horario_slots) com os horários reais...\n");

  for (const esquema of ESQUEMAS) {
    const condicaoNivel = esquema.nivelEnsino
      ? eq(horarioSlotsTable.nivelEnsino, esquema.nivelEnsino)
      : isNull(horarioSlotsTable.nivelEnsino);

    // Idempotente: apaga o esquema desse turno+nível antes de recriar.
    await db.delete(horarioSlotsTable).where(
      and(eq(horarioSlotsTable.escolaId, ESCOLA_ID), eq(horarioSlotsTable.turno, esquema.turno), condicaoNivel),
    );

    const linhas = esquema.horarios.map((hora, i) => ({
      escolaId: ESCOLA_ID,
      turno: esquema.turno,
      nivelEnsino: esquema.nivelEnsino,
      numeroAula: i + 1,
      horaInicio: `${hora}:00`,
      duracaoMinutos: DURACAO_PADRAO,
    }));

    await db.insert(horarioSlotsTable).values(linhas);
    const rotulo = esquema.nivelEnsino ? `${esquema.turno} / ${esquema.nivelEnsino}` : esquema.turno;
    console.log(`✅ ${rotulo}: ${linhas.length} aulas (${esquema.horarios[0]} a ${esquema.horarios[esquema.horarios.length - 1]})`);
  }

  console.log("\n🎉 Esquema configurado para os 4 turnos/níveis reais.");
  await pool.end();
}

main().catch((err) => {
  console.error("❌ Erro ao configurar esquema:", err);
  process.exit(1);
});
