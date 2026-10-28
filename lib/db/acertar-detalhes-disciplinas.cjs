/**
 * (28/10/2026) Dois acertos depois do igualar-disciplinas-escolas.cjs:
 *  - "Industria 4.0" com sigla "IND." -> IND.4.0
 *  - "Programacao Back End" (sigla PRO.BAC II) -> nome "Programação Back-End II", igual ao das outras escolas
 * Uso (em lib\db):  node acertar-detalhes-disciplinas.cjs  (ensaio)   |   ... --aplicar
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const APLICAR = process.argv.includes("--aplicar");
function carregarDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const p = [path.join(__dirname, ".env"), path.join("lib", "db", ".env")].find((f) => fs.existsSync(f));
  const linha = fs.readFileSync(p, "utf8").split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
  return linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}
const chave = (x) => String(x ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[\s-]+/g, " ").trim().toLowerCase();
const REGRAS = [
  { nome: "industria 4.0", para: (d) => ({ nome: d.nome, sigla: "IND.4.0" }) },
  { nome: "programacao back end", para: () => ({ nome: "Programação Back-End II", sigla: "PRO.BAC II" }) },
];
(async () => {
  const c = new Client({ connectionString: carregarDatabaseUrl(), ssl: process.env.PGSSL === "0" ? false : { rejectUnauthorized: false } });
  await c.connect();
  try {
    const ds = (await c.query(`select d.id, d.escola_id, e.nome_fantasia escola, d.nome, d.sigla from disciplinas d join escolas e on e.id=d.escola_id`)).rows;
    const mudar = [];
    for (const r of REGRAS) for (const d of ds.filter((x) => chave(x.nome) === r.nome)) {
      const p = r.para(d);
      if (p.nome === d.nome && p.sigla === d.sigla) continue;
      const repetida = ds.find((x) => x.escola_id === d.escola_id && x.id !== d.id && chave(x.nome) === chave(p.nome));
      if (repetida) { console.log(`PULEI #${d.id} ${d.escola}: a escola ja tem "${repetida.nome}" #${repetida.id} (juntar com juntar-disciplinas.cjs)`); continue; }
      mudar.push({ id: d.id, escola_id: d.escola_id, escola: d.escola, de: { nome: d.nome, sigla: d.sigla }, para: p });
    }
    for (const m of mudar) console.log(`#${m.id} ${m.escola}: "${m.de.nome}" [${m.de.sigla ?? "sem"}] -> "${m.para.nome}" [${m.para.sigla}]`);
    console.log(`\nTotal: ${mudar.length} disciplina(s).`);
    if (!APLICAR) { console.log("ENSAIO: nada foi gravado. Para gravar, rode de novo com --aplicar."); return; }
    if (!mudar.length) return;
    const pasta = path.join(__dirname, "_arquivo"); fs.mkdirSync(pasta, { recursive: true });
    const arq = path.join(pasta, `backup-acertar-detalhes-disciplinas-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(arq, JSON.stringify(mudar, null, 1));
    await c.query("BEGIN");
    try {
      for (const m of mudar) await c.query("update disciplinas set nome=$1, sigla=$2 where id=$3 and escola_id=$4", [m.para.nome, m.para.sigla, m.id, m.escola_id]);
      await c.query("COMMIT");
    } catch (e) { await c.query("ROLLBACK"); throw e; }
    console.log(`GRAVADO. Backup: ${arq}`);
  } finally { await c.end(); }
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
