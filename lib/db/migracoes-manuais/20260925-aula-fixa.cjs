// Migracao manual (25/09/2026): aula fixa (travada pelo coordenador).
// So ACRESCENTA colunas com valor padrao -- nada e apagado nem alterado.
// Uso:  node 20260925-aula-fixa.cjs            (dry-run: so mostra)
//       node 20260925-aula-fixa.cjs --aplicar  (aplica, numa transacao)
const { Client } = require("pg");
const APLICAR = process.argv.includes("--aplicar");
const COLUNAS = [
  ["horarios", "fixa", "boolean NOT NULL DEFAULT false"],
  ["horarios_experimentais", "fixa", "boolean NOT NULL DEFAULT false"],
];

async function existe(c, tabela, coluna) {
  const r = await c.query(
    "select 1 from information_schema.columns where table_schema = 'public' and table_name = $1 and column_name = $2",
    [tabela, coluna]);
  return r.rowCount > 0;
}

(async () => {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL nao definido");
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const faltam = [];
  for (const [t, col, tipo] of COLUNAS) {
    const ja = await existe(c, t, col);
    console.log(`${ja ? "JA EXISTE" : "A CRIAR  "} | ${t}.${col} (${tipo})`);
    if (!ja) faltam.push([t, col, tipo]);
  }
  if (!APLICAR) {
    console.log(`\nDRY-RUN: ${faltam.length} coluna(s) seriam criadas. Nada foi alterado. Rode com --aplicar para aplicar.`);
    await c.end(); return;
  }
  try {
    await c.query("BEGIN");
    for (const [t, col, tipo] of faltam) {
      await c.query(`ALTER TABLE "${t}" ADD COLUMN IF NOT EXISTS "${col}" ${tipo}`);
      console.log(`CRIADA   | ${t}.${col}`);
    }
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    console.error("ERRO -- nada foi alterado (rollback):", e.message);
    process.exit(1);
  }
  console.log("\n=== conferencia depois ===");
  for (const [t, col] of COLUNAS) console.log(`${(await existe(c, t, col)) ? "OK      " : "FALTANDO"} | ${t}.${col}`);
  await c.end();
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
