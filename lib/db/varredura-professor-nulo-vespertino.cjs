// Varredura AMPLA (somente leitura) de todos os vínculos com
// professor_id NULL no turno vespertino inteiro da Arlinda, pra achar
// de uma vez todos os casos do bug "disciplina sem professor" antes
// de tentar gerar a grade de novo.
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
    const res = await client.query(
      `SELECT
         t.nome AS turma,
         t.turno,
         d.nome AS disciplina,
         COALESCE(td.carga_horaria_semanal_override, im.carga_horaria_semanal, 0) AS carga,
         td.id AS vinculo_id
       FROM turma_disciplinas td
       JOIN turmas t ON t.id = td.turma_id
       LEFT JOIN disciplinas d ON d.id = td.disciplina_id
       LEFT JOIN itens_matriz im ON im.disciplina_id = td.disciplina_id AND im.matriz_curricular_id = t.matriz_curricular_id
       WHERE t.escola_id = $1
         AND t.turno = 'vespertino'
         AND td.professor_id IS NULL
       ORDER BY t.nome, d.nome`,
      [ESCOLA_ARLINDA]
    );

    if (res.rows.length === 0) {
      console.log("✅ Nenhum vínculo com professor_id NULL encontrado no vespertino. Banco limpo.");
      return;
    }

    console.log(`❌ Encontrados ${res.rows.length} vínculos com professor_id NULL no vespertino:\n`);
    for (const r of res.rows) {
      console.log(`  vinculo_id=${r.vinculo_id} | ${r.turma.padEnd(6)} | ${(r.disciplina ?? "??").padEnd(30)} | ${r.carga}h`);
    }

    // Também soma por turma pra ver se alguma turma ficaria com carga
    // menor que o esperado por causa disso (mesmo raciocínio dos 6º anos)
    console.log("\n--- Resumo por turma ---");
    const porTurma = new Map();
    for (const r of res.rows) {
      porTurma.set(r.turma, (porTurma.get(r.turma) ?? 0) + Number(r.carga));
    }
    for (const [turma, totalNulo] of porTurma.entries()) {
      console.log(`  ${turma}: ${totalNulo}h em disciplinas sem professor`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Erro:", err);
  process.exit(1);
});
