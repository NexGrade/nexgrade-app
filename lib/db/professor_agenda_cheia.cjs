const { Client } = require("pg");
const fs = require("fs");

const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";

const conteudo = fs.readFileSync(".env", "utf8");
const linha = conteudo.split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
const url = linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");

async function main() {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const r = await client.query(
      `SELECT p.nome, p.email, COUNT(h.id) as total_aulas,
              (SELECT COUNT(*) FROM reservas res WHERE res.professor_id = p.id AND res.status != 'cancelada') as total_reservas
       FROM professores p
       JOIN horarios h ON h.professor_id = p.id
       WHERE p.escola_id = $1
       GROUP BY p.id, p.nome, p.email
       ORDER BY total_aulas DESC
       LIMIT 10`,
      [ESCOLA_ID],
    );
    console.log("Top 10 professores com mais aulas cadastradas:");
    console.log(JSON.stringify(r.rows, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("ERRO:", err.message);
  process.exit(1);
});
