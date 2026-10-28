/**
 * [SOMENTE LEITURA] (28/10/2026) Procura disciplinas pelo nome (ou codigo) em todas as escolas e mostra
 * id, escola, sigla, Codigo Externo e onde cada uma e usada (turmas, grade, professores).
 * Uso (em lib\db):  node buscar-disciplinas.cjs "educacao digital"     ou     node buscar-disciplinas.cjs 6254
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

function carregarDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const p = [path.join(__dirname, ".env"), path.join("lib", "db", ".env")].find((f) => fs.existsSync(f));
  const linha = fs.readFileSync(p, "utf8").split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
  return linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}
const termo = process.argv.slice(2).join(" ").trim();
if (!termo) { console.log('Uso: node buscar-disciplinas.cjs "parte do nome"   ou   node buscar-disciplinas.cjs <codigo>'); process.exit(1); }
const sem = (x) => String(x ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

(async () => {
  const c = new Client({ connectionString: carregarDatabaseUrl(), ssl: process.env.PGSSL === "0" ? false : { rejectUnauthorized: false } });
  await c.connect();
  try {
    const todas = (await c.query(`select d.id, d.escola_id, e.nome_fantasia escola, d.nome, d.sigla, d.codigo_externo_rco cod
      from disciplinas d join escolas e on e.id=d.escola_id order by e.nome_fantasia, d.nome`)).rows;
    const achou = /^\d+$/.test(termo) ? todas.filter((d) => String(d.cod) === termo) : todas.filter((d) => sem(d.nome).includes(sem(termo)));
    if (!achou.length) { console.log("Nenhuma disciplina encontrada."); return; }
    const conta = async (tabela, ids) => {
      try { return new Map((await c.query(`select disciplina_id id, count(*)::int n from ${tabela} where disciplina_id = any($1) group by 1`, [ids])).rows.map((r) => [r.id, r.n])); }
      catch { return new Map(); }
    };
    const ids = achou.map((d) => d.id);
    const [td, hr, pd] = [await conta("turma_disciplinas", ids), await conta("horarios", ids), await conta("professor_disciplinas", ids)];
    for (const d of achou)
      console.log(`#${d.id}  ${d.escola} (${d.escola_id})  "${d.nome}" [${d.sigla ?? "sem sigla"}] cod ${d.cod ?? "-"}  ->  turmas ${td.get(d.id) ?? 0}, aulas na grade ${hr.get(d.id) ?? 0}, professores ${pd.get(d.id) ?? 0}`);
  } finally { await c.end(); }
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
