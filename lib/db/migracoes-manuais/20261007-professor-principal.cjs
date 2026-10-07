// Migracao manual (07/10/2026): [MESMA-PESSOA-HA]
//  - professores.professor_principal_id (integer, opcional): cadastro secundario da mesma
//    pessoa (ex.: "Jessica (IFA)" -> "Jessica"). A HA soma as aulas dos dois e fica no principal.
// So ACRESCENTA a coluna -- nada e apagado nem alterado. Nenhum professor fica ligado aqui.
// Uso (na pasta lib\db):  node migracoes-manuais\20261007-professor-principal.cjs            (dry-run)
//                         node migracoes-manuais\20261007-professor-principal.cjs --aplicar  (aplica)
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
  return (await c.query("select 1 from information_schema.columns where table_schema='public' and table_name='professores' and column_name='professor_principal_id'")).rowCount > 0;
}
(async () => {
  const c = new Client({ connectionString: lerDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  const ja = await existeCol(c);
  console.log(`${ja ? "JA EXISTE" : "A CRIAR  "} | professores.professor_principal_id (integer)`);
  if (!APLICAR) { console.log("\nDRY-RUN: nada foi alterado. Rode com --aplicar."); await c.end(); return; }
  if (!ja) await c.query('ALTER TABLE "professores" ADD COLUMN IF NOT EXISTS "professor_principal_id" integer');
  console.log(`\n${(await existeCol(c)) ? "OK      " : "FALTANDO"} | professores.professor_principal_id`);
  await c.end();
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
