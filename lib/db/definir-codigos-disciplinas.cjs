/**
 * Define o Codigo Externo do RCO (e/ou a sigla) de disciplinas de uma escola (28/10/2026).
 * Depois, padronizar-disciplinas.cjs poe nome e sigla do padrao NexGrade pelo codigo.
 * Uso (em lib\db):
 *   node definir-codigos-disciplinas.cjs esc_xxx 1655=6318 1681=2997 1669=sigla:HIB "1696=nome:Programação Back-End"
 *   ... --aplicar          (sem --aplicar: so mostra)
 * Recusa codigo que outra disciplina da escola ja usa.
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const ARGS = process.argv.slice(2);
const APLICAR = ARGS.includes("--aplicar");
const [ESCOLA_ID, ...PARES] = ARGS.filter((a) => !a.startsWith("--"));

function carregarDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const p = [path.join(__dirname, ".env"), path.join("lib", "db", ".env")].find((f) => fs.existsSync(f));
  const linha = fs.readFileSync(p, "utf8").split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
  return linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

(async () => {
  const mudancas = PARES.map((p) => {
    const m = /^(\d+)=(?:sigla:(.+)|nome:(.+)|(\d+))$/.exec(p);
    return m ? { id: Number(m[1]), sigla: m[2] ?? null, nome: m[3]?.trim() || null, cod: m[4] != null ? Number(m[4]) : null } : null;
  });
  if (!ESCOLA_ID || !mudancas.length || mudancas.includes(null)) { console.log("Uso: node definir-codigos-disciplinas.cjs esc_xxx <id>=<codigo> <id>=sigla:<SIGLA> "<id>=nome:<Nome>" ... [--aplicar]"); return; }
  const c = new Client({ connectionString: carregarDatabaseUrl(), ssl: process.env.PGSSL === "0" ? false : { rejectUnauthorized: false } });
  await c.connect();
  try {
    const discs = (await c.query(`SELECT id, nome, sigla, codigo_externo_rco AS cod FROM disciplinas WHERE escola_id = $1`, [ESCOLA_ID])).rows;
    let erro = false;
    for (const m of mudancas) {
      const d = discs.find((x) => x.id === m.id);
      if (!d) { console.log(`ERRO: #${m.id} nao e desta escola.`); erro = true; continue; }
      if (m.cod != null) {
        const outra = discs.find((x) => x.id !== m.id && Number(x.cod) === m.cod);
        if (outra) { console.log(`ERRO: cod ${m.cod} ja e de #${outra.id} "${outra.nome}".`); erro = true; continue; }
        console.log(`#${d.id} "${d.nome}": codigo externo ${d.cod ?? "-"} -> ${m.cod}`);
      }
      if (m.sigla) console.log(`#${d.id} "${d.nome}": sigla ${d.sigla ?? "(sem)"} -> ${m.sigla}`);
      if (m.nome) {
        const chave = (x) => String(x ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
        const outra = discs.find((x) => x.id !== m.id && chave(x.nome) === chave(m.nome));
        if (outra) { console.log(`ERRO: a escola ja tem "${outra.nome}" #${outra.id}.`); erro = true; continue; }
        console.log(`#${d.id} "${d.nome}": nome -> "${m.nome}"`);
      }
      m.antes = d;
    }
    if (erro) { console.log("\nNada foi gravado."); return; }
    if (!APLICAR) { console.log("\nENSAIO: nada foi gravado. Para gravar, rode de novo com --aplicar."); return; }
    const pasta = path.join(__dirname, "_arquivo"); fs.mkdirSync(pasta, { recursive: true });
    const arq = path.join(pasta, `backup-definir-codigos-${ESCOLA_ID}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(arq, JSON.stringify(mudancas, null, 1));
    await c.query("BEGIN");
    for (const m of mudancas) {
      if (m.cod != null) await c.query(`UPDATE disciplinas SET codigo_externo_rco = $1 WHERE id = $2 AND escola_id = $3`, [m.cod, m.id, ESCOLA_ID]);
      if (m.sigla) await c.query(`UPDATE disciplinas SET sigla = $1 WHERE id = $2 AND escola_id = $3`, [m.sigla, m.id, ESCOLA_ID]);
      if (m.nome) await c.query(`UPDATE disciplinas SET nome = $1 WHERE id = $2 AND escola_id = $3`, [m.nome, m.id, ESCOLA_ID]);
    }
    await c.query("COMMIT");
    console.log(`\nGRAVADO: ${mudancas.length} disciplina(s). Backup: ${arq}`);
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    console.log("ERRO (nada foi gravado):", e.message);
  } finally { await c.end(); }
})();
