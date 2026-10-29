/**
 * definir-codigo-externo-disciplina.cjs  [ENSAIO por padrao; grava so com --aplicar]
 * Grava o Codigo Externo do RCO numa disciplina do NexGrade, conferindo antes:
 *  - quais turmas da escola usam essa disciplina (o codigo vale para todas);
 *  - se, no arquivo do RCO enviado pela escola, cada uma dessas turmas tem esse codigo na grade;
 *  - se outra disciplina da escola ja usa o mesmo codigo.
 * Uso (em lib\db):
 *   node definir-codigo-externo-disciplina.cjs "1ME DOC" "Educação Digital" 6254
 *   node definir-codigo-externo-disciplina.cjs "1ME DOC" "Educação Digital" 6254 --aplicar
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8"; // C.E. Prof. Mario B. T. Braga
const APLICAR = process.argv.includes("--aplicar");
function carregarDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const p = [path.join(__dirname, ".env"), path.join("lib", "db", ".env")].find((f) => fs.existsSync(f));
  const linha = fs.readFileSync(p, "utf8").split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
  return linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}
const tag = (b, n) => { const m = new RegExp(`<${n}>([\\s\\S]*?)</${n}>`).exec(b); return m ? m[1].trim() : ""; };
const registros = (xml, secao) => [...tag(xml, secao).matchAll(/<REGISTRO>([\s\S]*?)<\/REGISTRO>/g)].map((m) => m[1]);

(async () => {
  const [nomeTurma, nomeDisc, codTxt] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const codigo = Number(codTxt);
  if (!nomeTurma || !nomeDisc || !Number.isInteger(codigo)) {
    console.log('Uso: node definir-codigo-externo-disciplina.cjs "1ME DOC" "Educação Digital" 6254 [--aplicar]'); return;
  }
  const c = new Client({ connectionString: carregarDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const d = (await c.query(
      `SELECT d.id, d.nome, d.codigo_externo_rco, d.codigo_sae
         FROM turma_disciplinas td JOIN turmas t ON t.id = td.turma_id JOIN disciplinas d ON d.id = td.disciplina_id
        WHERE t.escola_id = $1 AND t.nome ILIKE $2 AND d.nome ILIKE $3`,
      [ESCOLA_ID, nomeTurma, nomeDisc])).rows;
    if (d.length !== 1) { console.log(`Disciplinas "${nomeDisc}" na turma "${nomeTurma}": ${d.length}`, d.map((x) => x.nome)); return; }
    const disc = d[0];
    console.log(`Disciplina: ${disc.nome} (id ${disc.id}) · Codigo Externo atual: ${disc.codigo_externo_rco ?? "-"} · SAE ${disc.codigo_sae ?? "-"}`);
    console.log(`Codigo novo: ${codigo}`);
    if (disc.codigo_externo_rco === codigo) { console.log("\nJa esta com esse codigo. Nada a fazer."); return; }

    const outra = (await c.query(
      `SELECT id, nome FROM disciplinas WHERE escola_id = $1 AND codigo_externo_rco = $2 AND id <> $3`,
      [ESCOLA_ID, codigo, disc.id])).rows;
    if (outra.length) console.log(`\nATENCAO: o codigo ${codigo} ja esta em: ${outra.map((o) => `${o.nome} (id ${o.id})`).join(", ")}`);

    const cfg = (await c.query(`SELECT valor FROM configuracoes WHERE escola_id = $1 AND chave = 'arquivo_rco_conteudo'`, [ESCOLA_ID])).rows[0];
    const xml = cfg?.valor?.xml ?? "";
    const nomeRco = new Map(registros(xml, "DISCIPLINAS").map((r) => [Number(tag(r, "CODIGO")), tag(r, "NOME")]));
    const gradesRco = registros(xml, "GRADES").map((r) => ({ turma: Number(tag(r, "COD_TURMA")), disc: Number(tag(r, "COD_DISCIPLINA")) }));
    console.log(`No arquivo do RCO, o codigo ${codigo} e: ${nomeRco.get(codigo) ?? "(nao encontrado)"}`);

    const turmas = (await c.query(
      `SELECT t.nome, t.turno, t.codigo_sere, t.codigo_sere_if
         FROM turma_disciplinas td JOIN turmas t ON t.id = td.turma_id
        WHERE td.disciplina_id = $1 ORDER BY t.turno, t.nome`, [disc.id])).rows;
    console.log(`\nTurmas que usam esta disciplina (${turmas.length}):`);
    let divergentes = 0;
    for (const t of turmas) {
      const cods = [t.codigo_sere, t.codigo_sere_if].filter(Boolean).map(Number);
      const tem = gradesRco.some((g) => cods.includes(g.turma) && g.disc === codigo);
      const doRco = gradesRco.filter((g) => cods.includes(g.turma)).map((g) => g.disc);
      const situacao = !cods.length ? "sem codigo SERE" : !doRco.length ? "turma fora do arquivo do RCO" : tem ? "OK: o RCO tem este codigo" : "o RCO NAO tem este codigo nesta turma";
      if (situacao.startsWith("o RCO NAO")) divergentes++;
      console.log(`  ${t.nome.padEnd(12)} ${t.turno.padEnd(10)} SERE ${String(t.codigo_sere ?? "-").padEnd(8)} ${situacao}`);
    }
    if (divergentes) console.log(`\nATENCAO: ${divergentes} turma(s) usam esta disciplina mas o RCO delas nao tem o codigo ${codigo}.`);

    if (!APLICAR) { console.log("\nENSAIO: nada foi gravado. Para gravar, rode de novo com --aplicar."); return; }
    if (outra.length || divergentes) { console.log("\nNao gravei: resolva os avisos de ATENCAO antes."); return; }
    const pasta = path.join(__dirname, "_arquivo"); fs.mkdirSync(pasta, { recursive: true });
    const backup = path.join(pasta, `backup-codigo-externo-${disc.id}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(backup, JSON.stringify({ disciplina: disc, codigoNovo: codigo }, null, 2));
    await c.query("BEGIN");
    const r = await c.query(`UPDATE disciplinas SET codigo_externo_rco = $1 WHERE id = $2 AND escola_id = $3`, [codigo, disc.id, ESCOLA_ID]);
    if (r.rowCount !== 1) { await c.query("ROLLBACK"); console.log("Nao gravei: esperava 1 linha, veio", r.rowCount); return; }
    await c.query("COMMIT");
    console.log(`\nGRAVADO: ${disc.nome} agora tem Codigo Externo ${codigo}. Backup: ${backup}`);
  } finally { await c.end(); }
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
