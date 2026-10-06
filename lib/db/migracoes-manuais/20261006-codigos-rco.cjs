// Migracao manual (06/10/2026): codigos do RCO.
//  - turmas.codigo_sere / turmas.codigo_sere_if (3o ano da matriz antiga tem 2 turmas no RCO: FGB e IF)
//  - tabela PADRAO codigos_rco_disciplina (codigo SAE -> Codigo Externo do RCO, vale para qualquer escola)
// So ACRESCENTA -- nada e apagado nem alterado.
// Uso:  node 20261006-codigos-rco.cjs            (dry-run)
//       node 20261006-codigos-rco.cjs --aplicar  (aplica, numa transacao)
const { Client } = require("pg");
const APLICAR = process.argv.includes("--aplicar");
const COLUNAS = [["turmas", "codigo_sere", "integer"], ["turmas", "codigo_sere_if", "integer"]];
const TABELA_SQL = `CREATE TABLE IF NOT EXISTS codigos_rco_disciplina (
  codigo_sae integer PRIMARY KEY,
  codigo_externo integer NOT NULL,
  nome_rco text,
  created_at timestamptz NOT NULL DEFAULT now()
)`;
async function existeCol(c, t, col) {
  return (await c.query("select 1 from information_schema.columns where table_schema='public' and table_name=$1 and column_name=$2", [t, col])).rowCount > 0;
}
async function existeTab(c, t) {
  return (await c.query("select 1 from information_schema.tables where table_schema='public' and table_name=$1", [t])).rowCount > 0;
}
(async () => {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL nao definido");
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const faltam = [];
  for (const [t, col, tipo] of COLUNAS) { const ja = await existeCol(c, t, col); console.log(`${ja ? "JA EXISTE" : "A CRIAR  "} | ${t}.${col} (${tipo})`); if (!ja) faltam.push([t, col, tipo]); }
  const tabJa = await existeTab(c, "codigos_rco_disciplina");
  console.log(`${tabJa ? "JA EXISTE" : "A CRIAR  "} | tabela codigos_rco_disciplina`);
  if (!APLICAR) { console.log(`\nDRY-RUN: nada foi alterado. Rode com --aplicar.`); await c.end(); return; }
  try {
    await c.query("BEGIN");
    for (const [t, col, tipo] of faltam) { await c.query(`ALTER TABLE "${t}" ADD COLUMN IF NOT EXISTS "${col}" ${tipo}`); console.log(`CRIADA   | ${t}.${col}`); }
    if (!tabJa) { await c.query(TABELA_SQL); console.log("CRIADA   | tabela codigos_rco_disciplina"); }
    await c.query("COMMIT");
  } catch (e) { await c.query("ROLLBACK"); console.error("ERRO -- nada foi alterado (rollback):", e.message); process.exit(1); }
  console.log("\n=== conferencia depois ===");
  for (const [t, col] of COLUNAS) console.log(`${(await existeCol(c, t, col)) ? "OK      " : "FALTANDO"} | ${t}.${col}`);
  console.log(`${(await existeTab(c, "codigos_rco_disciplina")) ? "OK      " : "FALTANDO"} | tabela codigos_rco_disciplina`);
  await c.end();
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
