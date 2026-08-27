const { Client } = require("pg");
const fs = require("fs");
const path = require("path");
const envPath = ".env";
const linha = fs.readFileSync(envPath, "utf8").split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
const url = linha.slice(linha.indexOf("=") + 1).trim().replace(/^["\x27]|["\x27]$/g, "");
const client = new Client({ connectionString: url });
client.connect().then(async () => {
  const r = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name=$1", ["disponibilidade_professores"]);
  console.log(r.rows.map((x) => x.column_name).join(", "));
  await client.end();
});
