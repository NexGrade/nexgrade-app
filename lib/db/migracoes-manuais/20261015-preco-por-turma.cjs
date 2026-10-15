// Migracao manual (15/10/2026): [PRECO-POR-TURMA]
//  - planos.cobranca (text, padrao 'fixa') e planos.preco_por_turma_anual (integer, centavos);
//  - cria o plano "NexGrade Escola": R$ 30,00 por turma por ano, tudo incluido
//    (anual a vista ou 12x mensal; conta todas as turmas cadastradas; sem valor minimo);
//  - Pro e Master: desativados e escondidos (nenhuma escola paga por eles hoje; as que
//    estiverem neles continuam ligadas ao plano, so ele some da tela de planos);
//  - Gratuito: continua sendo o plano da avaliacao de 30 dias, mas sai da tela de planos.
// Nada e apagado. Pode rodar mais de uma vez.
// Uso (na pasta lib\db):  node migracoes-manuais\20261015-preco-por-turma.cjs            (dry-run)
//                         node migracoes-manuais\20261015-preco-por-turma.cjs --aplicar  (aplica)
const fs = require("fs");
const { Client } = require("pg");
const APLICAR = process.argv.includes("--aplicar");
const PLANO = "NexGrade Escola";
const PRECO_TURMA_CENTAVOS = 3000;
function lerDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const m = fs.readFileSync(".env", "utf8").match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m);
  if (!m) throw new Error("DATABASE_URL nao definido (nem no ambiente nem no .env desta pasta)");
  return m[1];
}
async function temCol(c, col) {
  return (await c.query("select 1 from information_schema.columns where table_schema='public' and table_name='planos' and column_name=$1", [col])).rowCount > 0;
}
(async () => {
  const c = new Client({ connectionString: lerDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  const colCobranca = await temCol(c, "cobranca");
  const colPreco = await temCol(c, "preco_por_turma_anual");
  console.log(`${colCobranca ? "JA EXISTE" : "A CRIAR  "} | planos.cobranca`);
  console.log(`${colPreco ? "JA EXISTE" : "A CRIAR  "} | planos.preco_por_turma_anual`);

  const planos = (await c.query("select id, nome, preco_mensal, preco_anual, ativo, visivel_publicamente from planos order by id")).rows;
  console.log("\nPlanos hoje:");
  for (const p of planos) {
    const usam = (await c.query("select nome_fantasia from escolas where plano_id=$1 order by 1", [p.id])).rows.map((r) => r.nome_fantasia);
    console.log(`  #${p.id} ${p.nome.padEnd(16)} mensal ${p.preco_mensal} anual ${p.preco_anual ?? "-"} | ativo ${p.ativo} visivel ${p.visivel_publicamente} | escolas: ${usam.length ? usam.join(", ") : "nenhuma"}`);
  }
  const jaTem = planos.find((p) => p.nome === PLANO);
  console.log(`\n${jaTem ? "JA EXISTE" : "A CRIAR  "} | plano "${PLANO}" (R$ 30,00 por turma por ano, tudo incluido)`);
  for (const n of ["Pro", "Master"]) if (planos.find((p) => p.nome === n && (p.ativo || p.visivel_publicamente))) console.log(`DESATIVAR | plano "${n}" (sai da tela de planos)`);
  if (planos.find((p) => p.nome === "Gratuito" && p.visivel_publicamente)) console.log(`ESCONDER  | plano "Gratuito" (continua sendo o da avaliacao de 30 dias)`);

  if (!APLICAR) { console.log("\nDRY-RUN: nada foi alterado. Rode com --aplicar."); await c.end(); return; }
  await c.query("BEGIN");
  try {
    await c.query(`ALTER TABLE "planos" ADD COLUMN IF NOT EXISTS "cobranca" text NOT NULL DEFAULT 'fixa'`);
    await c.query(`ALTER TABLE "planos" ADD COLUMN IF NOT EXISTS "preco_por_turma_anual" integer`);
    if (!jaTem) {
      await c.query(
        `insert into planos (nome, preco_mensal, preco_anual, max_professores, max_turmas, tem_ia, tem_export, tem_import, ativo, visivel_publicamente, cobranca, preco_por_turma_anual)
         values ($1, 0, null, 9999, 9999, true, true, true, true, true, 'por_turma', $2)`,
        [PLANO, PRECO_TURMA_CENTAVOS],
      );
    }
    await c.query(`update planos set ativo=false, visivel_publicamente=false where nome in ('Pro','Master')`);
    await c.query(`update planos set visivel_publicamente=false where nome='Gratuito'`);
    await c.query("COMMIT");
  } catch (err) { await c.query("ROLLBACK"); throw err; }
  const depois = (await c.query("select id, nome, cobranca, preco_por_turma_anual, ativo, visivel_publicamente from planos order by id")).rows;
  console.log("\nPlanos depois:");
  for (const p of depois) console.log(`  #${p.id} ${p.nome.padEnd(16)} cobranca ${p.cobranca} por turma ${p.preco_por_turma_anual ?? "-"} | ativo ${p.ativo} visivel ${p.visivel_publicamente}`);
  await c.end();
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
