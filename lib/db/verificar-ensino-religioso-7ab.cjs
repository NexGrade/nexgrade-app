const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const envPath = path.join(__dirname, ".env");
const envContent = fs.readFileSync(envPath, "utf-8");
const match = envContent.match(/DATABASE_URL=(.+)/);
const DATABASE_URL = match[1].trim();

const ESCOLA_ARLINDA = "org_3HCLFry0r48pfutN7ChZIip3IWL";

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const turmasRes = await client.query(
      `SELECT id, nome, turno, matriz_curricular_id
       FROM turmas
       WHERE escola_id = $1 AND nome IN ('7A','7B','7C','7D') AND turno = 'vespertino'
       ORDER BY nome`,
      [ESCOLA_ARLINDA]
    );

    for (const turma of turmasRes.rows) {
      console.log(`\n=== ${turma.nome} (id=${turma.id}, matrizId=${turma.matriz_curricular_id}) ===`);

      // Disciplinas na matriz mas sem vínculo na turma
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
      if (faltantesRes.rows.length > 0) {
        console.log(`  ❌ DISCIPLINAS NA MATRIZ MAS SEM VÍNCULO NA TURMA:`);
        for (const f of faltantesRes.rows) {
          console.log(`     - ${f.nome} (${f.carga_horaria_semanal}h)`);
        }
      } else {
        console.log(`  ✅ Nenhuma disciplina faltando`);
      }

      // Soma total cadastrado
      const totalRes = await client.query(
        `SELECT COALESCE(SUM(COALESCE(td.carga_horaria_semanal_override, im.carga_horaria_semanal, 0)), 0) AS total
         FROM turma_disciplinas td
         LEFT JOIN itens_matriz im ON im.disciplina_id = td.disciplina_id AND im.matriz_curricular_id = $2
         WHERE td.turma_id = $1`,
        [turma.id, turma.matriz_curricular_id]
      );
      console.log(`  TOTAL CADASTRADO: ${totalRes.rows[0].total}h`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Erro:", err);
  process.exit(1);
});
