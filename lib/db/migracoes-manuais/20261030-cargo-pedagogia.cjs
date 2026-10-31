// Migracao manual (30/10/2026): [PEDAGOGIA] libera o cargo "pedagogia" na tabela acessos_escola.
//
// Por que: a tabela foi criada em 15/10 (20261015-acessos-escola.cjs) com uma trava CHECK que
// aceita so direcao, coordenacao, secretaria e reservas. O cargo Pedagogia (PR #76) entrou no
// codigo, mas a trava do banco continuou igual: cadastrar alguem como Pedagogia em Usuarios dava
// "Erro interno no servidor". A migracao de base do drizzle nao tem essa trava, por isso os
// testes nao pegaram.
//
// O que faz: troca a trava do cargo por outra com os 5 cargos da equipe. Nao mexe em nenhuma
// linha. Pode rodar mais de uma vez (se a trava ja aceitar pedagogia, nao faz nada).
// Uso (na pasta lib\db):  node migracoes-manuais\20261030-cargo-pedagogia.cjs            (dry-run)
//                         node migracoes-manuais\20261030-cargo-pedagogia.cjs --aplicar  (aplica)
// Para desfazer (so se nao houver ninguem com cargo pedagogia):
//   ALTER TABLE acessos_escola DROP CONSTRAINT acessos_escola_cargo_check;
//   ALTER TABLE acessos_escola ADD CONSTRAINT acessos_escola_cargo_check CHECK (cargo IN ('direcao','coordenacao','secretaria','reservas'));
const fs = require("fs");
const { Client } = require("pg");
const APLICAR = process.argv.includes("--aplicar");
function lerDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const m = fs.readFileSync(".env", "utf8").match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m);
  if (!m) throw new Error("DATABASE_URL nao definido (nem no ambiente nem no .env desta pasta)");
  return m[1];
}
const CARGOS = ["direcao", "coordenacao", "secretaria", "reservas", "pedagogia"];
const NOVA = "acessos_escola_cargo_check";

// travas CHECK da tabela que olham a coluna cargo (o nome automatico e acessos_escola_cargo_check)
async function travasDoCargo(c) {
  const r = await c.query(
    `select con.conname as nome, pg_get_constraintdef(con.oid) as def
       from pg_constraint con join pg_class t on t.oid = con.conrelid join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public' and t.relname = 'acessos_escola' and con.contype = 'c'
        and pg_get_constraintdef(con.oid) ilike '%cargo%'`,
  );
  return r.rows;
}

(async () => {
  const c = new Client({ connectionString: lerDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  console.log(APLICAR ? "MODO: APLICAR\n" : "MODO: DRY-RUN (nada sera alterado)\n");

  const tabela = (await c.query("select 1 from information_schema.tables where table_schema='public' and table_name='acessos_escola'")).rowCount > 0;
  if (!tabela) { console.log("Tabela acessos_escola nao existe neste banco. Nada a fazer."); await c.end(); return; }

  const travas = await travasDoCargo(c);
  console.log(`Travas do cargo hoje: ${travas.length}`);
  for (const t of travas) console.log(`  ${t.nome}: ${t.def}`);

  const porCargo = await c.query("select cargo, ativo, count(*)::int as n from acessos_escola group by cargo, ativo order by cargo, ativo desc");
  console.log("\nAcessos por cargo (cargo | ativo | quantidade):");
  for (const r of porCargo.rows) console.log(`  ${r.cargo} | ${r.ativo ? "ativo" : "inativo"} | ${r.n}`);
  const fora = porCargo.rows.filter((r) => !CARGOS.includes(r.cargo));
  if (fora.length) {
    console.log(`\nPARADO: ha cargo fora da lista nova (${fora.map((r) => r.cargo).join(", ")}). Nada foi alterado.`);
    await c.end(); process.exitCode = 1; return;
  }

  const jaAceita = travas.length > 0 && travas.every((t) => t.def.includes("'pedagogia'"));
  if (jaAceita) { console.log("\nA trava ja aceita pedagogia. Nada a fazer."); await c.end(); return; }

  const lista = CARGOS.map((x) => `'${x}'`).join(",");
  console.log(`\nVai ${travas.length ? "trocar" : "criar"} a trava: ${NOVA} CHECK (cargo IN (${lista}))`);
  if (!APLICAR) { console.log("\nDRY-RUN: nada foi alterado. Rode com --aplicar."); await c.end(); return; }

  await c.query("BEGIN");
  try {
    for (const t of travas) await c.query(`ALTER TABLE "acessos_escola" DROP CONSTRAINT "${t.nome}"`);
    await c.query(`ALTER TABLE "acessos_escola" ADD CONSTRAINT "${NOVA}" CHECK ("cargo" IN (${lista}))`);
    await c.query("COMMIT");
  } catch (err) { await c.query("ROLLBACK"); throw err; }

  console.log("\nGRAVADO. Travas do cargo agora:");
  for (const t of await travasDoCargo(c)) console.log(`  ${t.nome}: ${t.def}`);
  await c.end();
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
