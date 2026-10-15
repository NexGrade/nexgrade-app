// Migracao manual (14/10/2026): [CATALOGO-CODIGO-EXTERNO]
//  - disciplinas_catalogo.codigo_externo_rco (integer, opcional): Codigo Externo do RCO no
//    catalogo mestre, copiado para a escola nova junto com o SAE.
// So ACRESCENTA a coluna -- nada e apagado nem alterado.
// Uso (na pasta lib\db):  node migracoes-manuais\20261014-catalogo-codigo-externo.cjs            (dry-run)
//                         node migracoes-manuais\20261014-catalogo-codigo-externo.cjs --aplicar  (aplica)
const fs = require("fs");
const { Client } = require("pg");
const APLICAR = process.argv.includes("--aplicar");
function lerDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const m = fs.readFileSync(".env", "utf8").match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m);
  if (!m) throw new Error("DATABASE_URL nao definido (nem no ambiente nem no .env desta pasta)");
  return m[1];
}
async function existeCol(c) {
  return (await c.query("select 1 from information_schema.columns where table_schema='public' and table_name='disciplinas_catalogo' and column_name='codigo_externo_rco'")).rowCount > 0;
}
(async () => {
  const c = new Client({ connectionString: lerDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  const ja = await existeCol(c);
  console.log(`${ja ? "JA EXISTE" : "A CRIAR  "} | disciplinas_catalogo.codigo_externo_rco (integer)`);
  if (!APLICAR) { console.log("\nDRY-RUN: nada foi alterado. Rode com --aplicar."); await c.end(); return; }
  if (!ja) await c.query('ALTER TABLE "disciplinas_catalogo" ADD COLUMN IF NOT EXISTS "codigo_externo_rco" integer');
  console.log(`\n${(await existeCol(c)) ? "OK      " : "FALTANDO"} | disciplinas_catalogo.codigo_externo_rco`);
  await c.end();
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
