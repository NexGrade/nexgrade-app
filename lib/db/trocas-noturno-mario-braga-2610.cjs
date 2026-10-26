/**
 * trocas-noturno-mario-braga-2610.cjs
 *
 * Noturno do C.E. Prof. Mario Braga (26/10/2026): 4 trocas de aula para a grade ficar igual
 * ao sistema anterior (a escola confirmou que o certo e o sistema anterior; professores reclamaram do RCO).
 *   2NB      Seg 5a (21:25) <-> Seg 6a (22:10)   Ed. Fisica (Elisangela) <-> Matematica (Anderson)
 *   1NF ADM  Seg 5a (21:25) <-> Seg 6a (22:10)   Matematica (Anderson)   <-> Financas (Felipe)
 *   3NB      Qua 2a (18:45): Quimica I (Viviane) vira Matematica (Carlos). Na leitura de 26/10 a 3NB
 *            tinha Quimica I seg e qua 18:45 (3 aulas; o sistema anterior tem 2) e Matematica so 2 presenciais.
 *   2NC      Seg 4a (20:35) <-> Qui 4a (20:35)   Matematica (Carlos)     <-> Sociologia (Willian)
 *
 * Assincronas que precisam sair do caminho (vao para onde estao no sistema anterior, ou para horario livre):
 *   Carlos   3NC Matematica (ass)  Qua 18:45 -> Ter 18:00   (sistema anterior: 3NC* ter 18:00)
 *   Carlos   3NB Matematica (ass)  Qui 20:35 -> Qua 18:00   (sistema anterior: 3NB* qua 18:00)
 *   Viviane  2NC Robotica (ass)    Seg 18:45 -> Qua 18:45   (choca com a Quimica I presencial; Qua 18:45 fica livre)
 *
 * Nas trocas, so as aulas PRESENCIAIS trocam de lugar. Se o professor tiver, no horario para onde a aula
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
  { turma: "2NC", a: [0, 4], b: [3, 4], esperadoA: ["MATEM", "CARLOS"], esperadoB: ["SOCIO", "WILLIAN"] },
];
// 3NB qua 18:45: a aula presencial passa a ser a disciplina/professor de MODELO (outra aula da mesma turma)
const SUBSTITUICOES = [
  { turma: "3NB", em: [2, 2], esperado: ["QUIMICA I", "VIVIANE"], modelo: ["MATEM", "CARLOS"] },
];
// assincronas movidas antes das trocas: [professor, turma, disciplina] de -> para
const ASSINCRONAS = [
  { prof: "CARLOS", turma: "3NC", disc: "MATEM", de: [2, 2], para: [1, 1] },
  { prof: "CARLOS", turma: "3NB", disc: "MATEM", de: [3, 4], para: [2, 1] },
  { prof: "VIVIANE", turma: "2NC", disc: "ROB", de: [0, 2], para: [2, 2] },
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
      `SELECT h.id, h.turma_id, t.nome AS turma, h.dia_semana, h.numero_aula, h.assincrona, h.fixa, h.disciplina_id,
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

    const movAulas = new Map(); // id -> { dia, aula, de }
    const subst = new Map(); // id -> { disciplina_id, professor_id, disciplina, professor }
    const problemas = [];
    const turmaPorNome = (n) => turmas.find((t) => norm(t.nome) === norm(n));

    // 0a) substituicoes (3NB qua 18:45)
    for (const S of SUBSTITUICOES) {
      const turma = turmaPorNome(S.turma);
      if (!turma) { problemas.push(`Turma ${S.turma} nao encontrada.`); continue; }
      const alvo = aulas.filter((x) => x.turma_id === turma.id && x.dia_semana === S.em[0] && x.numero_aula === S.em[1] && !x.assincrona);
      const modelo = aulas.find((x) => x.turma_id === turma.id && !x.assincrona && norm(x.disciplina).startsWith(S.modelo[0]) && norm(x.professor).startsWith(S.modelo[1]));
      if (alvo.length !== 1 || !(norm(alvo[0].disciplina) === S.esperado[0] && norm(alvo[0].professor).startsWith(S.esperado[1]))) {
        problemas.push(`${S.turma} ${lugar(...S.em)}: esperava so ${S.esperado.join("/")}, encontrei ${alvo.map((x) => `${x.disciplina}/${x.professor}`).join(" + ") || "nada"}`);
        continue;
      }
      if (!modelo) { problemas.push(`${S.turma}: nao achei aula de ${S.modelo.join("/")} para copiar.`); continue; }
      subst.set(alvo[0].id, { disciplina_id: modelo.disciplina_id, professor_id: modelo.professor_id, disciplina: modelo.disciplina, professor: modelo.professor });
      console.log(`\n== ${S.turma} ${lugar(...S.em)}: ${alvo[0].disciplina} (${alvo[0].professor}) passa a ser ${modelo.disciplina} (${modelo.professor})`);
    }
    // 0b) assincronas que saem do caminho
    console.log("\n== Assincronas movidas");
    for (const A of ASSINCRONAS) {
      const xs = aulas.filter((x) => x.assincrona && norm(x.professor).startsWith(A.prof) && norm(x.turma) === norm(A.turma) &&
        norm(x.disciplina).startsWith(A.disc) && x.dia_semana === A.de[0] && x.numero_aula === A.de[1]);
      if (xs.length !== 1) { problemas.push(`${A.prof}: esperava 1 assincrona ${A.turma} ${A.disc}... em ${lugar(...A.de)}, encontrei ${xs.length}.`); continue; }
      const temDisp = disps.some((d) => d.professor_id === xs[0].professor_id && d.dia_semana === A.para[0] && d.horario_slot === A.para[1] && (d.hora_atividade_obrigatoria || d.disponivel === false));
      if (temDisp) { problemas.push(`${xs[0].professor}: tem HA/bloqueio em ${lugar(...A.para)}, a assincrona nao pode ir para la.`); continue; }
      movAulas.set(xs[0].id, { dia: A.para[0], aula: A.para[1], de: A.de, fixo: true });
      console.log(`   ${xs[0].professor}: ${xs[0].turma} ${xs[0].disciplina} (ass) ${lugar(...A.de)} -> ${lugar(...A.para)}`);
    }

    // 1) confere e planeja as trocas das presenciais
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
    for (const x of aulas.filter((a) => movAulas.has(a.id) && !movAulas.get(a.id).fixo)) {
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
    const profDe = (y) => (subst.has(y.id) ? subst.get(y.id).professor_id : y.professor_id);
    const ocup = new Map();
    for (const y of aulas) {
      const p = pos(y);
      const k = `${profDe(y)}|${p.dia}|${p.aula}`;
      if (!ocup.has(k)) ocup.set(k, []);
      ocup.get(k).push(y);
    }
    const tocados = new Set([...aulas.filter((a) => movAulas.has(a.id) || subst.has(a.id)).map((a) => a.professor_id), ...[...subst.values()].map((v) => v.professor_id)]);
    for (const [k, ys] of ocup) {
      const [pid, d, a] = k.split("|").map(Number);
      if (!tocados.has(pid)) continue;
      const turmasDif = new Set(ys.map((y) => y.turma_id));
      if (ys.length > 1 && (turmasDif.size > 1 || ys.some((y) => y.assincrona) && ys.some((y) => !y.assincrona))) problemas.push(`${ys[0].professor} ficaria em ${lugar(d, a)} com ${ys.map((y) => `${y.turma} ${y.disciplina}${y.assincrona ? " (ass)" : ""}`).join(" + ")}`);
    }
    if (problemas.length) {
      console.log("\nNADA FOI FEITO. Conflitos:");
      problemas.forEach((p) => console.log("  - " + p));
      return;
    }

    for (const [id, v] of subst) {
      const x = aulas.find((a) => a.id === id);
      if (disps.some((d) => d.professor_id === v.professor_id && d.dia_semana === x.dia_semana && d.horario_slot === x.numero_aula && (d.hora_atividade_obrigatoria || d.disponivel === false)))
        problemas.push(`${v.professor} tem HA/bloqueio em ${lugar(x.dia_semana, x.numero_aula)}.`);
    }
    if (problemas.length) {
      console.log("\nNADA FOI FEITO. Conflitos:");
      problemas.forEach((p) => console.log("  - " + p));
      return;
    }
    console.log(`\nTotal: ${subst.size} aula(s) trocando de disciplina/professor, ${movAulas.size} aula(s) e ${movDisp.size} marcacao(oes) de HA/bloqueio a mover. Conferencia final: sem professor em dois lugares.`);
    if (!APLICAR) { console.log("\nENSAIO: nada foi gravado. Para gravar: node trocas-noturno-mario-braga-2610.cjs --aplicar"); return; }

    const dir = path.join(__dirname, "_arquivo");
    fs.mkdirSync(dir, { recursive: true });
    const arq = path.join(dir, `backup-trocas-noturno-mario-braga-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(arq, JSON.stringify({
      aulas: aulas.filter((a) => movAulas.has(a.id) || subst.has(a.id)).map((a) => ({ id: a.id, dia_semana: a.dia_semana, numero_aula: a.numero_aula, disciplina_id: a.disciplina_id, professor_id: a.professor_id })),
      disponibilidade: disps.filter((d) => movDisp.has(d.id)).map((d) => ({ id: d.id, dia_semana: d.dia_semana, horario_slot: d.horario_slot })),
    }, null, 2));
    await c.query("BEGIN");
    for (const [id, v] of subst) await c.query(`UPDATE horarios SET disciplina_id = $1, professor_id = $2 WHERE id = $3 AND escola_id = $4`, [v.disciplina_id, v.professor_id, id, ESCOLA_ID]);
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
