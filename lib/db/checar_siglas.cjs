const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const envPath = ".env";
const conteudo = fs.readFileSync(envPath, "utf8");
const linha = conteudo.split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
const url = linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");

const client = new Client({ connectionString: url });
client.connect().then(async () => {
  const r = await client.query(
    `SELECT nome, sigla FROM disciplinas WHERE escola_id = 'org_3HCMsuYeAwkggR1dxXNzEdzNaX8' AND nome IN ('Liderança Organizacional e Gestão de Pessoas', 'Análise e Met P Sistemas', 'Banco de Dados I')`
  );
  console.log(JSON.stringify(r.rows, null, 2));
  await client.end();
});

