/**
 * trocas-noturno-mario-braga-2610.cjs
 *
 * Noturno do C.E. Prof. Mario Braga (26/10/2026): 4 trocas de aula para a grade ficar igual
 * ao Urania (a escola confirmou que o certo e o Urania; professores reclamaram do RCO).
 *   2NB      Seg 5a (21:25) <-> Seg 6a (22:10)   Ed. Fisica (Elisangela) <-> Matematica (Anderson)
 *   1NF ADM  Seg 5a (21:25) <-> Seg 6a (22:10)   Matematica (Anderson)   <-> Financas (Felipe)
 *   3NB      Seg 2a (18:45) <-> Qua 2a (18:45)   Matematica (Carlos)     <-> Quimica I (Viviane)
 *   2NC      Seg 4a (20:35) <-> Qui 4a (20:35)   Matematica (Carlos)     <-> Sociologia (Willian)
 *
 * So as aulas PRESENCIAIS trocam de lugar. Se o professor tiver, no horario para onde a aula
 * vai, uma ASSINCRONA ou uma HA/bloqueio, ela vai para o horario que ele deixou livre
 * (troca dele mesmo; nao muda a carga). Antes de mexer confere se cada horario tem a
 * disciplina/professor esperados; se nao tiver, nao faz nada.
 *
 * Seguro: ensaio por padrao; com --aplicar grava numa transacao e guarda backup em
 * lib/db/_arquivo/. Dias: 0 = segunda ... 4 = sexta. Aula 1 do noturno = 18:00.
 *
 * Uso (em lib\db):
 *   node trocas-noturno-mario-braga-2610.cjs            (ensaio: so mostra)
 *   node trocas-noturno-mario-braga-2610.cjs --aplicar  (grava)
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8"; // C.E. Prof. Mario B.T. Braga
const TURNO = "noturno";
const APLICAR = process.argv.includes("--aplicar");
const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex"];
const HORA = { 1: "18:00", 2: "18:45", 3: "19:35", 4: "20:35", 5: "21:25", 6: "22:10" };

// a / b = [dia, aula]; esperado = inicio do nome da disciplina e do professor HOJE em cada lado
const TROCAS = [
  { turma: "2NB", a: [0, 5], b: [0, 6], esperadoA: ["EDUCA", "ELISANGELA"], esperadoB: ["MATEM", "ANDERSON"] },
  { turma: "1NF ADM", a: [0, 5], b: [0, 6], esperadoA: ["MATEM", "ANDERSON"], esperadoB: ["FINAN", "FELIPE"] },
  { turma: "3NB", a: [0, 2], b: [2, 2], esperadoA: ["MATEM", "CARLOS"], esperadoB: ["QU", "VIVIANE"] },
  { turma: "2NC", a: [0, 4], b: [3, 4], esperadoA: ["MATEM", "CARLOS"], esperadoB: ["SOCIO", "WILLIAN"] },
];

function carregarDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const p = [path.join(__dirname, ".env"), path.join("lib", "db", ".env")].find((f) => fs.existsSync(f));
  if (!p) throw new Error("DATABASE_URL nao encontrada (defina a variavel ou crie lib/db/.env)");
  const linha = fs.readFileSync(p, "utf8").split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
  if (!linha) throw new Error("DATABASE_URL nao encontrada no .env");
  return linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
const lugar = (d, a) => `${DIAS[d]} ${a}a (${HORA[a] || "?"})`;

async function main() {
  const c = new Client({ connectionString: carregarDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const turmas = (await c.query(
      `SELECT id, nome FROM turmas WHERE escola_id = $1 AND turno = $2`, [ESCOLA_ID, TURNO])).rows;
    const aulas = (await c.query(
      `SELECT h.id, h.turma_id, t.nome AS turma, h.dia_semana, h.numero_aula, h.assincrona, h.fixa,
              h.professor_id, p.nome AS professor, d.nome AS disciplina
         FROM horarios h
         JOIN turmas t ON t.id = h.turma_id
         JOIN professores p ON p.id = h.professor_id
         JOIN disciplinas d ON d.id = h.disciplina_id
        WHERE h.escola_id = $1 AND t.turno = $2 AND COALESCE(h.versao_grade, 'oficial') = 'oficial'`,
      [ESCOLA_ID, TURNO])).rows;
    const profIds = [...new Set(aulas.map((a) => a.professor_id))];
    const disps = (await c.query(
      `SELECT id, professor_id, dia_semana, horario_slot, turno, hora_atividade_obrigatoria, disponivel, motivo
         FROM disponibilidade_professores WHERE professor_id = ANY($1) AND (turno = $2 OR turno IS NULL)`,
      [profIds, TURNO])).rows;

    // 1) confere e planeja as trocas das presenciais
    const movAulas = new Map(); // id -> { dia, aula, de }
    const problemas = [];
    for (const T of TROCAS) {
      const turma = turmas.find((t) => norm(t.nome) === norm(T.turma));
      if (!turma) { problemas.push(`Turma ${T.turma} nao encontrada no noturno.`); continue; }
      const lado = ([d, a]) => aulas.filter((x) => x.turma_id === turma.id && x.dia_semana === d && x.numero_aula === a && !x.assincrona);
      const A = lado(T.a), B = lado(T.b);
      const confere = (xs, [disc, prof], onde) => {
        if (!xs.length) { problemas.push(`${T.turma} ${onde}: sem aula presencial.`); return; }
        if (!xs.some((x) => norm(x.disciplina).startsWith(disc) && norm(x.professor).startsWith(prof)))
          problemas.push(`${T.turma} ${onde}: esperava ${disc}.../${prof}, encontrei ${xs.map((x) => `${x.disciplina}/${x.professor}`).join(" + ")}`);
      };
      confere(A, T.esperadoA, lugar(...T.a));
      confere(B, T.esperadoB, lugar(...T.b));
      console.log(`\n== ${T.turma}: ${lugar(...T.a)} <-> ${lugar(...T.b)}`);
      for (const x of A) { console.log(`   ${lugar(...T.a)} -> ${lugar(...T.b)}: ${x.disciplina} (${x.professor})${x.fixa ? " [fixa]" : ""}`); movAulas.set(x.id, { dia: T.b[0], aula: T.b[1], de: T.a }); }
      for (const x of B) { console.log(`   ${lugar(...T.b)} -> ${lugar(...T.a)}: ${x.disciplina} (${x.professor})${x.fixa ? " [fixa]" : ""}`); movAulas.set(x.id, { dia: T.a[0], aula: T.a[1], de: T.b }); }
    }
    if (problemas.length) {
      console.log("\nNADA FOI FEITO. A grade nao esta como esperado:");
      problemas.forEach((p) => console.log("  - " + p));
      return;
    }

    // 2) professor: assincrona ou HA/bloqueio no horario de destino vai para o horario que ele deixou
    const pos = (x) => (movAulas.has(x.id) ? movAulas.get(x.id) : { dia: x.dia_semana, aula: x.numero_aula });
    const movDisp = new Map();
    console.log("\n== Ajustes do professor (assincrona / HA no horario para onde a aula foi)");
    let ajustes = 0;
    for (const x of aulas.filter((a) => movAulas.has(a.id))) {
      const m = movAulas.get(x.id);
      const [deDia, deAula] = m.de;
      // o professor ainda tem outra aula presencial no horario que deixou? entao nao ha horario livre para devolver
      const livre = () => !aulas.some((y) => y.professor_id === x.professor_id && y.id !== x.id && !y.assincrona && pos(y).dia === deDia && pos(y).aula === deAula);
      for (const y of aulas) {
        if (y.professor_id !== x.professor_id || !y.assincrona || movAulas.has(y.id)) continue;
        if (y.dia_semana === m.dia && y.numero_aula === m.aula) {
          if (!livre()) { problemas.push(`${x.professor}: assincrona ${y.turma} ${y.disciplina} em ${lugar(m.dia, m.aula)} sem horario livre para ir.`); continue; }
          movAulas.set(y.id, { dia: deDia, aula: deAula, de: [m.dia, m.aula] });
          console.log(`   ${x.professor}: assincrona ${y.turma} ${y.disciplina} ${lugar(m.dia, m.aula)} -> ${lugar(deDia, deAula)}`);
          ajustes++;
        }
      }
      for (const d of disps) {
        if (d.professor_id !== x.professor_id || movDisp.has(d.id)) continue;
        const ocupa = d.hora_atividade_obrigatoria || d.disponivel === false;
        if (!ocupa || d.dia_semana !== m.dia || d.horario_slot !== m.aula) continue;
        const jaTemNoLivre = disps.some((e) => e.professor_id === d.professor_id && e.id !== d.id && e.dia_semana === deDia && e.horario_slot === deAula && !movDisp.has(e.id));
        if (jaTemNoLivre) { problemas.push(`${x.professor}: ${d.hora_atividade_obrigatoria ? "HA" : "bloqueio"} em ${lugar(m.dia, m.aula)} e o horario que ele deixou (${lugar(deDia, deAula)}) ja tem outra marcacao.`); continue; }
        movDisp.set(d.id, { dia: deDia, aula: deAula });
        console.log(`   ${x.professor}: ${d.hora_atividade_obrigatoria ? "HA" : `bloqueio (${d.motivo || ""})`} ${lugar(m.dia, m.aula)} -> ${lugar(deDia, deAula)}`);
        ajustes++;
      }
    }
    if (!ajustes) console.log("   (nenhum)");

    // 3) conferencia final: professor em dois lugares ao mesmo tempo (presencial x presencial ou x assincrona)
    const ocup = new Map();
    for (const y of aulas) {
      const p = pos(y);
      const k = `${y.professor_id}|${p.dia}|${p.aula}`;
      if (!ocup.has(k)) ocup.set(k, []);
      ocup.get(k).push(y);
    }
    const tocados = new Set(aulas.filter((a) => movAulas.has(a.id)).map((a) => a.professor_id));
    for (const [k, ys] of ocup) {
      const [pid, d, a] = k.split("|").map(Number);
      if (!tocados.has(pid)) continue;
      const turmasDif = new Set(ys.map((y) => y.turma_id));
      if (ys.length > 1 && turmasDif.size > 1) problemas.push(`${ys[0].professor} ficaria em ${lugar(d, a)} com ${ys.map((y) => `${y.turma} ${y.disciplina}${y.assincrona ? " (ass)" : ""}`).join(" + ")}`);
    }
    if (problemas.length) {
      console.log("\nNADA FOI FEITO. Conflitos:");
      problemas.forEach((p) => console.log("  - " + p));
      return;
    }

    console.log(`\nTotal: ${movAulas.size} aula(s) e ${movDisp.size} marcacao(oes) de HA/bloqueio a mover. Conferencia final: sem professor em dois lugares.`);
    if (!APLICAR) { console.log("\nENSAIO: nada foi gravado. Para gravar: node trocas-noturno-mario-braga-2610.cjs --aplicar"); return; }

    const dir = path.join(__dirname, "_arquivo");
    fs.mkdirSync(dir, { recursive: true });
    const arq = path.join(dir, `backup-trocas-noturno-mario-braga-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(arq, JSON.stringify({
      aulas: aulas.filter((a) => movAulas.has(a.id)).map((a) => ({ id: a.id, dia_semana: a.dia_semana, numero_aula: a.numero_aula })),
      disponibilidade: disps.filter((d) => movDisp.has(d.id)).map((d) => ({ id: d.id, dia_semana: d.dia_semana, horario_slot: d.horario_slot })),
    }, null, 2));
    await c.query("BEGIN");
    for (const [id, m] of movAulas) await c.query(`UPDATE horarios SET dia_semana = $1, numero_aula = $2 WHERE id = $3 AND escola_id = $4`, [m.dia, m.aula, id, ESCOLA_ID]);
    for (const [id, m] of movDisp) await c.query(`UPDATE disponibilidade_professores SET dia_semana = $1, horario_slot = $2 WHERE id = $3`, [m.dia, m.aula, id]);
    await c.query("COMMIT");
    console.log(`\nGRAVADO. Backup (posicoes antigas): ${arq}`);
  } catch (e) {
    try { await c.query("ROLLBACK"); } catch {}
    throw e;
  } finally {
    await c.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
