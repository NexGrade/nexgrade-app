// [CORRIGIR-DISCIPLINAS-MANHA-ROMARIO-2410] (24/10/2026) A grade da manha do Romario ja esta com as
// aulas nos mesmos horarios do Urania de 24/10, mas em 4 casos o mesmo professor, na mesma turma,
// esta com as DUAS disciplinas trocadas de lugar. Este script so troca a disciplina dessas aulas
// para ficar igual ao Urania. Nao muda horario, professor nem HA. Faz backup antes de gravar.
// Uso (na pasta lib\db):  node corrigir-disciplinas-manha-romario-2410.cjs            (dry-run)
//                         node corrigir-disciplinas-manha-romario-2410.cjs --aplicar
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const APLICAR = process.argv.includes("--aplicar");
const ESCOLA = "org_3JxLX0hl4xYxiHbrUIIabRHaAO9";
const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex"];
// professor no Urania | professor no banco | turma | sigla A -> nome | sigla B -> nome (null = a outra disciplina dele na turma)
const CASOS = [
  { ura: "FÁBIO", prof: "f_bio%", turma: "1ADM", a: ["E.MARK", "Estrat%Marketing%"], b: ["ART", "Arte%"] },
  { ura: "SIMONE", prof: "simone%", turma: "3ADM", a: ["AD.FIN", "Administra%Financeira%"], b: ["C.FIN", "Controladoria%"] },
  { ura: "GRAZIELE", prof: "graziele%", turma: "1M.AMB", a: ["E.AMB", "Educa%Ambiental%"], b: ["G.RES", "Gest%Res%duo%"] },
  { ura: "JOÃO LIN", prof: "jo_o lin", turma: "1ADM", a: ["P.ECON", "Princ%Econom%"], b: ["T.INT.", null] },
];

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
  const mudar = [], problemas = [];
  for (const k of CASOS) {
    const ps = (await c.query("select id, nome from professores where escola_id=$1 and nome ilike $2", [ESCOLA, k.prof])).rows;
    const t = (await c.query("select id, nome from turmas where escola_id=$1 and nome=$2 and turno='matutino'", [ESCOLA, k.turma])).rows[0];
    if (ps.length !== 1 || !t) { problemas.push(`${k.ura} ${k.turma}: professor ${ps.length} / turma ${t ? "ok" : "nao achada"}`); continue; }
    const p = ps[0];
    const aulas = (await c.query(
      `select h.id, h.dia_semana, h.numero_aula, h.disciplina_id, d.nome disc from horarios h join disciplinas d on d.id=h.disciplina_id
        where h.turma_id=$1 and h.professor_id=$2 and coalesce(h.versao_grade,'oficial')='oficial' and h.numero_aula<=6`, [t.id, p.id])).rows;
    const discs = (await c.query(
      `select distinct d.id, d.nome from turma_disciplinas td join disciplinas d on d.id=td.disciplina_id where td.turma_id=$1 and td.professor_id=$2`, [t.id, p.id])).rows;
    const casa = (pat) => discs.filter((d) => new RegExp("^" + pat.replace(/%/g, ".*").replace(/_/g, "."), "i").test(d.nome.normalize("NFD").replace(/[̀-ͯ]/g, "")) || new RegExp("^" + pat.replace(/%/g, ".*").replace(/_/g, "."), "i").test(d.nome));
    const da = casa(k.a[1]);
    let db = k.b[1] ? casa(k.b[1]) : discs.filter((d) => !da.some((x) => x.id === d.id));
    if (da.length !== 1 || db.length !== 1) { problemas.push(`${p.nome} ${t.nome}: disciplinas nao identificadas (A: ${da.map((d) => d.nome).join(", ") || "-"} | B: ${db.map((d) => d.nome).join(", ") || "-"} | vinculos: ${discs.map((d) => d.nome).join(", ")})`); continue; }
    const alvo = { [k.a[0]]: da[0], [k.b[0]]: db[0] };
    console.log(`\n== ${p.nome} ${t.nome}: ${k.a[0]} = ${da[0].nome} | ${k.b[0]} = ${db[0].nome}`);
    for (let d = 0; d < 5; d++) for (let a = 1; a <= 6; a++) {
      const cel = (ura[k.ura].grade[DIAS[d]][a - 1] || "").trim();
      if (!cel.includes("/")) continue;
      const [tu, sg] = cel.split("/");
      if (tu.replace(/\s/g, "") !== k.turma || !alvo[sg]) continue;
      const h = aulas.find((x) => x.dia_semana === d && x.numero_aula === a);
      if (!h) { problemas.push(`${p.nome} ${DIAS[d]} ${a}a ${k.turma}: aula nao encontrada no banco`); continue; }
      const certa = alvo[sg];
      const txt = `  ${DIAS[d]} ${a}a  Urania ${cel.padEnd(14)} banco: ${h.disc}`;
      if (h.disciplina_id === certa.id) console.log(txt + "  (ja certo)");
      else { console.log(txt + `  -> ${certa.nome}`); mudar.push({ id: h.id, de: h.disciplina_id, para: certa.id }); }
    }
  }
  console.log(`\nResumo: ${mudar.length} aulas trocam de disciplina (mesmo horario, mesmo professor).`);
  if (problemas.length) { console.log(`\nATENCAO (${problemas.length}):`); problemas.forEach((x) => console.log("  - " + x)); }
  if (!APLICAR) { console.log("\nDRY-RUN: nada foi alterado. Rode com --aplicar."); await c.end(); return; }
  if (problemas.length) { console.log("\nNAO GRAVADO: resolva os itens de ATENCAO antes."); await c.end(); return; }
  const pasta = path.join(__dirname, "_arquivo"); if (!fs.existsSync(pasta)) fs.mkdirSync(pasta);
  const arq = path.join(pasta, `backup-disciplinas-manha-romario-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(arq, JSON.stringify(mudar, null, 1));
  console.log(`Backup: ${arq}`);
  await c.query("BEGIN");
  try {
    for (const m of mudar) await c.query("update horarios set disciplina_id=$1 where id=$2 and disciplina_id=$3", [m.para, m.id, m.de]);
    await c.query("COMMIT");
  } catch (e) { await c.query("ROLLBACK"); throw e; }
  console.log("\nGRAVADO.");
  await c.end();
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
