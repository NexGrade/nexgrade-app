// [ESCOLA-DEMO] (15/10/2026) Copia o calendario escolar (feriados, recessos e trimestres
// letivos) de uma escola real para a escola de DEMONSTRACAO. Sem isso, a aba Conflitos da
// demo mostra "turma sem calendario" em todas as turmas.
// Calendario e dado publico da SEED-PR (nao tem dado pessoal). Nao altera a origem.
// So grava numa escola com "Demonstra" no nome; apaga antes o calendario que a demo tiver.
// [v2] Se a origem nao tiver calendario, usa o calendario oficial SEED-PR 2026
// (Resolucao 6.494/2025): 3 trimestres (63 + 68 + 70 = 201 dias letivos) e feriados nacionais.
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

// Calendario oficial SEED-PR 2026 (Resolucao 6.494/2025, rede estadual).
const SEED_PR_2026 = {
  trimestres_letivos: [
    { ano: 2026, trimestre: 1, data_inicio: "2026-02-05", data_fim: "2026-05-14", dias_letivos: 63 },
    { ano: 2026, trimestre: 2, data_inicio: "2026-05-18", data_fim: "2026-09-04", dias_letivos: 68 },
    { ano: 2026, trimestre: 3, data_inicio: "2026-09-08", data_fim: "2026-12-18", dias_letivos: 70 },
  ],
  calendario_escolar: [
    ["2026-02-05", "inicio_ano_letivo", "Início do ano letivo"],
    ["2026-02-05", "inicio_trimestre", "Início do 1º trimestre"],
    ["2026-04-03", "feriado", "Paixão de Cristo"],
    ["2026-04-21", "feriado", "Tiradentes"],
    ["2026-05-01", "feriado", "Dia do Trabalho"],
    ["2026-05-14", "fim_trimestre", "Fim do 1º trimestre"],
    ["2026-05-18", "inicio_trimestre", "Início do 2º trimestre"],
    ["2026-06-04", "feriado", "Corpus Christi"],
    ["2026-09-04", "fim_trimestre", "Fim do 2º trimestre"],
    ["2026-09-07", "feriado", "Independência do Brasil"],
    ["2026-09-08", "inicio_trimestre", "Início do 3º trimestre"],
    ["2026-10-12", "feriado", "Nossa Senhora Aparecida"],
    ["2026-11-02", "feriado", "Finados"],
    ["2026-11-20", "feriado", "Dia Nacional de Zumbi e da Consciência Negra"],
    ["2026-12-18", "fim_trimestre", "Fim do 3º trimestre"],
    ["2026-12-18", "fim_ano_letivo", "Fim do ano letivo"],
  ].map(([data, tipo, descricao]) => ({ ano: 2026, data, tipo, descricao, dia_letivo: false })),
};

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
  if (dados.trimestres_letivos.linhas.length === 0) {
    console.log("\nA origem nao tem calendario: vai o calendario oficial SEED-PR 2026 (Resolucao 6.494/2025):");
    for (const t of TABELAS) {
      dados[t].linhas = SEED_PR_2026[t];
      dados[t].cols = dados[t].cols.filter((x) => x === "escola_id" || x in SEED_PR_2026[t][0]);
    }
    for (const t of SEED_PR_2026.trimestres_letivos) console.log(`  ${t.trimestre}o trimestre: ${t.data_inicio} a ${t.data_fim}, ${t.dias_letivos} dias letivos`);
    console.log(`  ${SEED_PR_2026.calendario_escolar.filter((x) => x.tipo === "feriado").length} feriados e as datas de inicio/fim de trimestre e do ano letivo`);
  }

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
