const { Client } = require("pg");
const fs = require("fs");

const conteudo = fs.readFileSync(".env", "utf8");
const linha = conteudo.split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
const url = linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");

const client = new Client({ connectionString: url });
client.connect().then(async () => {
  const r = await client.query(
    `SELECT COUNT(*) FILTER (WHERE sigla IS NOT NULL AND sigla != '') as com_sigla, COUNT(*) FILTER (WHERE sigla IS NULL OR sigla = '') as sem_sigla FROM disciplinas WHERE escola_id = 'org_3HCMsuYeAwkggR1dxXNzEdzNaX8'`
  );
  console.log(JSON.stringify(r.rows, null, 2));
  await client.end();
});
