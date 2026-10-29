const fs = require("fs");
const { Client } = require("pg");
const linha = fs.readFileSync(".env", "utf8").split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
const url = linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
(async () => {
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const r = await c.query("SELECT e.nome_fantasia, cf.valor FROM configuracoes cf JOIN escolas e ON e.id = cf.escola_id WHERE cf.chave = 'arquivo_rco_exportacao' ORDER BY e.nome_fantasia");
  for (const x of r.rows) console.log(`${x.nome_fantasia} | ${x.valor.nomeArquivo} | ${x.valor.enviadoEm} | ${x.valor.enviadoPor}`);
  if (!r.rows.length) console.log("Nenhum envio registrado.");
  await c.end();
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
