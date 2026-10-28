/**
 * [COMPARAR-DISCIPLINAS] (28/10/2026) SO LEITURA. Mostra as disciplinas (pelo Codigo Externo do RCO) que estao
 * com nome ou sigla diferente entre as escolas, e as que estao sem sigla. Lista completa em _arquivo.
 * Uso (em lib\db):  node comparar-disciplinas-escolas.cjs
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
const curta = (n) => n.replace(/^C\.E\.\s*(Prof\.\s*)?/i, "").split(" ")[0];
(async () => {
  const c = new Client({ connectionString: carregarDatabaseUrl(), ssl: process.env.PGSSL === "0" ? false : { rejectUnauthorized: false } });
  await c.connect();
  try {
    const rows = (await c.query(
      `select e.nome_fantasia escola, d.nome, d.sigla, d.codigo_externo_rco cod from disciplinas d join escolas e on e.id=d.escola_id order by d.codigo_externo_rco, e.nome_fantasia`)).rows;
    const porCod = new Map();
    for (const r of rows) if (r.cod != null) { if (!porCod.has(r.cod)) porCod.set(r.cod, []); porCod.get(r.cod).push(r); }
    const linhas = [];
    let difNome = 0, difSigla = 0;
    for (const [cod, rs] of porCod) {
      const nomes = new Set(rs.map((r) => r.nome)), siglas = new Set(rs.map((r) => r.sigla ?? "(sem)"));
      if (nomes.size > 1 || siglas.size > 1) {
        if (nomes.size > 1) difNome++; if (siglas.size > 1) difSigla++;
        linhas.push(`cod ${cod}: ` + rs.map((r) => `${curta(r.escola)}="${r.nome}" [${r.sigla ?? "sem sigla"}]`).join(" | "));
      }
    }
    const semSigla = rows.filter((r) => !r.sigla).map((r) => `${curta(r.escola)}: ${r.nome}${r.cod != null ? " (cod " + r.cod + ")" : ""}`);
    const semCod = rows.filter((r) => r.cod == null).map((r) => `${curta(r.escola)}: ${r.nome} [${r.sigla ?? "sem sigla"}]`);
    const out = [`Codigos com NOME diferente entre escolas: ${difNome} · com SIGLA diferente: ${difSigla}`, ...linhas,
      `\nSem sigla (${semSigla.length}):`, ...semSigla.map((x) => "  " + x), `\nSem Codigo Externo (${semCod.length}):`, ...semCod.map((x) => "  " + x)];
    const arq = path.join(__dirname, "_arquivo", "comparar-disciplinas-escolas.txt");
    fs.mkdirSync(path.dirname(arq), { recursive: true }); fs.writeFileSync(arq, out.join("\r\n"), "utf8");
    console.log(out.slice(0, 60).join("\n"));
    console.log(`\nLista completa: ${arq}`);
  } finally { await c.end(); }
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
