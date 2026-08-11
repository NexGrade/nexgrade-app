// Reconstrói o currículo completo da turma 6TA (vespertino, Mário
// Braga), que estava com só 1h cadastrada (Ensino Religioso, sem
// professor). Confirmado item a item contra a grade oficial (PDF
// Urânia -- "Turma: 6TA", visão por turma). matriz_curricular_id da
// 6TA é NULL, então a carga é definida via override explícito em cada
// vínculo, sem depender de itens_matriz.
//
// Duas disciplinas são co-docência (dois professores no mesmo
// horário, confirmado no PDF): LRPORT (Cecília + Ivanir) e R MAT
// (Andre + Pedro) -- usam professor_apoio_id.
//
// DRY-RUN por padrão. Só aplica com --aplicar.

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

const APLICAR = process.argv.includes("--aplicar");
const TURMA_6TA_ID = 395;

// [disciplinaId, professorId, professorApoioId | null, cargaHoras]
const NOVOS_VINCULOS = [
  { disciplinaId: 1624, professorId: 664, professorApoioId: null, carga: 2, nome: "Arte / Priscila" },
  { disciplinaId: 1678, professorId: 605, professorApoioId: 638, carga: 2, nome: "Leitura e Recomposição da Aprendizagem - Língua Portuguesa / Cecília + Ivanir" },
  { disciplinaId: 1646, professorId: 622, professorApoioId: null, carga: 2, nome: "Educação Física / Elisangela" },
  { disciplinaId: 1663, professorId: 666, professorApoioId: null, carga: 2, nome: "Geografia / Ricardo" },
  { disciplinaId: 1687, professorId: 668, professorApoioId: null, carga: 4, nome: "Matemática / Robson" },
  { disciplinaId: 2475, professorId: 653, professorApoioId: null, carga: 2, nome: "Língua Inglesa / Marise" },
  { disciplinaId: 2474, professorId: 665, professorApoioId: null, carga: 4, nome: "Língua Portuguesa / Rafael" },
  { disciplinaId: 1670, professorId: 611, professorApoioId: null, carga: 2, nome: "História / Daiane" },
  { disciplinaId: 1634, professorId: 672, professorApoioId: null, carga: 2, nome: "Ciências (Fundamental) / Silmara" },
  { disciplinaId: 1704, professorId: 600, professorApoioId: 663, carga: 2, nome: "Recomposição da Aprendizagem - Matemática / Andre + Pedro" },
];

const VINCULO_ENSINO_RELIGIOSO_ID = 5293;
const PROFESSOR_MARCIO_ID = 651;

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  console.log(APLICAR ? "🔴 MODO APLICAR — as mudanças serão commitadas.\n" : "🟡 MODO DRY-RUN — nada será salvo (ROLLBACK ao final).\n");

  try {
    await client.query("BEGIN");

    let cargaTotal = 0;

    for (const v of NOVOS_VINCULOS) {
      // Segurança: confirma que ainda não existe vínculo dessa disciplina na 6TA
      const existente = await client.query(
        `SELECT id FROM turma_disciplinas WHERE turma_id = $1 AND disciplina_id = $2`,
        [TURMA_6TA_ID, v.disciplinaId]
      );
      if (existente.rows.length > 0) {
        console.log(`⚠ Já existe vínculo para disciplina_id=${v.disciplinaId} na 6TA (id=${existente.rows[0].id}) -- pulando por segurança`);
        continue;
      }

      await client.query(
        `INSERT INTO turma_disciplinas (turma_id, disciplina_id, professor_id, professor_apoio_id, carga_horaria_semanal_override)
         VALUES ($1, $2, $3, $4, $5)`,
        [TURMA_6TA_ID, v.disciplinaId, v.professorId, v.professorApoioId, v.carga]
      );
      cargaTotal += v.carga;
      console.log(`✅ Criado: ${v.nome} (${v.carga}h)`);
    }

    // Atualiza o vínculo existente de Ensino Religioso
    const vinculoErRes = await client.query(
      `SELECT id, professor_id, carga_horaria_semanal_override FROM turma_disciplinas WHERE id = $1`,
      [VINCULO_ENSINO_RELIGIOSO_ID]
    );
    if (vinculoErRes.rows.length === 0) {
      console.log(`❌ Vínculo de Ensino Religioso (id=${VINCULO_ENSINO_RELIGIOSO_ID}) não encontrado`);
    } else if (vinculoErRes.rows[0].professor_id !== null) {
      console.log(`⚠ Ensino Religioso já tem professor_id=${vinculoErRes.rows[0].professor_id} -- pulando por segurança`);
      cargaTotal += Number(vinculoErRes.rows[0].carga_horaria_semanal_override ?? 0);
    } else {
      await client.query(`UPDATE turma_disciplinas SET professor_id = $1 WHERE id = $2`, [PROFESSOR_MARCIO_ID, VINCULO_ENSINO_RELIGIOSO_ID]);
      cargaTotal += Number(vinculoErRes.rows[0].carga_horaria_semanal_override ?? 0);
      console.log(`✅ Atualizado: Ensino Religioso → professor_id=${PROFESSOR_MARCIO_ID} (Marcio)`);
    }

    console.log(`\nCarga total resultante: ${cargaTotal}h (esperado 25h)`);

    if (APLICAR) {
      await client.query("COMMIT");
      console.log("\n✅ COMMIT realizado — mudanças salvas.");
    } else {
      await client.query("ROLLBACK");
      console.log("\n🟡 ROLLBACK (dry-run) — nada foi salvo. Rode com --aplicar para confirmar.");
    }
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("\n❌ Erro — ROLLBACK forçado:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
