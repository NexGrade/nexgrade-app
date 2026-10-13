// Somente leitura: lista as turmas do Romario Martins que ainda nao tem grade
// SEED em lib/db/dados-rco/grades-seed.json (chave = codigo SERE da turma).
// Uso: node lib/db/listar-turmas-sem-grade-seed.cjs   (precisa de DATABASE_URL)
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const ESCOLA_ID = "org_3JxLX0hl4xYxiHbrUIIabRHaAO9"; // C.E. Romario Martins
const seed = JSON.parse(fs.readFileSync(path.join(__dirname, "dados-rco", "grades-seed.json"), "utf8")).turmas;

const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(async () => {
    const { rows } = await client.query(
      "SELECT nome, turno, codigo_sere, codigo_sere_if FROM turmas WHERE escola_id = $1 ORDER BY turno, nome",
      [ESCOLA_ID]
    );
    const tem = (r) => (r.codigo_sere != null && seed[String(r.codigo_sere)]) || (r.codigo_sere_if != null && seed[String(r.codigo_sere_if)]);
    const sem = rows.filter((r) => !tem(r));
    console.log(`Turmas do Romario: ${rows.length} | com grade SEED: ${rows.length - sem.length} | sem grade SEED: ${sem.length}\n`);
    for (const r of sem) console.log(`${r.turno.padEnd(11)} ${r.nome.padEnd(14)} codigo_sere=${r.codigo_sere ?? "-"}  codigo_sere_if=${r.codigo_sere_if ?? "-"}`);
    return client.end();
  })
  .catch((err) => { console.error(err); return client.end(); });
