/**
 * comparar-grade-turma.cjs  [SOMENTE LEITURA]
 * Compara a grade oficial de uma turma do NexGrade com uma grade esperada (ex.: a do RCO),
 * horario por horario. A grade esperada fica num JSON: {"turma":"3MB DES","aulas":[["Seg","08:20","MATEMATICA"],...]}
 * Uso (em lib\db):
 *   node comparar-grade-turma.cjs dados\grade-rco-3MB-DES.json
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8"; // C.E. Prof. Mario B. T. Braga
const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex"];
function carregarDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const p = [path.join(__dirname, ".env"), path.join("lib", "db", ".env")].find((f) => fs.existsSync(f));
  const linha = fs.readFileSync(p, "utf8").split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
  return linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
// nomes do RCO sao abreviados: casa se cada palavra do RCO e inicio de uma palavra do NexGrade (na ordem)
function casa(rco, nex) {
  const a = norm(rco).split(" ").filter((w) => !["DE", "DA", "DO", "DAS", "DOS", "E", "NO", "NA"].includes(w));
  const b = norm(nex).split(" ").filter((w) => !["DE", "DA", "DO", "DAS", "DOS", "E", "NO", "NA"].includes(w));
  let j = 0;
  for (const w of a) { while (j < b.length && !b[j].startsWith(w.replace(/S$/, ""))) j++; if (j >= b.length) return false; j++; }
  return true;
}

(async () => {
  const arq = process.argv[2];
  if (!arq) { console.log("Uso: node comparar-grade-turma.cjs dados\\grade-rco-3MB-DES.json"); return; }
  const esperado = JSON.parse(fs.readFileSync(arq, "utf8"));
  const c = new Client({ connectionString: carregarDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const t = (await c.query(`SELECT id, nome, turno, nivel_ensino FROM turmas WHERE escola_id = $1 AND nome ILIKE $2`, [ESCOLA_ID, esperado.turma])).rows;
    if (t.length !== 1) { console.log(`Turmas "${esperado.turma}": ${t.length}`); return; }
    const turma = t[0];
    const slots = (await c.query(
      `SELECT numero_aula, to_char(hora_inicio,'HH24:MI') AS hora FROM horario_slots
        WHERE escola_id = $1 AND turno = $2 AND (nivel_ensino IS NOT DISTINCT FROM $3) ORDER BY numero_aula`,
      [ESCOLA_ID, turma.turno, turma.turno === "matutino" ? turma.nivel_ensino : null])).rows;
    const aulaDaHora = new Map(slots.map((s) => [s.hora, s.numero_aula]));
    const horaDaAula = new Map(slots.map((s) => [s.numero_aula, s.hora]));
    console.log(`Turma ${turma.nome} (id ${turma.id}) · esquema ${turma.turno}${turma.nivel_ensino ? "/" + turma.nivel_ensino : ""}: ${slots.map((s) => `${s.numero_aula}a ${s.hora}`).join(" · ")}`);

    const nex = (await c.query(
      `SELECT h.id, h.dia_semana, h.numero_aula, d.nome AS disc, p.nome AS prof, h.assincrona
         FROM horarios h JOIN disciplinas d ON d.id = h.disciplina_id JOIN professores p ON p.id = h.professor_id
        WHERE h.turma_id = $1 AND COALESCE(h.versao_grade,'oficial') = 'oficial'`, [turma.id])).rows;
    const vinc = (await c.query(
      `SELECT d.nome, COALESCE(td.carga_horaria_semanal_override, d.carga_semanal) AS carga, p.nome AS prof
         FROM turma_disciplinas td JOIN disciplinas d ON d.id = td.disciplina_id LEFT JOIN professores p ON p.id = td.professor_id
        WHERE td.turma_id = $1 ORDER BY d.nome`, [turma.id])).rows;

    const semHora = esperado.aulas.filter(([, h]) => !aulaDaHora.has(h));
    if (semHora.length) console.log(`\nATENCAO: horarios do RCO que nao existem no esquema: ${[...new Set(semHora.map((x) => x[1]))].join(", ")}`);

    let iguais = 0; const difs = [];
    const chaves = new Set([...esperado.aulas.map(([d, h]) => `${DIAS.indexOf(d)}|${aulaDaHora.get(h)}`), ...nex.map((x) => `${x.dia_semana}|${x.numero_aula}`)]);
    for (const k of [...chaves].sort()) {
      const [dia, aula] = k.split("|").map(Number);
      const esp = esperado.aulas.filter(([d, h]) => DIAS.indexOf(d) === dia && aulaDaHora.get(h) === aula).map((x) => x[2]);
      const tem = nex.filter((x) => x.dia_semana === dia && x.numero_aula === aula);
      const ok = esp.length === tem.length && esp.every((e) => tem.some((x) => casa(e, x.disc)));
      if (ok) { iguais++; continue; }
      difs.push(`  ${DIAS[dia]} ${aula}a (${horaDaAula.get(aula) ?? "?"})  RCO: ${esp.join(" + ") || "-"}   |   NexGrade: ${tem.map((x) => `${x.disc} (${x.prof})${x.assincrona ? " [assinc]" : ""} [id ${x.id}]`).join(" + ") || "-"}`);
    }
    console.log(`\nHorarios iguais: ${iguais}   Diferentes: ${difs.length}`);
    if (difs.length) { console.log("\nDiferencas:"); difs.forEach((d) => console.log(d)); }
    console.log("\nVinculos da turma no NexGrade:");
    vinc.forEach((v) => console.log(`  ${v.nome.padEnd(45)} carga ${v.carga}  ${v.prof ?? "SEM PROFESSOR"}`));
  } finally { await c.end(); }
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
