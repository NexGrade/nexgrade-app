/**
 * ver-turma-x-rco.cjs  [SOMENTE LEITURA]
 * Compara uma turma do NexGrade com o arquivo do RCO que a escola enviou (tela "Arquivo do RCO"):
 * disciplinas e aulas por semana no RCO  x  vinculos da turma (carga e professor)  x  aulas na grade oficial.
 * Uso (em lib\db):
 *   node ver-turma-x-rco.cjs "1ME DOC"
 *   node ver-turma-x-rco.cjs "1ME DOC" org_3HCMsuYeAwkggR1dxXNzEdzNaX8
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const ESCOLA_PADRAO = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8"; // C.E. Prof. Mario B. T. Braga
function carregarDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const p = [path.join(__dirname, ".env"), path.join("lib", "db", ".env")].find((f) => fs.existsSync(f));
  const linha = fs.readFileSync(p, "utf8").split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
  return linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}
const tag = (bloco, nome) => { const m = new RegExp(`<${nome}>([\\s\\S]*?)</${nome}>`).exec(bloco); return m ? m[1].trim() : ""; };
const registros = (xml, secao) => {
  const s = tag(xml, secao);
  return [...s.matchAll(/<REGISTRO>([\s\S]*?)<\/REGISTRO>/g)].map((m) => m[1]);
};
const pad = (s, n) => String(s ?? "").slice(0, n).padEnd(n);

(async () => {
  const nomeTurma = process.argv[2];
  const escolaId = process.argv[3] || ESCOLA_PADRAO;
  if (!nomeTurma) { console.log('Uso: node ver-turma-x-rco.cjs "1ME DOC"'); return; }
  const c = new Client({ connectionString: carregarDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const t = (await c.query(
      `SELECT id, nome, turno, codigo_sere, codigo_sere_if FROM turmas WHERE escola_id = $1 AND nome ILIKE $2 ORDER BY id`,
      [escolaId, nomeTurma])).rows;
    if (t.length !== 1) { console.log(`Turmas encontradas com "${nomeTurma}": ${t.length}`, t.map((x) => x.nome)); return; }
    const turma = t[0];
    console.log(`Turma ${turma.nome} (id ${turma.id}) · turno ${turma.turno} · SERE ${turma.codigo_sere ?? "-"}${turma.codigo_sere_if ? " / IF " + turma.codigo_sere_if : ""}`);

    // arquivo do RCO
    const cfg = (await c.query(`SELECT valor FROM configuracoes WHERE escola_id = $1 AND chave = 'arquivo_rco_conteudo'`, [escolaId])).rows[0];
    const rco = new Map(); // codigoExterno -> { nome, aulas }
    if (!cfg?.valor?.xml) console.log("\n(A escola ainda nao enviou o arquivo do RCO.)");
    else {
      const xml = cfg.valor.xml;
      const nomes = new Map(registros(xml, "DISCIPLINAS").map((r) => [Number(tag(r, "CODIGO")), tag(r, "NOME")]));
      const codsTurma = [turma.codigo_sere, turma.codigo_sere_if].filter(Boolean).map(Number);
      for (const r of registros(xml, "GRADES")) {
        if (!codsTurma.includes(Number(tag(r, "COD_TURMA")))) continue;
        const cod = Number(tag(r, "COD_DISCIPLINA"));
        const atual = rco.get(cod) ?? { nome: nomes.get(cod) ?? "?", aulas: 0 };
        atual.aulas += Number(tag(r, "AULAS")) || 0;
        rco.set(cod, atual);
      }
      if (!rco.size) console.log("\n(O arquivo do RCO nao tem grade para o codigo SERE desta turma.)");
    }

    // vinculos e grade oficial
    const vinc = (await c.query(
      `SELECT td.disciplina_id, d.nome, d.codigo_externo_rco AS cod, d.codigo_sae AS sae,
              COALESCE(td.carga_horaria_semanal_override, d.carga_semanal) AS carga,
              p.nome AS prof, pa.nome AS apoio, td.grupo_trio
         FROM turma_disciplinas td JOIN disciplinas d ON d.id = td.disciplina_id
         LEFT JOIN professores p ON p.id = td.professor_id LEFT JOIN professores pa ON pa.id = td.professor_apoio_id
        WHERE td.turma_id = $1 ORDER BY d.nome`, [turma.id])).rows;
    const aulas = (await c.query(
      `SELECT disciplina_id, COUNT(*) FILTER (WHERE NOT assincrona)::int AS pres, COUNT(*) FILTER (WHERE assincrona)::int AS assinc
         FROM horarios WHERE turma_id = $1 AND COALESCE(versao_grade,'oficial') = 'oficial' GROUP BY disciplina_id`, [turma.id])).rows;
    const aulasDe = new Map(aulas.map((a) => [a.disciplina_id, a]));

    console.log(`\n${pad("Disciplina no NexGrade", 38)} ${pad("Cod.Ext", 7)} ${pad("Carga", 5)} ${pad("Grade", 5)} ${pad("RCO", 4)} Professor / situacao`);
    console.log("-".repeat(110));
    const usados = new Set();
    let somaCarga = 0, somaGrade = 0;
    for (const v of vinc) {
      const g = aulasDe.get(v.disciplina_id) ?? { pres: 0, assinc: 0 };
      const r = v.cod != null ? rco.get(Number(v.cod)) : undefined;
      if (v.cod != null) usados.add(Number(v.cod));
      somaCarga += Number(v.carga) || 0; somaGrade += g.pres;
      const avisos = [];
      if (!v.prof) avisos.push("SEM PROFESSOR");
      if (v.cod == null) avisos.push("sem Codigo Externo");
      else if (rco.size && !r) avisos.push("NAO esta na grade do RCO");
      if (r && r.aulas !== Number(v.carga)) avisos.push(`RCO tem ${r.aulas}`);
      if (g.pres !== Number(v.carga)) avisos.push(`grade tem ${g.pres}`);
      console.log(`${pad(v.nome, 38)} ${pad(v.cod ?? "-", 7)} ${pad(v.carga, 5)} ${pad(g.pres + (g.assinc ? `+${g.assinc}a` : ""), 5)} ${pad(r ? r.aulas : "-", 4)} ${v.prof ?? "-"}${v.apoio ? " + " + v.apoio : ""}${v.grupo_trio ? " [trio " + v.grupo_trio + "]" : ""}${avisos.length ? "  <== " + avisos.join("; ") : ""}`);
    }
    console.log("-".repeat(110));
    console.log(`${pad("TOTAL", 38)} ${pad("", 7)} ${pad(somaCarga, 5)} ${pad(somaGrade, 5)} ${pad([...rco.values()].reduce((a, x) => a + x.aulas, 0) || "-", 4)}`);
    const faltam = [...rco.entries()].filter(([cod]) => !usados.has(cod));
    if (faltam.length) {
      console.log("\nNo RCO e NAO vinculadas a esta turma no NexGrade:");
      for (const [cod, r] of faltam) console.log(`  ${pad(cod, 7)} ${pad(r.nome, 45)} ${r.aulas} aula(s)`);
    }
    const semVinculo = aulas.filter((a) => !vinc.some((v) => v.disciplina_id === a.disciplina_id));
    if (semVinculo.length) console.log(`\nAulas na grade de disciplinas SEM vinculo na turma: ${semVinculo.map((a) => `disciplina ${a.disciplina_id} (${a.pres})`).join(", ")}`);
  } finally { await c.end(); }
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
