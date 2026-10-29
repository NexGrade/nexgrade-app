const fs = require("fs");
const { Client } = require("pg");
const linha = fs.readFileSync(".env", "utf8").split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
const url = linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
const escola = process.argv[2] || "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";
(async () => {
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const r = await c.query(
    "SELECT chave, valor FROM configuracoes WHERE escola_id = $1 AND chave IN ('arquivo_rco_exportacao', 'arquivo_rco_conteudo')",
    [escola]);
  for (const x of r.rows) {
    if (x.chave === "arquivo_rco_conteudo") console.log("INICIO DO ARQUIVO:\n" + String(x.valor.xml).slice(0, 400));
    else console.log("ENVIO:", JSON.stringify({ nome: x.valor.nomeArquivo, em: x.valor.enviadoEm, por: x.valor.enviadoPor }, null, 1));
  }
  await c.end();
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
