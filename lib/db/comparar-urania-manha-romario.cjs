// [COMPARAR-URANIA-MANHA-ROMARIO] (24/10/2026) SOMENTE LEITURA - nao grava nada.
// Compara o Urania da manha do Romario (PDF de 24/10, ja convertido em
// urania-manha-romario-2026-10-24.json) com a grade OFICIAL do NexGrade:
// aula por aula (professor x dia x aula x turma), HA e bloqueios.
// Uso (na pasta lib\db):  node comparar-urania-manha-romario.cjs
const fs = require("fs");
const { Client } = require("pg");
const ESCOLA = "org_3JxLX0hl4xYxiHbrUIIabRHaAO9";
const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex"];
const ALIAS = {
  "JULIANEM": "%juliana m%", "FLAVIAAP": "fl_via a%", "FRANCILLE": "francielle salome%", "NATAL": "%natal%",
  "LUIZA": "luiz%", "MATEUSZ": "mateus z%", "EVBANCODEDADOSMG": "%est_dio%banco%",
  "EVMETSISTMG": "%est_dio%an_lise%", "EVIRTUAL": "%est_dio%mobile%", "GEOGRAFIA": "%geografia%9me%",
};
const IGNORAR = ["RECOMMAT"];
const norm = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const ehHA = (x) => /^H\.?A/i.test(x);

function lerDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const m = fs.readFileSync(".env", "utf8").match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m);
  if (!m) throw new Error("DATABASE_URL nao definido");
  return m[1];
}

(async () => {
  const ura = JSON.parse(fs.readFileSync("urania-manha-romario-2026-10-24.json", "utf8"));
  const c = new Client({ connectionString: lerDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  const profs = (await c.query("select id, nome from professores where escola_id=$1", [ESCOLA])).rows;
  const aulas = (await c.query(
    `select h.professor_id, h.dia_semana, h.numero_aula, t.nome turma, d.nome disc, coalesce(h.assincrona,false) assinc
       from horarios h join turmas t on t.id=h.turma_id join disciplinas d on d.id=h.disciplina_id
      where h.escola_id=$1 and t.turno='matutino' and coalesce(h.versao_grade,'oficial')='oficial'`, [ESCOLA])).rows;
  const disp = (await c.query(
    `select professor_id, dia_semana, horario_slot, disponivel, hora_atividade_obrigatoria ha, motivo
       from disponibilidade_professores where professor_id = any($1) and (turno='matutino' or turno is null)`,
    [profs.map((p) => p.id)])).rows;

  const mapa = {}, semPar = [];
  for (const nome of Object.keys(ura)) {
    const k = norm(nome);
    if (IGNORAR.includes(k)) continue;
    let ps = profs.filter((p) => norm(p.nome) === k);
    if (!ps.length && ALIAS[k]) ps = (await c.query("select id, nome from professores where escola_id=$1 and nome ilike $2", [ESCOLA, ALIAS[k]])).rows;
    if (!ps.length) ps = profs.filter((p) => norm(p.nome).startsWith(k) || k.startsWith(norm(p.nome)));
    if (ps.length > 1) { const iguais = ps.filter((p) => !/\(/.test(p.nome)); if (iguais.length === 1) ps = iguais; }
    if (ps.length === 1) mapa[nome] = ps[0]; else semPar.push(`${nome} -> ${ps.length ? ps.map((p) => p.nome).join(" | ") : "nenhum"}`);
  }
  console.log(`Professores ligados: ${Object.keys(mapa).length} | sem par: ${semPar.length}`);
  for (const s of semPar) console.log("  SEM PAR: " + s);

  const idsUra = new Set(Object.values(mapa).map((p) => p.id));
  const linhasAula = [], linhasHA = [], linhasOutros = [];
  for (const [nome, p] of Object.entries(mapa)) {
    const g = ura[nome].grade;
    for (let d = 0; d < 5; d++) for (let a = 1; a <= 6; a++) {
      const u = (g[DIAS[d]][a - 1] || "").trim();
      const nx = aulas.filter((x) => x.professor_id === p.id && x.dia_semana === d && x.numero_aula === a && !(x.assinc && a === 7));
      const ds = disp.filter((x) => x.professor_id === p.id && x.dia_semana === d && x.horario_slot === a);
      const nxHA = ds.some((x) => x.ha);
      const nxBloq = ds.filter((x) => !x.ha && x.disponivel === false);
      const rot = `${p.nome.padEnd(22)} ${DIAS[d]} ${a}a`;
      const descNx = nx.length ? nx.map((x) => x.turma + (x.assinc ? "(assinc)" : "")).join("+")
        : nxHA ? "HA" : nxBloq.length ? (nxBloq.map((b) => b.motivo || "indisponivel").join("; ")).slice(0, 40) : "livre";
      if (u.includes("/")) {
        const turmaU = u.split("/")[0];
        const ok = nx.some((x) => norm(x.turma) === norm(turmaU));
        if (!ok) linhasAula.push(`${rot}  Urania: ${u.padEnd(16)} NexGrade: ${descNx}`);
      } else if (ehHA(u)) {
        if (!nxHA) linhasHA.push(`${rot}  Urania: ${u.padEnd(16)} NexGrade: ${descNx}`);
      } else {
        if (nx.length && !/^R\.9M$/.test(u)) linhasAula.push(`${rot}  Urania: ${(u || "(vazio)").padEnd(16)} NexGrade: ${descNx}`);
        else if (nxHA) linhasHA.push(`${rot}  Urania: ${(u || "(vazio)").padEnd(16)} NexGrade: HA`);
        else if (u === "---" && !nxBloq.length && !nx.length) linhasOutros.push(`${rot}  Urania: traco (bloqueado)   NexGrade: livre`);
        else if (u === "" && nxBloq.length && !nx.length) linhasOutros.push(`${rot}  Urania: livre             NexGrade: ${descNx}`);
      }
    }
  }
  const fora = [...new Set(aulas.filter((x) => !idsUra.has(x.professor_id)).map((x) => profs.find((p) => p.id === x.professor_id)?.nome))];
  console.log(`\n== AULAS diferentes (${linhasAula.length})`); linhasAula.forEach((l) => console.log(l));
  console.log(`\n== HORA-ATIVIDADE diferente (${linhasHA.length})`); linhasHA.forEach((l) => console.log(l));
  console.log(`\n== BLOQUEIOS diferentes (${linhasOutros.length})`); linhasOutros.forEach((l) => console.log(l));
  console.log(`\nProfessores com aula de manha no NexGrade e fora do Urania: ${fora.join(", ") || "nenhum"}`);
  console.log(`Aulas: Urania ${Object.values(ura).reduce((s, v) => s + Object.values(v.grade).flat().filter((x) => x.includes("/")).length, 0)} | NexGrade ${aulas.length}`);
  console.log("\nSOMENTE LEITURA: nada foi alterado.");
  await c.end();
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
