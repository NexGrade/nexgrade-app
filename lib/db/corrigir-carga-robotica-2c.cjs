// Corrige o override de carga da "Robótica" na turma 2C (matutino,
// Arlinda). O vínculo já existe com o professor certo (Cinthia), mas
// sem carga_horaria_semanal_override definido -- e como Robótica não
// é item da matriz curricular oficial (487), o sistema não tinha de
// onde puxar a carga, resultando em 0h em vez de 2h.
// Confirmado no PDF oficial: Cinthia dá "2C/ROBÓT" 2x (07:30, 08:20) = 2h.
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
const ESCOLA_ARLINDA = "org_3HCLFry0r48pfutN7ChZIip3IWL";
const TURMA_2C_ID = 436;
const CARGA_CORRETA = 2;

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  console.log(APLICAR ? "🔴 MODO APLICAR — as mudanças serão commitadas.\n" : "🟡 MODO DRY-RUN — nada será salvo (ROLLBACK ao final).\n");

  try {
    await client.query("BEGIN");

    const disciplinaRes = await client.query(
      `SELECT id FROM disciplinas WHERE escola_id = $1 AND nome = 'Robótica' LIMIT 1`,
      [ESCOLA_ARLINDA]
    );
    const disciplinaId = disciplinaRes.rows[0]?.id;
    if (!disciplinaId) {
      console.log(`❌ Disciplina "Robótica" não encontrada`);
      await client.query("ROLLBACK");
      return;
    }

    const vinculoRes = await client.query(
      `SELECT id, carga_horaria_semanal_override FROM turma_disciplinas WHERE turma_id = $1 AND disciplina_id = $2`,
      [TURMA_2C_ID, disciplinaId]
    );
    if (vinculoRes.rows.length === 0) {
      console.log(`❌ Vínculo 2C/Robótica não encontrado`);
      await client.query("ROLLBACK");
      return;
    }
    if (vinculoRes.rows[0].carga_horaria_semanal_override !== null) {
      console.log(`⚠ 2C/Robótica já tem override=${vinculoRes.rows[0].carga_horaria_semanal_override}h, esperava NULL — abortando`);
      await client.query("ROLLBACK");
      return;
    }

    await client.query(
      `UPDATE turma_disciplinas SET carga_horaria_semanal_override = $1 WHERE id = $2`,
      [CARGA_CORRETA, vinculoRes.rows[0].id]
    );
    console.log(`✅ 2C / Robótica → carga_horaria_semanal_override definido para ${CARGA_CORRETA}h`);

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
