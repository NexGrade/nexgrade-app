// Auditoria COMPLETA (somente leitura) da Arlinda, todos os turnos.
// Serve tanto pra "blindar" a Arlinda antes de gerar o matutino quanto
// como template reutilizável pro Mário Braga depois.
//
// Verifica, por turma:
//   1. Vínculos com professor_id NULL
//   2. Disciplinas na matriz curricular sem vínculo criado na turma
//   3. Vínculos fantasma (override sem itens_matriz correspondente)
//   4. Carga total cadastrada vs capacidade esperada
//      (25h Fundamental / 30h Médio-Técnico, com base em nivel_ensino)
//
// Uso: node lib/db/auditoria-completa-arlinda.cjs

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const envPath = path.join(__dirname, ".env");
const envContent = fs.readFileSync(envPath, "utf-8");
const match = envContent.match(/DATABASE_URL=(.+)/);
if (!match) {
  console.error("DATABASE_URL não encontrada no .env");
  process.exit(1);
}
const DATABASE_URL = match[1].trim();

const ESCOLA_ARLINDA = "org_3HCLFry0r48pfutN7ChZIip3IWL";

function capacidadeEsperada(nivelEnsino) {
  // fundamental = 5 aulas/dia x 5 dias = 25h
  // medio/tecnico = 6 aulas/dia x 5 dias = 30h
  if (nivelEnsino === "fundamental") return 25;
  return 30; // medio, tecnico, ou qualquer outro valor tratado como 6 aulas/dia
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  const problemas = {
    professorNulo: 0,
    disciplinaFaltando: 0,
    fantasma: 0,
    cargaErrada: 0,
  };

  try {
    const turmasRes = await client.query(
      `SELECT id, nome, turno, nivel_ensino, matriz_curricular_id
       FROM turmas
       WHERE escola_id = $1
       ORDER BY turno, nome`,
      [ESCOLA_ARLINDA]
    );

    console.log(`Auditando ${turmasRes.rows.length} turmas da Arlinda...\n`);

    let turnoAtual = null;
    for (const turma of turmasRes.rows) {
      if (turma.turno !== turnoAtual) {
        turnoAtual = turma.turno;
        console.log(`\n########## TURNO: ${turnoAtual.toUpperCase()} ##########`);
      }

      const linhasProblema = [];

      // 1. professor_id NULL
      const nulosRes = await client.query(
        `SELECT d.nome, COALESCE(td.carga_horaria_semanal_override, im.carga_horaria_semanal, 0) AS carga
         FROM turma_disciplinas td
         LEFT JOIN disciplinas d ON d.id = td.disciplina_id
         LEFT JOIN itens_matriz im ON im.disciplina_id = td.disciplina_id AND im.matriz_curricular_id = $2
         WHERE td.turma_id = $1 AND td.professor_id IS NULL`,
        [turma.id, turma.matriz_curricular_id]
      );
      for (const r of nulosRes.rows) {
        linhasProblema.push(`  ❌ SEM PROFESSOR: ${r.nome} (${r.carga}h)`);
        problemas.professorNulo++;
      }

      // 2. Disciplina na matriz sem vínculo
      const faltantesRes = await client.query(
        `SELECT d.nome, im.carga_horaria_semanal
         FROM itens_matriz im
         JOIN disciplinas d ON d.id = im.disciplina_id
         WHERE im.matriz_curricular_id = $1
           AND NOT EXISTS (
             SELECT 1 FROM turma_disciplinas td
             WHERE td.turma_id = $2 AND td.disciplina_id = im.disciplina_id
           )`,
        [turma.matriz_curricular_id, turma.id]
      );
      for (const r of faltantesRes.rows) {
        linhasProblema.push(`  ❌ DISCIPLINA FALTANDO (na matriz, sem vínculo): ${r.nome} (${r.carga_horaria_semanal}h)`);
        problemas.disciplinaFaltando++;
      }

      // 3. Vínculo fantasma (override sem itens_matriz)
      const fantasmaRes = await client.query(
        `SELECT d.nome, td.carga_horaria_semanal_override AS override
         FROM turma_disciplinas td
         LEFT JOIN disciplinas d ON d.id = td.disciplina_id
         LEFT JOIN itens_matriz im ON im.disciplina_id = td.disciplina_id AND im.matriz_curricular_id = $2
         WHERE td.turma_id = $1
           AND td.carga_horaria_semanal_override IS NOT NULL
           AND im.id IS NULL`,
        [turma.id, turma.matriz_curricular_id]
      );
      for (const r of fantasmaRes.rows) {
        linhasProblema.push(`  ⚠ VÍNCULO FANTASMA: ${r.nome} (override=${r.override}h, sem itens_matriz)`);
        problemas.fantasma++;
      }

      // 4. Carga total vs capacidade esperada
      const totalRes = await client.query(
        `SELECT COALESCE(SUM(COALESCE(td.carga_horaria_semanal_override, im.carga_horaria_semanal, 0)), 0) AS total
         FROM turma_disciplinas td
         LEFT JOIN itens_matriz im ON im.disciplina_id = td.disciplina_id AND im.matriz_curricular_id = $2
         WHERE td.turma_id = $1`,
        [turma.id, turma.matriz_curricular_id]
      );
      const total = Number(totalRes.rows[0].total);
      const esperado = capacidadeEsperada(turma.nivel_ensino);
      if (total !== esperado) {
        linhasProblema.push(`  ❌ CARGA TOTAL: ${total}h (esperado ${esperado}h para nivelEnsino=${turma.nivel_ensino})`);
        problemas.cargaErrada++;
      }

      if (linhasProblema.length > 0) {
        console.log(`\n=== ${turma.nome} (id=${turma.id}, nivelEnsino=${turma.nivel_ensino}) ===`);
        for (const l of linhasProblema) console.log(l);
      }
    }

    console.log("\n\n========== RESUMO ==========");
    console.log(`Vínculos sem professor: ${problemas.professorNulo}`);
    console.log(`Disciplinas faltando (na matriz, sem vínculo): ${problemas.disciplinaFaltando}`);
    console.log(`Vínculos fantasma: ${problemas.fantasma}`);
    console.log(`Turmas com carga total incorreta: ${problemas.cargaErrada}`);
    const totalProblemas = Object.values(problemas).reduce((a, b) => a + b, 0);
    if (totalProblemas === 0) {
      console.log("\n✅ Nenhum problema encontrado. Escola blindada.");
    } else {
      console.log(`\n❌ Total de ${totalProblemas} problemas encontrados — revisar acima.`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Erro:", err);
  process.exit(1);
});
