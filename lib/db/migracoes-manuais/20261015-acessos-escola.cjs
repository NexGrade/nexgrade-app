// Migracao manual (15/10/2026): [ACESSOS-ESCOLA]
//  - tabela nova acessos_escola: quem acessa cada escola e com qual cargo
//    (direcao, coordenacao, secretaria, reservas). Professor nao entra aqui.
//  - indices: (escola_id, email) unico, email, user_id.
// So CRIA a tabela -- nada existente e apagado nem alterado. Pode rodar mais de uma vez.
// Uso (na pasta lib\db):  node migracoes-manuais\20261015-acessos-escola.cjs            (dry-run)
//                         node migracoes-manuais\20261015-acessos-escola.cjs --aplicar  (aplica)
const fs = require("fs");
const { Client } = require("pg");
const APLICAR = process.argv.includes("--aplicar");
function lerDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const m = fs.readFileSync(".env", "utf8").match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m);
  if (!m) throw new Error("DATABASE_URL nao definido (nem no ambiente nem no .env desta pasta)");
  return m[1];
}
const SQL = [
  `CREATE TABLE IF NOT EXISTS "acessos_escola" (
    "id" serial PRIMARY KEY,
    "escola_id" text NOT NULL,
    "email" text NOT NULL,
    "nome" text,
    "cargo" text NOT NULL CHECK ("cargo" IN ('direcao','coordenacao','secretaria','reservas')),
    "user_id" text,
    "ativo" boolean NOT NULL DEFAULT true,
    "criado_por" text,
    "criado_em" timestamptz NOT NULL DEFAULT now(),
    "atualizado_em" timestamptz NOT NULL DEFAULT now(),
    "ultimo_acesso_em" timestamptz,
    CONSTRAINT "acessos_escola_email_minusculo" CHECK ("email" = lower(trim("email")))
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "acessos_escola_escola_email_uq" ON "acessos_escola" ("escola_id","email")`,
  `CREATE INDEX IF NOT EXISTS "acessos_escola_email_idx" ON "acessos_escola" ("email")`,
  `CREATE INDEX IF NOT EXISTS "acessos_escola_user_idx" ON "acessos_escola" ("user_id")`,
];
async function estado(c) {
  const t = (await c.query("select 1 from information_schema.tables where table_schema='public' and table_name='acessos_escola'")).rowCount > 0;
  const idx = (await c.query("select indexname from pg_indexes where schemaname='public' and tablename='acessos_escola'")).rows.map((r) => r.indexname);
  return { t, idx };
}
(async () => {
  const c = new Client({ connectionString: lerDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  let e = await estado(c);
  console.log(`${e.t ? "JA EXISTE" : "A CRIAR  "} | tabela acessos_escola`);
  for (const n of ["acessos_escola_escola_email_uq", "acessos_escola_email_idx", "acessos_escola_user_idx"])
    console.log(`${e.idx.includes(n) ? "JA EXISTE" : "A CRIAR  "} | indice ${n}`);
  const escolas = await c.query("select id, nome_fantasia from escolas order by nome_fantasia");
  console.log(`\nEscolas no banco: ${escolas.rowCount}`);
  for (const r of escolas.rows) console.log(`  ${r.id}  ${r.nome_fantasia}`);
  if (!APLICAR) { console.log("\nDRY-RUN: nada foi alterado. Rode com --aplicar."); await c.end(); return; }
  await c.query("BEGIN");
  try {
    for (const s of SQL) await c.query(s);
    await c.query("COMMIT");
  } catch (err) { await c.query("ROLLBACK"); throw err; }
  e = await estado(c);
  console.log(`\n${e.t ? "OK      " : "FALTANDO"} | tabela acessos_escola (${e.idx.length} indices)`);
  await c.end();
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
