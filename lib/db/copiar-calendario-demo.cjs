// [ESCOLA-DEMO] (15/10/2026) Copia o calendario escolar (feriados, recessos e trimestres
// letivos) de uma escola real para a escola de DEMONSTRACAO. Sem isso, a aba Conflitos da
// demo mostra "turma sem calendario" em todas as turmas.
// Calendario e dado publico da SEED-PR (nao tem dado pessoal). Nao altera a origem.
// So grava numa escola com "Demonstra" no nome; apaga antes o calendario que a demo tiver.
// Uso (na pasta lib\db):
//   node copiar-calendario-demo.cjs --destino=esc_xxx            (dry-run, origem = Arlinda)
//   node copiar-calendario-demo.cjs --destino=esc_xxx --aplicar
const fs = require("fs");
const { Client } = require("pg");

const arg = (n) => (process.argv.find((a) => a.startsWith("--" + n + "=")) || "").split("=").slice(1).join("=") || null;
const APLICAR = process.argv.includes("--aplicar");
const ORIGEM = arg("origem") || "org_3HCLFry0r48pfutN7ChZIip3IWL"; // C.E. Arlinda Ferreira Creplive
const DESTINO = arg("destino");
const TABELAS = ["calendario_escolar", "trimestres_letivos"];

function lerDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const m = fs.readFileSync(".env", "utf8").match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m);
  if (!m) throw new Error("DATABASE_URL nao definido (nem no ambiente nem no .env desta pasta)");
  return m[1];
}

(async () => {
  if (!DESTINO) throw new Error("informe --destino=esc_... (a escola de demonstracao)");
  const c = new Client({ connectionString: lerDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  const nome = async (id) => (await c.query("select nome_fantasia from escolas where id=$1", [id])).rows[0]?.nome_fantasia;
  const nomeOrigem = await nome(ORIGEM);
  const nomeDestino = await nome(DESTINO);
  if (!nomeOrigem) throw new Error("escola de origem nao encontrada: " + ORIGEM);
  if (!nomeDestino) throw new Error("escola destino nao encontrada: " + DESTINO);
  if (!/demonstra/i.test(nomeDestino)) throw new Error(`a escola destino "${nomeDestino}" nao tem "Demonstracao" no nome; nada foi feito`);
  console.log(`Origem : ${nomeOrigem}\nDestino: ${nomeDestino}\n`);

  const dados = {};
  for (const t of TABELAS) {
    const cols = (await c.query("select column_name from information_schema.columns where table_schema='public' and table_name=$1 and column_name not in ('id','created_at')", [t])).rows.map((r) => r.column_name);
    const linhas = (await c.query(`select ${cols.map((x) => `"${x}"`).join(",")} from ${t} where escola_id=$1 order by 1`, [ORIGEM])).rows;
    const naDemo = (await c.query(`select count(*)::int n from ${t} where escola_id=$1`, [DESTINO])).rows[0].n;
    dados[t] = { cols, linhas };
    const anos = [...new Set(linhas.map((l) => l.ano))].join(", ") || "-";
    console.log(`${t.padEnd(20)} origem ${String(linhas.length).padStart(3)} linhas (anos ${anos}) | demo hoje ${naDemo} (serao substituidas)`);
  }
  if (dados.trimestres_letivos.linhas.length === 0) console.log("\nATENCAO: a origem nao tem trimestres; o aviso 'turma sem calendario' continuaria.");

  if (!APLICAR) { console.log("\nDRY-RUN: nada foi alterado. Rode com --aplicar."); await c.end(); return; }
  await c.query("BEGIN");
  try {
    for (const t of TABELAS) {
      await c.query(`delete from ${t} where escola_id=$1`, [DESTINO]);
      const { cols, linhas } = dados[t];
      for (const l of linhas) {
        const vals = cols.map((x) => (x === "escola_id" ? DESTINO : l[x]));
        await c.query(`insert into ${t} (${cols.map((x) => `"${x}"`).join(",")}) values (${cols.map((_, i) => "$" + (i + 1)).join(",")})`, vals);
      }
    }
    await c.query("COMMIT");
  } catch (e) { await c.query("ROLLBACK"); throw e; }
  console.log(`\nGRAVADO na escola demo: ${dados.calendario_escolar.linhas.length} datas do calendario e ${dados.trimestres_letivos.linhas.length} trimestres.`);
  console.log("Proximo passo: Horario > Conflitos > Reanalisar.");
  await c.end();
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
