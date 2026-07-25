// Script pontual — cria um professor "placeholder" chamado "Híbrida"
// (não é uma pessoa de verdade, é só pra representar aulas híbridas
// sem professor designado) e grava as 3 aulas de "Hibrida" que
// ficaram de fora do seed original (1NB, 2NB, 2NC), porque
// `horarios.professor_id` não aceita nulo e essas 3 aulas realmente
// não têm professor na grade da escola.
//
// Dia/horário usados são os REAIS, vindos da extração da grade
// original (22/06 a 26/06):
//   1NB: Quarta, 19:35 (noite)
//   2NB: Segunda, 19:35 (noite)
//   2NC: Segunda, 19:35 (noite)
//
// Como rodar:
//   pnpm --filter @workspace/scripts exec tsx src/criar-professor-hibrida.ts

import { db, pool } from "@workspace/db";
import { professoresTable, disciplinasTable, turmasTable, horariosTable } from "@workspace/db/schema";
import { eq, and, ilike } from "drizzle-orm";

const ESCOLA_ID = "escola_default";
const NOME_PLACEHOLDER = "Híbrida";
const EMAIL_PLACEHOLDER = "hibrida@placeholder.nexgrade.local";

// diaSemana: 0=segunda...4=sexta (mesma convenção já corrigida em
// fix-dia-semana.ts). numeroAula na noite: 1=18:45, 2=19:35, 3=20:35...
const AULAS_HIBRIDA = [
  { turma: "1NB", diaSemana: 2, numeroAula: 2 }, // Quarta, 19:35
  { turma: "2NB", diaSemana: 0, numeroAula: 2 }, // Segunda, 19:35
  { turma: "2NC", diaSemana: 0, numeroAula: 2 }, // Segunda, 19:35
];

async function main() {
  console.log("🔧 Criando professor placeholder 'Híbrida' e gravando as 3 aulas...\n");

  let [professorHibrida] = await db.select().from(professoresTable)
    .where(and(eq(professoresTable.escolaId, ESCOLA_ID), eq(professoresTable.nome, NOME_PLACEHOLDER)));

  if (!professorHibrida) {
    [professorHibrida] = await db.insert(professoresTable).values({
      escolaId: ESCOLA_ID,
      nome: NOME_PLACEHOLDER,
      email: EMAIL_PLACEHOLDER,
      cargaHorariaTotal: 0,
    }).returning();
    console.log(`✅ Professor placeholder "${NOME_PLACEHOLDER}" criado (id ${professorHibrida.id})`);
  } else {
    console.log(`⏭️  Professor placeholder "${NOME_PLACEHOLDER}" já existia (id ${professorHibrida.id})`);
  }

  const [discHibrida] = await db.select().from(disciplinasTable)
    .where(and(eq(disciplinasTable.escolaId, ESCOLA_ID), ilike(disciplinasTable.nome, "%hibrid%")));

  if (!discHibrida) {
    console.error('❌ Não encontrei uma disciplina com nome parecido com "Hibrida" nessa escola.');
    await pool.end();
    process.exit(1);
  }
  console.log(`✅ Disciplina encontrada: "${discHibrida.nome}" (id ${discHibrida.id})`);

  let criadas = 0;
  for (const item of AULAS_HIBRIDA) {
    const [turma] = await db.select().from(turmasTable)
      .where(and(eq(turmasTable.escolaId, ESCOLA_ID), eq(turmasTable.nome, item.turma)));
    if (!turma) {
      console.log(`⚠️  Turma "${item.turma}" não encontrada — pulei`);
      continue;
    }

    const existente = await db.select().from(horariosTable)
      .where(and(
        eq(horariosTable.escolaId, ESCOLA_ID),
        eq(horariosTable.turmaId, turma.id),
        eq(horariosTable.disciplinaId, discHibrida.id),
      ));
    if (existente.length > 0) {
      console.log(`⏭️  ${item.turma}: já tem uma aula de "${discHibrida.nome}" gravada — pulei`);
      continue;
    }

    await db.insert(horariosTable).values({
      escolaId: ESCOLA_ID,
      turmaId: turma.id,
      disciplinaId: discHibrida.id,
      professorId: professorHibrida.id,
      diaSemana: item.diaSemana,
      numeroAula: item.numeroAula,
      versaoGrade: "oficial",
    });
    criadas++;
    console.log(`✅ ${item.turma}: aula gravada (dia ${item.diaSemana}, aula ${item.numeroAula})`);
  }

  console.log(`\n🎉 ${criadas} aula(s) de "Híbrida" gravada(s).`);
  await pool.end();
}

main().catch((err) => {
  console.error("❌ Erro:", err);
  process.exit(1);
});
