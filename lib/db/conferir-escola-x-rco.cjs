/**
 * conferir-escola-x-rco.cjs  [SOMENTE LEITURA]
 * Confere TODAS as turmas da escola com o arquivo do RCO enviado pela escola (tela "Arquivo do RCO").
 * Mostra so o que esta diferente:
 *  - turma sem codigo SERE, ou com codigo que nao existe no arquivo do RCO;
 *  - disciplina sem Codigo Externo, ou com codigo que nao esta na grade do RCO da turma;
 *  - carga do NexGrade diferente das aulas do RCO;
 *  - aulas na grade oficial diferentes da carga; disciplina sem professor;
 *  - disciplinas do RCO que nao estao vinculadas a turma no NexGrade;
 *  - turmas do RCO que nao existem no NexGrade.
 * Uso (em lib\db):
 *   node conferir-escola-x-rco.cjs
 *   node conferir-escola-x-rco.cjs org_xxxxx        (outra escola)
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
const tag = (b, n) => { const m = new RegExp(`<${n}>([\\s\\S]*?)</${n}>`).exec(b); return m ? m[1].trim() : ""; };
const registros = (xml, secao) => [...tag(xml, secao).matchAll(/<REGISTRO>([\s\S]*?)<\/REGISTRO>/g)].map((m) => m[1]);
const TURNOS = ["matutino", "vespertino", "noturno", "integral"];

(async () => {
  const escolaId = process.argv[2] || ESCOLA_PADRAO;
  const c = new Client({ connectionString: carregarDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const cfg = (await c.query(`SELECT valor FROM configuracoes WHERE escola_id = $1 AND chave = 'arquivo_rco_conteudo'`, [escolaId])).rows[0];
    if (!cfg?.valor?.xml) { console.log("A escola ainda nao enviou o arquivo do RCO."); return; }
    const xml = cfg.valor.xml;
    const nomeRco = new Map(registros(xml, "DISCIPLINAS").map((r) => [Number(tag(r, "CODIGO")), tag(r, "NOME")]));
    const turmasRco = registros(xml, "TURMAS").map((r) => ({ cod: Number(tag(r, "CODIGO")), nome: tag(r, "NOME"), abrev: tag(r, "ABREVIATURA"), turno: tag(r, "TURNO"), codIf: Number(tag(r, "COD_TURMA_IF")) || null }));
    const gradeRco = new Map(); // codTurma -> Map(codDisc -> aulas)
    for (const r of registros(xml, "GRADES")) {
      const t = Number(tag(r, "COD_TURMA")), d = Number(tag(r, "COD_DISCIPLINA")), a = Number(tag(r, "AULAS")) || 0;
      if (!gradeRco.has(t)) gradeRco.set(t, new Map());
      gradeRco.get(t).set(d, (gradeRco.get(t).get(d) ?? 0) + a);
    }

    const turmas = (await c.query(
      `SELECT id, nome, turno, codigo_sere, codigo_sere_if FROM turmas WHERE escola_id = $1 ORDER BY turno, nome`, [escolaId])).rows;
    const vinc = (await c.query(
      `SELECT td.turma_id, td.disciplina_id, d.nome, d.codigo_externo_rco AS cod,
              COALESCE(td.carga_horaria_semanal_override, d.carga_semanal) AS carga, td.professor_id
         FROM turma_disciplinas td JOIN disciplinas d ON d.id = td.disciplina_id JOIN turmas t ON t.id = td.turma_id
        WHERE t.escola_id = $1`, [escolaId])).rows;
    const aulas = (await c.query(
      `SELECT h.turma_id, h.disciplina_id, COUNT(*)::int AS n
         FROM horarios h JOIN turmas t ON t.id = h.turma_id
        WHERE t.escola_id = $1 AND COALESCE(h.versao_grade,'oficial') = 'oficial' GROUP BY 1, 2`, [escolaId])).rows;
    const aulasDe = new Map(aulas.map((a) => [`${a.turma_id}|${a.disciplina_id}`, a.n]));

    const usadosRco = new Set();
    let comProblema = 0, totalProblemas = 0;
    const resumo = {};
    const conta = (k) => { resumo[k] = (resumo[k] ?? 0) + 1; totalProblemas++; };
    for (const turno of TURNOS) {
      const lista = turmas.filter((t) => t.turno === turno);
      if (!lista.length) continue;
      console.log(`\n=== ${turno.toUpperCase()} (${lista.length} turmas) ===`);
      let ok = 0;
      for (const t of lista) {
        const linhas = [];
        const cods = [t.codigo_sere, t.codigo_sere_if].filter(Boolean).map(Number);
        cods.forEach((x) => usadosRco.add(x));
        const g = new Map();
        for (const cod of cods) for (const [d, a] of gradeRco.get(cod) ?? []) g.set(d, (g.get(d) ?? 0) + a);
        if (!t.codigo_sere) { linhas.push("turma sem codigo SERE"); conta("turma sem codigo SERE"); }
        else if (!turmasRco.some((r) => cods.includes(r.cod))) { linhas.push(`codigo SERE ${t.codigo_sere} nao existe no arquivo do RCO`); conta("codigo SERE fora do RCO"); }
        const vs = vinc.filter((v) => v.turma_id === t.id);
        const codsVinc = new Set();
        for (const v of vs) {
          const naGrade = aulasDe.get(`${t.id}|${v.disciplina_id}`) ?? 0;
          const avisos = [];
          if (!v.professor_id) { avisos.push("sem professor"); conta("disciplina sem professor"); }
          if (v.cod == null) { avisos.push("sem Codigo Externo"); conta("disciplina sem Codigo Externo"); }
          else {
            codsVinc.add(Number(v.cod));
            if (g.size) {
              const r = g.get(Number(v.cod));
              if (r == null) { avisos.push(`codigo ${v.cod} nao esta na grade do RCO`); conta("codigo fora da grade do RCO da turma"); }
              else if (r !== Number(v.carga)) { avisos.push(`carga ${v.carga} x RCO ${r}`); conta("carga diferente do RCO"); }
            }
          }
          if (naGrade !== Number(v.carga)) { avisos.push(`grade tem ${naGrade} de ${v.carga}`); conta("grade diferente da carga"); }
          if (avisos.length) linhas.push(`${v.nome}: ${avisos.join("; ")}`);
        }
        for (const [d, a] of g) if (!codsVinc.has(d)) { linhas.push(`no RCO e nao vinculada: ${d} ${nomeRco.get(d) ?? "?"} (${a} aula(s))`); conta("disciplina do RCO nao vinculada"); }
        if (linhas.length) { comProblema++; console.log(`\n  ${t.nome} (SERE ${t.codigo_sere ?? "-"}${t.codigo_sere_if ? " / IF " + t.codigo_sere_if : ""})`); linhas.forEach((l) => console.log(`    - ${l}`)); }
        else ok++;
      }
      console.log(`\n  OK sem diferencas: ${ok} de ${lista.length}`);
    }
    const sobrando = turmasRco.filter((r) => !usadosRco.has(r.cod) && !turmasRco.some((x) => x.codIf === r.cod && usadosRco.has(x.cod)));
    if (sobrando.length) {
      console.log(`\nTurmas do RCO que nao existem no NexGrade (${sobrando.length}):`);
      sobrando.forEach((r) => console.log(`  ${r.cod}  ${r.abrev.padEnd(8)} ${r.nome}  turno ${r.turno}`));
      sobrando.forEach(() => conta("turma do RCO fora do NexGrade"));
    }
    console.log(`\nRESUMO: ${turmas.length} turmas no NexGrade, ${turmasRco.length} no RCO · ${comProblema} turma(s) com diferenca · ${totalProblemas} aviso(s)`);
    for (const [k, n] of Object.entries(resumo).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${k}`);
  } finally { await c.end(); }
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
