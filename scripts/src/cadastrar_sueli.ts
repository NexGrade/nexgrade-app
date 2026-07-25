// Script pontual — cadastra a professora Sueli (PAEE), que existia na
// grade real mas não estava no sistema. PAEE não é modelado como
// turma+disciplina no schema atual (mesma decisão já tomada antes pra
// outros professores PAEE), então ela não recebe vínculos de
// disciplina nem aulas em `horarios` -- só o cadastro básico e a
// disponibilidade bloqueada nos horários de PAEE, pra o gerador nunca
// tentar encaixar aula de verdade nela nesse período.
//
// Padrão real confirmado: PAEE nas aulas 1-5 (07:30 a 11:05), livre na
// aula 6 (11:55), todos os dias da semana, turno matutino.
//
// Como rodar:
//   pnpm --filter @workspace/scripts exec tsx src/cadastrar_sueli.ts

import { db, pool } from "@workspace/db";
import { professoresTable, disponibilidadeTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const ESCOLA_ID = "escola_default";
const TURNO = "matutino";

async function main() {
  console.log("🔧 Cadastrando professora Sueli (PAEE)...\n");

  let [sueli] = await db.select().from(professoresTable)
    .where(and(eq(professoresTable.escolaId, ESCOLA_ID), eq(professoresTable.nome, "Sueli")));

  if (!sueli) {
    [sueli] = await db.insert(professoresTable).values({
      escolaId: ESCOLA_ID,
      nome: "Sueli",
      email: "sueli@escola.nexgrade.local",
      cargaHorariaTotal: 0,
    }).returning();
    console.log(`✅ Professora Sueli criada (id ${sueli.id}) -- email é placeholder, atualize com o real quando tiver.`);
  } else {
    console.log(`⏭️  Sueli já existia (id ${sueli.id})`);
  }

  // Bloqueia as aulas 1-5 (PAEE) em todos os dias -- aula 6 fica livre,
  // sem nenhum registro (ausência de registro = disponível por padrão).
  let bloqueadas = 0;
  for (let dia = 0; dia <= 4; dia++) {
    for (let aula = 1; aula <= 5; aula++) {
      const [jaExiste] = await db.select().from(disponibilidadeTable)
        .where(and(
          eq(disponibilidadeTable.professorId, sueli.id),
          eq(disponibilidadeTable.turno, TURNO),
          eq(disponibilidadeTable.diaSemana, dia),
          eq(disponibilidadeTable.horarioSlot, aula),
        ));
      if (jaExiste) continue;
      await db.insert(disponibilidadeTable).values({
        professorId: sueli.id,
        diaSemana: dia,
        horarioSlot: aula,
        disponivel: false,
        turno: TURNO,
        horaAtividadeObrigatoria: false,
        motivo: "PAEE -- atividade fixa, não modelada como aula no sistema (Programa de Apoio ao Ensino Especial)",
      });
      bloqueadas++;
    }
  }

  console.log(`✅ ${bloqueadas} slot(s) de PAEE bloqueado(s).`);
  console.log("\n🎉 Concluído.");
  await pool.end();
}

main().catch((err) => {
  console.error("❌ Erro:", err);
  process.exit(1);
});
