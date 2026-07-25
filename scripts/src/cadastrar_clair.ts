// Script pontual — cadastra a professora Clair (PAEE), que existia na
// grade real (tarde/vespertino) mas não estava no sistema. PAEE não é
// modelado como turma+disciplina no schema atual (mesma decisão já
// tomada pra outros professores PAEE, ex.: Sueli), então ela não
// recebe vínculos de disciplina nem aulas em `horarios` -- só o
// cadastro básico e a disponibilidade bloqueada em TODOS os horários
// de PAEE, pra o gerador de horário nunca tentar encaixar aula de
// verdade nela.
//
// Padrão real confirmado: PAEE nas 5 aulas (13:05 a 16:40), todos os
// dias da semana, turno vespertino -- sem horário livre.
//
// Como rodar:
//   pnpm --filter @workspace/scripts exec tsx src/cadastrar_clair.ts

import { db, pool } from "@workspace/db";
import { professoresTable, disponibilidadeTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const ESCOLA_ID = "escola_default";
const TURNO = "vespertino";

async function main() {
  console.log("🔧 Cadastrando professora Clair (PAEE)...\n");

  let [clair] = await db.select().from(professoresTable)
    .where(and(eq(professoresTable.escolaId, ESCOLA_ID), eq(professoresTable.nome, "Clair")));

  if (!clair) {
    [clair] = await db.insert(professoresTable).values({
      escolaId: ESCOLA_ID,
      nome: "Clair",
      email: "clair@escola.nexgrade.local",
      cargaHorariaTotal: 0,
    }).returning();
    console.log(`✅ Professora Clair criada (id ${clair.id}) -- email é placeholder, atualize com o real quando tiver.`);
  } else {
    console.log(`⏭️  Clair já existia (id ${clair.id})`);
  }

  // Bloqueia TODAS as 5 aulas (PAEE), todos os dias -- sem horario livre.
  let bloqueadas = 0;
  for (let dia = 0; dia <= 4; dia++) {
    for (let aula = 1; aula <= 5; aula++) {
      const [jaExiste] = await db.select().from(disponibilidadeTable)
        .where(and(
          eq(disponibilidadeTable.professorId, clair.id),
          eq(disponibilidadeTable.turno, TURNO),
          eq(disponibilidadeTable.diaSemana, dia),
          eq(disponibilidadeTable.horarioSlot, aula),
        ));
      if (jaExiste) continue;
      await db.insert(disponibilidadeTable).values({
        professorId: clair.id,
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
