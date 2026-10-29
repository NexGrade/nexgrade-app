/**
 * [CONFERIR-GRADE-HERACLITO] (28/10/2026) SO LEITURA. Compara a grade oficial do Heraclito no NexGrade
 * com os relatorios do sistema anterior:
 *  1) por turma: disciplina de cada horario (Relatorio de Turmas Geral, manha e tarde, 26/10,
 *     dados\heraclito-grade-26-10.json + 3ºA Ed. Fisica do Fabio, dados\heraclito-3A-edfisica-28-10.json);
 *  2) por professor: em que turma cada professor esta em cada horario (Relatorio de Professores Individual,
 *     manha, tarde e noite, dados\heraclito-disponibilidade-26-10.json; noite: aula N do relatorio = N+1).
 * Aulas assincronas ficam fora da comparacao (o relatorio nao mostra). Lista completa em _arquivo.
 * Uso (em lib\db):  node conferir-grade-heraclito.cjs
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const ESCOLA = process.env.ESCOLA_ID || "esc_279086285f70451298dc1f31";
const DIA = ["Seg", "Ter", "Qua", "Qui", "Sex"];
const DIAS = { Seg: 0, Ter: 1, Qua: 2, Qui: 3, Sex: 4 };
const TURNO_C = { matutino: "manha", vespertino: "tarde", noturno: "noite" };
const ler = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, "dados", f), "utf8"));
// nome no relatorio -> nomes possiveis no NexGrade (null = ignorar: saiu da escola)
const ALIAS = { "Luiz F.": ["Luiz Fernando"], "Miriana": ["Miriam"], "Sidneia": ["Sidneya"], "Matematica": ["Matematica (vaga)"], "A. Marcos": ["A. Marcos", "Marcos"] };
const ALIAS_TURNO = { matutino: { Fabio: ["Fábio", "Fabio"] }, noturno: { Fabio: null } };

function carregarDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const p = [path.join(__dirname, ".env"), path.join("lib", "db", ".env")].find((f) => fs.existsSync(f));
  const linha = fs.readFileSync(p, "utf8").split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
  return linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}
const chave = (x) => String(x ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const turmaK = (x) => String(x ?? "").replace(/\s+/g, "").toLowerCase();

(async () => {
  const c = new Client({ connectionString: carregarDatabaseUrl(), ssl: process.env.PGSSL === "0" ? false : { rejectUnauthorized: false } });
  await c.connect();
  try {
    const escola = (await c.query("select nome_fantasia from escolas where id=$1", [ESCOLA])).rows[0];
    if (!escola) { console.log("Escola nao encontrada"); return; }
    const aulas = (await c.query(
      `select t.nome turma, t.turno, h.dia_semana dia, h.numero_aula aula, h.assincrona, d.codigo_externo_rco cod, d.nome disc, p.nome prof
         from horarios h join turmas t on t.id=h.turma_id join disciplinas d on d.id=h.disciplina_id join professores p on p.id=h.professor_id
        where t.escola_id=$1 and coalesce(h.versao_grade,'oficial')='oficial'`, [ESCOLA])).rows;
    const pres = aulas.filter((a) => !a.assincrona);
    const linhas = [`Escola: ${escola.nome_fantasia} · ${aulas.length} aulas na grade oficial (${aulas.length - pres.length} assincronas, fora da comparacao)`];
    const out = (s) => { linhas.push(s); };

    // ---------- 1) por turma: disciplina em cada horario ----------
    const esperado = new Map(); // turno|turma|dia|aula -> Set(cod)
    const fonte = [...ler("heraclito-grade-26-10.json").aulas, ...(ler("heraclito-3A-edfisica-28-10.json").aulas ?? [])];
    for (const a of fonte) {
      const k = `${a.turno}|${turmaK(a.turma)}|${a.dia}|${a.aula}`;
      if (!esperado.has(k)) esperado.set(k, { cods: new Set(), discs: new Set(), turma: a.turma });
      esperado.get(k).cods.add(Number(a.cod)); esperado.get(k).discs.add(a.disc);
    }
    const atual = new Map();
    for (const a of pres.filter((x) => x.turno !== "noturno")) {
      const k = `${a.turno}|${turmaK(a.turma)}|${a.dia}|${a.aula}`;
      if (!atual.has(k)) atual.set(k, { cods: new Set(), discs: new Set(), turma: a.turma });
      atual.get(k).cods.add(Number(a.cod)); atual.get(k).discs.add(a.disc);
    }
    const difTurma = [];
    for (const k of new Set([...esperado.keys(), ...atual.keys()])) {
      const e = esperado.get(k), a = atual.get(k);
      const [turno, , dia, aula] = k.split("|");
      const rot = `${(e ?? a).turma} ${TURNO_C[turno]} ${DIA[dia]} ${aula}a`;
      if (!a) difTurma.push(`${rot}: no relatorio ${[...e.discs].join(" + ")}, no NexGrade vazio`);
      else if (!e) difTurma.push(`${rot}: no relatorio vazio, no NexGrade ${[...a.discs].join(" + ")}`);
      else if ([...e.cods].sort().join() !== [...a.cods].sort().join()) difTurma.push(`${rot}: relatorio ${[...e.discs].join(" + ")} x NexGrade ${[...a.discs].join(" + ")}`);
    }
    out(`\n1) POR TURMA (manha e tarde): ${esperado.size} horarios no relatorio · ${difTurma.length} diferenca(s)`);
    difTurma.sort().forEach((d) => out("   " + d));

    // ---------- 2) por professor: turma em cada horario ----------
    const disp = ler("heraclito-disponibilidade-26-10.json").turnos;
    const profsDb = [...new Set(aulas.map((a) => a.prof))];
    const achar = (nome, turno) => {
      const at = ALIAS_TURNO[turno] && nome in ALIAS_TURNO[turno] ? ALIAS_TURNO[turno][nome] : (ALIAS[nome] ?? [nome]);
      if (at === null) return null;
      for (const n of at) { const p = profsDb.find((x) => chave(x) === chave(n)); if (p) return p; }
      return undefined;
    };
    const difProf = [], semCadastro = [], usados = new Set();
    let horarios = 0;
    for (const [turno, profs] of Object.entries(disp)) {
      for (const [nomeRel, cels] of Object.entries(profs)) {
        const p = achar(nomeRel, turno);
        if (p === null) { out(`   (ignorado: ${nomeRel} na ${TURNO_C[turno]}, saiu da escola)`); continue; }
        const rel = new Map();
        for (const [cel, v] of Object.entries(cels)) {
          if (!v || v === "X" || v === "HA") continue;
          rel.set(`${DIAS[cel.slice(0, 3)]}|${Number(cel.slice(3)) + (turno === "noturno" ? 1 : 0)}`, v);
        }
        horarios += rel.size;
        if (p === undefined) { if (rel.size) semCadastro.push(`${nomeRel} (${TURNO_C[turno]}, ${rel.size} aulas)`); continue; }
        usados.add(`${p}|${turno}`);
        const db = new Map();
        for (const a of pres.filter((x) => x.prof === p && x.turno === turno)) {
          const k = `${a.dia}|${a.aula}`;
          db.set(k, [...new Set([...(db.get(k) ?? "").split(", ").filter(Boolean), a.turma])].join(", "));
        }
        for (const k of new Set([...rel.keys(), ...db.keys()])) {
          const [d, au] = k.split("|");
          const r = rel.get(k), n = db.get(k);
          if (r && n && turmaK(r) === turmaK(n)) continue;
          difProf.push(`${p} ${TURNO_C[turno]} ${DIA[d]} ${au}a: relatorio ${r ?? "livre"} x NexGrade ${n ?? "livre"}`);
        }
      }
    }
    const foraRel = [...new Set(pres.map((a) => `${a.prof}|${a.turno}`))].filter((k) => !usados.has(k));
    for (const k of foraRel) {
      const [p, turno] = k.split("|");
      const n = pres.filter((a) => a.prof === p && a.turno === turno).length;
      difProf.push(`${p} ${TURNO_C[turno]}: nao esta no relatorio e tem ${n} aula(s) no NexGrade`);
    }
    out(`\n2) POR PROFESSOR (manha, tarde e noite): ${horarios} aulas no relatorio · ${difProf.length} diferenca(s)`);
    difProf.sort().forEach((d) => out("   " + d));
    if (semCadastro.length) out(`   No relatorio sem cadastro no NexGrade: ${semCadastro.join(", ")}`);

    const pasta = path.join(__dirname, "_arquivo"); fs.mkdirSync(pasta, { recursive: true });
    const arq = path.join(pasta, `conferencia-grade-heraclito.txt`);
    fs.writeFileSync(arq, linhas.join("\r\n"), "utf8");
    // na tela: resumo + ate 40 diferencas de cada
    console.log(linhas[0]);
    console.log(`\n1) POR TURMA (manha e tarde): ${difTurma.length} diferenca(s)`); difTurma.sort().slice(0, 40).forEach((d) => console.log("   " + d));
    console.log(`\n2) POR PROFESSOR (manha, tarde e noite): ${difProf.length} diferenca(s)`); difProf.sort().slice(0, 40).forEach((d) => console.log("   " + d));
    if (semCadastro.length) console.log(`   No relatorio sem cadastro no NexGrade: ${semCadastro.join(", ")}`);
    console.log(`\nLista completa: ${arq}`);
  } finally { await c.end(); }
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
