/**
 * Junta uma disciplina repetida em outra da mesma escola (28/10/2026).
 * Todas as tabelas com coluna disciplina_id passam a apontar para a disciplina que fica;
 * depois a repetida e apagada. Antes de gravar, salva em _arquivo\ o que muda (para desfazer).
 * Uso (em lib\db):
 *   node juntar-disciplinas.cjs esc_xxx <id_que_sai> <id_que_fica>
 *   node juntar-disciplinas.cjs esc_xxx <id_que_sai> <id_que_fica> --aplicar
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const ARGS = process.argv.slice(2);
const APLICAR = ARGS.includes("--aplicar");
const [ESCOLA_ID, SAI, FICA] = ARGS.filter((a) => !a.startsWith("--"));

function carregarDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const p = [path.join(__dirname, ".env"), path.join("lib", "db", ".env")].find((f) => fs.existsSync(f));
  const linha = fs.readFileSync(p, "utf8").split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
  return linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

(async () => {
  if (!ESCOLA_ID || !Number(SAI) || !Number(FICA)) { console.log("Uso: node juntar-disciplinas.cjs esc_xxx <id_que_sai> <id_que_fica> [--aplicar]"); return; }
  const c = new Client({ connectionString: carregarDatabaseUrl(), ssl: process.env.PGSSL === "0" ? false : { rejectUnauthorized: false } });
  await c.connect();
  try {
    const d = (await c.query(`SELECT id, nome, sigla, codigo_externo_rco FROM disciplinas WHERE escola_id = $1 AND id = ANY($2::int[])`, [ESCOLA_ID, [Number(SAI), Number(FICA)]])).rows;
    const sai = d.find((x) => x.id === Number(SAI)), fica = d.find((x) => x.id === Number(FICA));
    if (!sai || !fica) { console.log("ERRO: as duas disciplinas precisam ser desta escola. Nada foi gravado."); return; }
    console.log(`Sai:  #${sai.id} "${sai.nome}" (cod ${sai.codigo_externo_rco ?? "-"}, ${sai.sigla ?? "sem sigla"})`);
    console.log(`Fica: #${fica.id} "${fica.nome}" (cod ${fica.codigo_externo_rco ?? "-"}, ${fica.sigla ?? "sem sigla"})`);

    const tabelas = (await c.query(`SELECT table_name FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'disciplina_id' ORDER BY table_name`)).rows.map((r) => r.table_name);
    const mudancas = {};
    for (const t of tabelas) {
      const linhas = (await c.query(`SELECT * FROM "${t}" WHERE disciplina_id = $1`, [sai.id])).rows;
      if (linhas.length) { mudancas[t] = linhas; console.log(`  ${t}: ${linhas.length} linha(s) passam para #${fica.id}`); }
    }
    if (!Object.keys(mudancas).length) console.log("  (nenhuma tabela usa a disciplina que sai)");

    if (!APLICAR) { console.log("\nENSAIO: nada foi gravado. Para gravar, rode de novo com --aplicar."); return; }
    const dir = path.join(__dirname, "_arquivo");
    fs.mkdirSync(dir, { recursive: true });
    const arq = path.join(dir, `backup-juntar-disciplinas-${ESCOLA_ID}-${sai.id}-em-${fica.id}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(arq, JSON.stringify({ sai, fica, mudancas }, null, 1));
    await c.query("BEGIN");
    for (const t of Object.keys(mudancas)) await c.query(`UPDATE "${t}" SET disciplina_id = $1 WHERE disciplina_id = $2`, [fica.id, sai.id]);
    await c.query(`DELETE FROM disciplinas WHERE id = $1 AND escola_id = $2`, [sai.id, ESCOLA_ID]);
    await c.query("COMMIT");
    console.log(`\nGRAVADO: #${sai.id} juntada em #${fica.id} e apagada. Backup: ${arq}`);
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    console.log("ERRO (nada foi gravado):", e.message);
  } finally {
    await c.end();
  }
})();
