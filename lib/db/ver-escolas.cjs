const fs = require("fs");
const { Client } = require("pg");
const linha = fs.readFileSync(".env", "utf8").split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
const url = linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
(async () => {
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const r = await c.query("SELECT id, nome_fantasia, cnpj, codigo_inep, cidade FROM escolas ORDER BY nome_fantasia");
  console.table(r.rows);
  await c.end();
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
