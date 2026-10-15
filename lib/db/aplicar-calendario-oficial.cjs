// [CALENDARIO-OFICIAL] (15/10/2026) Padroniza o calendario letivo das escolas com o
// calendario oficial SEED-PR 2026 (Resolucao 6.494/2025): 3 trimestres (201 dias letivos),
// feriados nacionais e as datas de inicio/fim de trimestre e do ano letivo.
// Por padrao so grava nas escolas que AINDA NAO TEM trimestres de 2026 (nao mexe em calendario
// que a escola ja ajustou). --substituir troca tambem os que ja existem.
// A mesma lista esta em artifacts/api-server/src/lib/calendario-oficial.ts (botao na tela).
// Uso (na pasta lib\db):
//   node aplicar-calendario-oficial.cjs                         (dry-run, todas as escolas)
//   node aplicar-calendario-oficial.cjs --aplicar
//   node aplicar-calendario-oficial.cjs --escola=org_xxx --substituir --aplicar
const fs = require("fs");
const { Client } = require("pg");

const arg = (n) => (process.argv.find((a) => a.startsWith("--" + n + "=")) || "").split("=").slice(1).join("=") || null;
const APLICAR = process.argv.includes("--aplicar");
const SUBSTITUIR = process.argv.includes("--substituir");
const ESCOLA = arg("escola");
const ANO = 2026;

const TRIMESTRES = [
  { trimestre: 1, data_inicio: "2026-02-05", data_fim: "2026-05-14", dias_letivos: 63 },
  { trimestre: 2, data_inicio: "2026-05-18", data_fim: "2026-09-04", dias_letivos: 68 },
  { trimestre: 3, data_inicio: "2026-09-08", data_fim: "2026-12-18", dias_letivos: 70 },
];
const EVENTOS = [
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
];

function lerDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const m = fs.readFileSync(".env", "utf8").match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m);
  if (!m) throw new Error("DATABASE_URL nao definido (nem no ambiente nem no .env desta pasta)");
  return m[1];
}

(async () => {
  const c = new Client({ connectionString: lerDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  const escolas = (await c.query(
    `select e.id, e.nome_fantasia,
            (select count(*)::int from trimestres_letivos t where t.escola_id=e.id and t.ano=$1) trimestres,
            (select count(*)::int from calendario_escolar k where k.escola_id=e.id and k.ano=$1) datas,
            (select count(*)::int from turmas u where u.escola_id=e.id) turmas
       from escolas e ${ESCOLA ? "where e.id=$2" : ""} order by e.nome_fantasia`,
    ESCOLA ? [ANO, ESCOLA] : [ANO],
  )).rows;
  if (ESCOLA && escolas.length === 0) throw new Error("escola nao encontrada: " + ESCOLA);

  console.log(`Calendario oficial SEED-PR ${ANO}: 3 trimestres (201 dias letivos) e ${EVENTOS.length} datas.\n`);
  const alvo = [];
  for (const e of escolas) {
    const tem = e.trimestres > 0 || e.datas > 0;
    const vai = !tem || SUBSTITUIR;
    if (vai) alvo.push(e);
    const acao = !tem ? "GRAVAR    " : SUBSTITUIR ? "SUBSTITUIR" : "MANTER    ";
    console.log(`${acao} | ${e.nome_fantasia} (${e.turmas} turmas) | hoje: ${e.trimestres} trimestres, ${e.datas} datas`);
  }
  if (!APLICAR) { console.log(`\nDRY-RUN: nada foi alterado. ${alvo.length} escola(s) receberiam o calendario. Rode com --aplicar.`); await c.end(); return; }

  await c.query("BEGIN");
  try {
    for (const e of alvo) {
      await c.query("delete from calendario_escolar where escola_id=$1 and ano=$2", [e.id, ANO]);
      await c.query("delete from trimestres_letivos where escola_id=$1 and ano=$2", [e.id, ANO]);
      for (const t of TRIMESTRES) {
        await c.query("insert into trimestres_letivos (escola_id, ano, trimestre, data_inicio, data_fim, dias_letivos) values ($1,$2,$3,$4,$5,$6)", [e.id, ANO, t.trimestre, t.data_inicio, t.data_fim, t.dias_letivos]);
      }
      for (const [data, tipo, descricao] of EVENTOS) {
        await c.query("insert into calendario_escolar (escola_id, ano, data, tipo, descricao, dia_letivo) values ($1,$2,$3,$4,$5,false)", [e.id, ANO, data, tipo, descricao]);
      }
    }
    await c.query("COMMIT");
  } catch (err) { await c.query("ROLLBACK"); throw err; }
  console.log(`\nGRAVADO: calendario oficial ${ANO} em ${alvo.length} escola(s).`);
  await c.end();
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
