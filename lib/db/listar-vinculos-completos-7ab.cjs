const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const envPath = path.join(__dirname, ".env");
const envContent = fs.readFileSync(envPath, "utf-8");
const match = envContent.match(/DATABASE_URL=(.+)/);
const DATABASE_URL = match[1].trim();

const ESCOLA_ARLINDA = "org_3HCLFry0r48pfutN7ChZIip3IWL";
const TURMAS = { "7A": 447, "7B": 448 };

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    for (const [nomeTurma, turmaId] of Object.entries(TURMAS)) {
      console.log(`\n=== ${nomeTurma} (id=${turmaId}) — TODOS os vínculos, incluindo possíveis excluídos do payload ===`);
      const res = await client.query(
        `SELECT
           td.id AS vinculo_id,
           d.nome AS disciplina,
           d.id AS disciplina_id,
           td.professor_id,
           p.nome AS professor_nome,
           p.ativo AS professor_ativo,
           td.carga_horaria_semanal_override AS override,
           im.carga_horaria_semanal AS carga_matriz
         FROM turma_disciplinas td
         LEFT JOIN disciplinas d ON d.id = td.disciplina_id
         LEFT JOIN professores p ON p.id = td.professor_id
         LEFT JOIN itens_matriz im ON im.disciplina_id = td.disciplina_id AND im.matriz_curricular_id = (
           SELECT matriz_curricular_id FROM turmas WHERE id = $1
         )
         WHERE td.turma_id = $1
         ORDER BY d.nome`,
        [turmaId]
      );
      for (const r of res.rows) {
        const carga = r.override ?? r.carga_matriz ?? 0;
        console.log(
          `  vinculo_id=${r.vinculo_id} | ${(r.disciplina ?? "??").padEnd(30)} | carga=${carga}h | professor=${r.professor_nome ?? "NULO"} (id=${r.professor_id}, ativo=${r.professor_ativo})`
        );
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Erro:", err);
  process.exit(1);
});
