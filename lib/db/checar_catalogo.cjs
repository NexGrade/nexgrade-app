const { Client } = require("pg");
const fs = require("fs");

const conteudo = fs.readFileSync(".env", "utf8");
const linha = conteudo.split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
const url = linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");

const client = new Client({ connectionString: url });
client.connect().then(async () => {
  console.log("=== Colunas da tabela disciplinas ===");
  const cols = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'disciplinas'`
  );
  console.log(cols.rows.map((r) => r.column_name).join(", "));

  console.log("\n=== Colunas da tabela disciplinas_catalogo ===");
  const colsCat = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'disciplinas_catalogo'`
  );
  console.log(colsCat.rows.map((r) => r.column_name).join(", "));

  console.log("\n=== Catalogo mestre -- match por nome ===");
  const catalogo = await client.query(
    `SELECT nome, sigla FROM disciplinas_catalogo WHERE nome IN ('Liderança Organizacional e Gestão de Pessoas', 'Análise e Met P Sistemas', 'Banco de Dados I')`
  );
  console.log(JSON.stringify(catalogo.rows, null, 2));

  console.log("\n=== Quantas disciplinas da Mario Braga tem sigla preenchida? ===");
  const contagem = await client.query(
    `SELECT
       COUNT(*) FILTER (WHERE sigla IS NOT NULL AND sigla != '') as com_sigla,
       COUNT(*) FILTER (WHERE sigla IS NULL OR sigla = '') as sem_sigla
     FROM disciplinas WHERE escola_id = 'org_3HCMsuYeAwkggR1dxXNzEdzNaX8'`
  );
  console.log(JSON.stringify(contagem.rows, null, 2));

  await client.end();
});
