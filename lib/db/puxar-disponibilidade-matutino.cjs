// So LEITURA -- puxa a disponibilidade/bloqueios atuais do matutino do
// banco pra escola Mario Braga, agrupado por professor. Serve de base pra
// comparar depois com o PDF novo do Urania (31/08 a 04/09).

const { Client } = require("pg");
const fs = require("fs");
const path = require("path");
const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";

function lerDatabaseUrl() {
  const envText = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
  const linha = envText.split("\n").find(l => l.trim().startsWith("DATABASE_URL="));
  if (!linha) throw new Error("DATABASE_URL nao encontrada no .env");
  return linha.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
}

async function main() {
  const client = new Client({ connectionString: lerDatabaseUrl() });
  await client.connect();

  const professores = (await client.query(
    `SELECT id, nome FROM professores WHERE escola_id = $1 ORDER BY nome`, [ESCOLA_ID]
  )).rows;

  const bloqueios = (await client.query(`
    SELECT dp.professor_id, dp.dia_semana, dp.horario_slot
    FROM disponibilidade_professores dp
    JOIN professores p ON p.id = dp.professor_id
    WHERE p.escola_id = $1 AND dp.turno = 'matutino' AND dp.disponivel = false
    ORDER BY dp.professor_id, dp.dia_semana, dp.horario_slot
  `, [ESCOLA_ID])).rows;

  const nomeMap = new Map(professores.map(p => [p.id, p.nome]));
  const porProf = new Map();
  for (const b of bloqueios) {
    if (!porProf.has(b.professor_id)) porProf.set(b.professor_id, []);
    porProf.get(b.professor_id).push(`${b.dia_semana}-${b.horario_slot}`);
  }

  console.log(`Total de professores na escola: ${professores.length}`);
  console.log(`Total de professores com algum bloqueio no matutino (banco): ${porProf.size}`);
  console.log(`Total de bloqueios (linhas) no matutino: ${bloqueios.length}`);
  console.log("\n=== BLOQUEIOS POR PROFESSOR (banco, matutino) ===\n");

  for (const [profId, slots] of porProf) {
    console.log(`${nomeMap.get(profId)}: ${slots.join(", ")}`);
  }

  console.log("\n=== PROFESSORES SEM NENHUM BLOQUEIO REGISTRADO NO MATUTINO ===\n");
  for (const p of professores) {
    if (!porProf.has(p.id)) console.log(`  ${p.nome}`);
  }

  await client.end();
}
main().catch(err => { console.error(err); process.exit(1); });
