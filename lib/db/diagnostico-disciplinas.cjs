/**
 * diagnostico-disciplinas.cjs  [SOMENTE LEITURA]
 * Raio-x das disciplinas de uma escola, antes de padronizar nomes e siglas:
 *  - disciplinas USADAS (turma_disciplinas, grade oficial, professor_disciplinas, aulas fixas, matriz da turma);
 *  - duplicadas: mesmo Codigo Externo ou mesmo nome (sem acento/caixa) em mais de uma disciplina;
 *  - sigla de referencia: a que as outras escolas usam para o mesmo Codigo Externo, e a do catalogo;
 *  - quantas disciplinas nao sao usadas em nada (candidatas a limpeza).
 * Grava um JSON com tudo em _arquivo\diagnostico-disciplinas-<escola>.json (para o proximo script).
 * Uso (em lib\db):  node diagnostico-disciplinas.cjs esc_xxx
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const ESCOLA_ID = process.argv[2];
function carregarDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const p = [path.join(__dirname, ".env"), path.join("lib", "db", ".env")].find((f) => fs.existsSync(f));
  const linha = fs.readFileSync(p, "utf8").split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
  return linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}
const chave = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

(async () => {
  if (!ESCOLA_ID) { console.log("Uso: node diagnostico-disciplinas.cjs esc_xxx"); return; }
  const c = new Client({ connectionString: carregarDatabaseUrl(), ssl: process.env.PGSSL === "0" ? false : { rejectUnauthorized: false } });
  await c.connect();
  try {
    const escola = (await c.query(`SELECT nome_fantasia FROM escolas WHERE id = $1`, [ESCOLA_ID])).rows[0];
    if (!escola) { console.log("Escola nao encontrada"); return; }
    const discs = (await c.query(
      `SELECT d.id, d.nome, d.sigla, d.codigo_externo_rco AS cod, d.codigo_sae AS sae,
              (SELECT COUNT(*) FROM turma_disciplinas td WHERE td.disciplina_id = d.id)::int AS vinc,
              (SELECT COUNT(*) FROM horarios h WHERE h.disciplina_id = d.id)::int AS aulas,
              (SELECT COUNT(*) FROM professor_disciplinas pd WHERE pd.disciplina_id = d.id)::int AS profd,
              (SELECT COUNT(*) FROM aulas_fixas af WHERE af.disciplina_id = d.id)::int AS fixas,
              (SELECT COUNT(*) FROM itens_matriz im JOIN matrizes_curriculares mc ON mc.id = im.matriz_curricular_id
                 JOIN turmas t ON t.matriz_curricular_id = mc.id WHERE im.disciplina_id = d.id)::int AS matriz_turma
         FROM disciplinas d WHERE d.escola_id = $1 ORDER BY d.nome`, [ESCOLA_ID])).rows;
    const outras = (await c.query(
      `SELECT d.codigo_externo_rco AS cod, d.sigla, e.nome_fantasia AS escola, d.nome
         FROM disciplinas d JOIN escolas e ON e.id = d.escola_id
        WHERE d.escola_id <> $1 AND d.sigla IS NOT NULL AND d.codigo_externo_rco IS NOT NULL
          AND EXISTS (SELECT 1 FROM turma_disciplinas td WHERE td.disciplina_id = d.id)`, [ESCOLA_ID])).rows;
    const catalogo = (await c.query(`SELECT nome, sigla, codigo_externo_rco AS cod FROM disciplinas_catalogo WHERE sigla IS NOT NULL`)).rows;

    const usada = (d) => d.vinc + d.aulas + d.profd + d.fixas + d.matriz_turma > 0;
    const usadas = discs.filter(usada);
    console.log(`Escola: ${escola.nome_fantasia} · ${discs.length} disciplinas cadastradas · ${usadas.length} usadas · ${discs.length - usadas.length} sem uso`);

    const refSigla = (d) => {
      const o = outras.filter((x) => Number(x.cod) === Number(d.cod));
      const cont = {};
      o.forEach((x) => { cont[x.sigla] = (cont[x.sigla] ?? 0) + 1; });
      const cat = catalogo.find((x) => (d.cod && Number(x.cod) === Number(d.cod)) || chave(x.nome) === chave(d.nome));
      return { outras: Object.entries(cont).sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s}${n > 1 ? "x" + n : ""}`).join(" "), catalogo: cat?.sigla ?? "" };
    };
    console.log(`\nDISCIPLINAS USADAS (${usadas.length}):`);
    console.log(`  ${"id".padEnd(6)}${"Cod".padEnd(6)}${"Sigla".padEnd(10)}${"Nome".padEnd(52)}Vinc Aulas | outras escolas / catalogo`);
    const lista = usadas.map((d) => ({ ...d, ref: refSigla(d) }));
    for (const d of lista) console.log(`  ${String(d.id).padEnd(6)}${String(d.cod ?? "-").padEnd(6)}${String(d.sigla ?? "-").padEnd(10)}${d.nome.slice(0, 50).padEnd(52)}${String(d.vinc).padStart(4)} ${String(d.aulas).padStart(5)} | ${d.ref.outras || "-"} / ${d.ref.catalogo || "-"}`);

    const dupCod = {}, dupNome = {};
    for (const d of discs) {
      if (d.cod != null) (dupCod[d.cod] ??= []).push(d);
      (dupNome[chave(d.nome)] ??= []).push(d);
    }
    const mostra = (titulo, grupos) => {
      const g = Object.values(grupos).filter((x) => x.length > 1);
      console.log(`\n${titulo} (${g.length}):`);
      for (const x of g) console.log("  " + x.map((d) => `#${d.id} "${d.nome}" cod ${d.cod ?? "-"} sigla ${d.sigla ?? "-"} (${usada(d) ? `usada: ${d.vinc} vinc, ${d.aulas} aulas` : "sem uso"})`).join("  |  "));
    };
    mostra("MESMO CODIGO EXTERNO", dupCod);
    mostra("MESMO NOME", dupNome);
    console.log(`\nSem sigla entre as usadas: ${usadas.filter((d) => !d.sigla).length}`);
    console.log(`Sem uso (candidatas a limpeza): ${discs.length - usadas.length}`);

    const pasta = path.join(__dirname, "_arquivo"); fs.mkdirSync(pasta, { recursive: true });
    const arq = path.join(pasta, `diagnostico-disciplinas-${ESCOLA_ID}.json`);
    fs.writeFileSync(arq, JSON.stringify({ escola: escola.nome_fantasia, discs: discs.map((d) => ({ ...d, usada: usada(d) })), outras, catalogo }, null, 1));
    console.log(`\nJSON: ${arq}`);
  } finally { await c.end(); }
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
