// Migracao manual (29/09/2026): coluna "ofertado" em cursos.
// Padrao TRUE: cursos que ja existem continuam aparecendo como hoje.
// Os cursos semeados do catalogo oficial entram com ofertado = false.
// Uso: node 20260929-cursos-ofertado.cjs            (so confere)
//      node 20260929-cursos-ofertado.cjs --executar (aplica)
const { Client } = require("pg");
(async () => {
  if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.startsWith("postgres")) throw new Error("DATABASE_URL nao definido");
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const existe = (await c.query("select 1 from information_schema.columns where table_name = 'cursos' and column_name = 'ofertado'")).rowCount > 0;
  console.log("coluna cursos.ofertado ja existe:", existe);
  if (!process.argv.includes("--executar")) { console.log("CONFERENCIA: nada alterado. Rode com --executar para aplicar."); await c.end(); return; }
  if (!existe) {
    await c.query("ALTER TABLE cursos ADD COLUMN ofertado boolean NOT NULL DEFAULT true");
    console.log("CRIADA: cursos.ofertado (boolean, padrao true)");
  } else console.log("nada a fazer");
  const r = await c.query("select ofertado, count(*)::int n from cursos group by 1");
  for (const x of r.rows) console.log("  ofertado=" + x.ofertado + ": " + x.n + " cursos");
  await c.end();
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
