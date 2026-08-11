// Corrige 3 vínculos com professor_id NULL em 7A/7B (vespertino,
// Arlinda), confirmados contra a grade oficial (PDF Urânia - TARDE):
//   - 7A / Ensino Religioso (1h): NULL -> Alex S G
//   - 7B / Ensino Religioso (1h): NULL -> Alex S G
//   - 7B / Língua Portuguesa (3h): NULL -> Adalgisa O F G
//
// DRY-RUN por padrão. Só aplica com --aplicar.
//
// Uso:
//   node lib/db/corrigir-null-7ab-vespertino.cjs             (dry-run)
//   node lib/db/corrigir-null-7ab-vespertino.cjs --aplicar   (aplica)

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

// vinculo_id já conhecido do diagnóstico anterior — mais seguro que
// buscar por turma+disciplina de novo.
const CORRECOES = [
  { vinculoId: 5146, descricao: "7A / Ensino Religioso", professorNome: "Alex S G" },
  { vinculoId: 5156, descricao: "7B / Ensino Religioso", professorNome: "Alex S G" },
  { vinculoId: 5160, descricao: "7B / Língua Portuguesa", professorNome: "Adalgisa O F G" },
];

const ESCOLA_ARLINDA = "org_3HCLFry0r48pfutN7ChZIip3IWL";

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  console.log(APLICAR ? "🔴 MODO APLICAR — as mudanças serão commitadas.\n" : "🟡 MODO DRY-RUN — nada será salvo (ROLLBACK ao final).\n");

  try {
    await client.query("BEGIN");

    for (const c of CORRECOES) {
      const professorRes = await client.query(
        `SELECT id FROM professores WHERE escola_id = $1 AND nome = $2 LIMIT 1`,
        [ESCOLA_ARLINDA, c.professorNome]
      );
      const professorId = professorRes.rows[0]?.id;
      if (!professorId) {
        console.log(`❌ Professor não encontrado: "${c.professorNome}" — pulando ${c.descricao}`);
        continue;
      }

      const vinculoRes = await client.query(`SELECT id, professor_id FROM turma_disciplinas WHERE id = $1`, [c.vinculoId]);
      if (vinculoRes.rows.length === 0) {
        console.log(`❌ vinculo_id=${c.vinculoId} não encontrado — pulando ${c.descricao}`);
        continue;
      }
      if (vinculoRes.rows[0].professor_id !== null) {
        console.log(`⚠ ${c.descricao} (vinculo_id=${c.vinculoId}) já tem professor_id=${vinculoRes.rows[0].professor_id}, esperava NULL — pulando por segurança`);
        continue;
      }

      await client.query(`UPDATE turma_disciplinas SET professor_id = $1 WHERE id = $2`, [professorId, c.vinculoId]);
      console.log(`✅ ${c.descricao} → professor_id definido para "${c.professorNome}" (id=${professorId})`);
    }

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
