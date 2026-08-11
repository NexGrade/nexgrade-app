// Corrige o último vínculo NULL encontrado na varredura ampla do
// vespertino: 7D / Redação e Leitura (2h), confirmado no PDF oficial
// (Sharon C S, sexta-feira 15:35 e 16:35).
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
const VINCULO_ID = 5182;
const PROFESSOR_NOME = "Sharon C S";
const ESCOLA_ARLINDA = "org_3HCLFry0r48pfutN7ChZIip3IWL";

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  console.log(APLICAR ? "🔴 MODO APLICAR — as mudanças serão commitadas.\n" : "🟡 MODO DRY-RUN — nada será salvo (ROLLBACK ao final).\n");

  try {
    await client.query("BEGIN");

    const professorRes = await client.query(
      `SELECT id FROM professores WHERE escola_id = $1 AND nome = $2 LIMIT 1`,
      [ESCOLA_ARLINDA, PROFESSOR_NOME]
    );
    const professorId = professorRes.rows[0]?.id;
    if (!professorId) {
      console.log(`❌ Professor não encontrado: "${PROFESSOR_NOME}"`);
      await client.query("ROLLBACK");
      return;
    }

    const vinculoRes = await client.query(`SELECT id, professor_id FROM turma_disciplinas WHERE id = $1`, [VINCULO_ID]);
    if (vinculoRes.rows.length === 0) {
      console.log(`❌ vinculo_id=${VINCULO_ID} não encontrado`);
      await client.query("ROLLBACK");
      return;
    }
    if (vinculoRes.rows[0].professor_id !== null) {
      console.log(`⚠ vinculo_id=${VINCULO_ID} já tem professor_id=${vinculoRes.rows[0].professor_id}, esperava NULL — abortando`);
      await client.query("ROLLBACK");
      return;
    }

    await client.query(`UPDATE turma_disciplinas SET professor_id = $1 WHERE id = $2`, [professorId, VINCULO_ID]);
    console.log(`✅ 7D / Redação e Leitura → professor_id definido para "${PROFESSOR_NOME}" (id=${professorId})`);

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
