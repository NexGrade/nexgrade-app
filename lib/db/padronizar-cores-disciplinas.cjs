/**
 * [CORES-DISCIPLINAS] (28/10/2026) Deixa as disciplinas de todas as escolas com as cores da grade do
 * Mario Braga (a mesma disciplina = a mesma cor em todas as escolas, pelo Codigo Externo do RCO).
 *  - So muda disciplina que esta com a cor padrao (#6366f1, o "azul"): cor escolhida pela escola fica.
 *  - Disciplina que o Mario Braga nao tem: cor fixa de uma paleta, calculada pelo codigo (ou pelo nome).
 *  - Grava tambem dados\cores-disciplinas.json (codigo -> cor), para o sistema usar em escola nova.
 * Uso (em lib\db):  node padronizar-cores-disciplinas.cjs            (ensaio)
 *                   node padronizar-cores-disciplinas.cjs --aplicar
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const APLICAR = process.argv.includes("--aplicar");
const REF = process.env.ESCOLA_REF || "org_3HCMsuYeAwkggR1dxXNzEdzNaX8"; // C.E. Prof. Mario B.T. Braga
const PADRAO = "#6366f1";
const PALETA = ["#ef4444", "#f97316", "#f59e0b", "#84cc16", "#22c55e", "#14b8a6", "#06b6d4", "#0ea5e9",
  "#3b82f6", "#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#f43f5e", "#78716c", "#64748b"];

function carregarDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const p = [path.join(__dirname, ".env"), path.join("lib", "db", ".env")].find((f) => fs.existsSync(f));
  const linha = fs.readFileSync(p, "utf8").split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
  return linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}
const chave = (x) => String(x ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const ehPadrao = (c) => !c || chave(c) === PADRAO;
function daPaleta(s) { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return PALETA[h % PALETA.length]; }

(async () => {
  const c = new Client({ connectionString: carregarDatabaseUrl(), ssl: process.env.PGSSL === "0" ? false : { rejectUnauthorized: false } });
  await c.connect();
  try {
    const ref = (await c.query("select nome_fantasia from escolas where id=$1", [REF])).rows[0];
    if (!ref) { console.log("Escola de referencia nao encontrada:", REF); return; }
    const discRef = (await c.query("select nome, cor, codigo_externo_rco cod from disciplinas where escola_id=$1", [REF])).rows;
    const porCod = new Map(), porNome = new Map();
    for (const d of discRef) {
      if (ehPadrao(d.cor)) continue;
      if (d.cod != null && !porCod.has(Number(d.cod))) porCod.set(Number(d.cod), d.cor);
      if (!porNome.has(chave(d.nome))) porNome.set(chave(d.nome), d.cor);
    }
    console.log(`Referencia: ${ref.nome_fantasia} · ${porCod.size} cores por codigo, ${porNome.size} por nome`);

    const escolas = (await c.query("select id, nome_fantasia from escolas where id<>$1 order by nome_fantasia", [REF])).rows;
    const mudar = [], mapaFinal = {};
    for (const [k, v] of porCod) mapaFinal[k] = v;
    for (const e of escolas) {
      const discs = (await c.query("select id, nome, cor, codigo_externo_rco cod from disciplinas where escola_id=$1", [e.id])).rows;
      let n = 0, igualRef = 0, paleta = 0, mantidas = 0;
      for (const d of discs) {
        if (!ehPadrao(d.cor)) { mantidas++; continue; }
        let cor = (d.cod != null ? porCod.get(Number(d.cod)) : undefined) ?? porNome.get(chave(d.nome));
        if (cor) igualRef++; else { cor = daPaleta(d.cod != null ? `cod${d.cod}` : chave(d.nome)); paleta++; }
        if (d.cod != null && !mapaFinal[Number(d.cod)]) mapaFinal[Number(d.cod)] = cor;
        mudar.push({ id: d.id, escola: e.id, de: d.cor, para: cor }); n++;
      }
      console.log(`${e.nome_fantasia}: ${discs.length} disciplinas · ${n} recebem cor (${igualRef} igual ao Mario Braga, ${paleta} da paleta) · ${mantidas} ja tinham cor propria e ficam`);
    }
    const arqMapa = path.join(__dirname, "dados", "cores-disciplinas.json");
    fs.writeFileSync(arqMapa, JSON.stringify({ descricao: "Cor de cada disciplina por Codigo Externo do RCO (padrao NexGrade, a partir do Mario Braga). Gerado por padronizar-cores-disciplinas.cjs.", porCodigo: mapaFinal }, null, 1));
    console.log(`\nMapa codigo -> cor: ${Object.keys(mapaFinal).length} codigos em ${arqMapa}`);
    if (!APLICAR) { console.log("\nENSAIO: nada foi gravado no banco. Para gravar, rode de novo com --aplicar."); return; }

    const pasta = path.join(__dirname, "_arquivo"); fs.mkdirSync(pasta, { recursive: true });
    const arq = path.join(pasta, `backup-cores-disciplinas-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(arq, JSON.stringify(mudar, null, 1));
    await c.query("BEGIN");
    try {
      for (const m of mudar) await c.query("update disciplinas set cor=$1 where id=$2 and escola_id=$3", [m.para, m.id, m.escola]);
      await c.query("COMMIT");
    } catch (e) { await c.query("ROLLBACK"); throw e; }
    console.log(`\nGRAVADO: ${mudar.length} disciplinas com cor nova. Backup: ${arq}`);
  } finally { await c.end(); }
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
