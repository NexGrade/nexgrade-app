// [ATUALIZAR-MARIO-BRAGA-0211] (31/10/2026) So LE. Depois da atualizacao pelo Urania de 02-06/11, confere
// turma por turma se a quantidade de aulas de cada sigla do Urania bate com a disciplina gravada no banco
// (mesmo professor, mesmo dia e aula). Mostra as celulas em que a disciplina gravada nao e a esperada.
// Uso: node C:\projetos\nexgrade-app\lib\db\conferir-carga-urania-0211.cjs
// Saida completa em _arquivo\conferir-carga-urania-0211.txt
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const ESCOLA = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";
const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex"];
const norm = (s) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const hhmm = (h) => String(h).slice(0, 5);
const linhas = [];
const log = (s = "") => { linhas.push(s); console.log(s); };

(async () => {
  const URA = JSON.parse(fs.readFileSync(path.join(__dirname, "urania-mario-braga-2026-11-02.json"), "utf8"));
  const m = fs.readFileSync(path.join(__dirname, ".env"), "utf8").match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m);
  const c = new Client({ connectionString: process.env.DATABASE_URL || m[1], ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const turmas = (await c.query("select id, nome, turno from turmas where escola_id=$1", [ESCOLA])).rows;
    const profs = (await c.query("select id, nome from professores where escola_id=$1", [ESCOLA])).rows;
    const disc = new Map((await c.query("select id, nome from disciplinas where escola_id=$1", [ESCOLA])).rows.map((r) => [r.id, r.nome]));
    const slots = (await c.query("select turno, nivel_ensino, numero_aula, hora_inicio::text h from horario_slots where escola_id=$1", [ESCOLA])).rows;
    const aulas = (await c.query(
      "select turma_id, disciplina_id, professor_id, dia_semana, numero_aula, assincrona from horarios where escola_id=$1 and coalesce(versao_grade,'oficial')='oficial'", [ESCOLA])).rows;
    const td = (await c.query(
      `select td.turma_id, td.disciplina_id, coalesce(td.carga_horaria_semanal_override, d.carga_semanal) carga, td.professor_id
         from turma_disciplinas td join disciplinas d on d.id=td.disciplina_id join turmas t on t.id=td.turma_id where t.escola_id=$1`, [ESCOLA])).rows;
    const nomeP = (id) => profs.find((p) => p.id === id)?.nome ?? `#${id}`;
    const turmaPorNome = new Map(turmas.map((t) => [norm(t.nome), t]));
    const integral = turmas.find((t) => t.turno === "integral");

    let problemas = 0;
    for (const turno of ["matutino", "vespertino", "noturno"]) {
      const ura = URA[turno];
      const aulaDaHora = new Map();
      for (const s of slots.filter((s) => s.turno === turno).sort((a) => (a.nivel_ensino === "medio_tecnico" ? -1 : 1))) if (!aulaDaHora.has(hhmm(s.h))) aulaDaHora.set(hhmm(s.h), s.numero_aula);
      const NUM = Object.values(ura)[0].slots.map((h) => aulaDaHora.get(h));
      // celulas do Urania por turma: sigla -> [{prof, d, a}]
      const porTurma = new Map();
      for (const [nome, v] of Object.entries(ura)) for (let d = 0; d < 5; d++) NUM.forEach((a, i) => {
        const x = v.grade[DIAS[d]][i] || ""; if (!x.includes("/")) return;
        const [tu, sg] = x.split("/");
        const t = turmaPorNome.get(norm(tu)); if (!t) return;
        const aT = t.turno === "integral" ? a : a; // manha do integral = mesma numeracao (1a a 6a)
        const l = porTurma.get(t.id) || []; l.push({ nome, sg, d, a: aT }); porTurma.set(t.id, l);
      });
      for (const [tid, cels] of porTurma) {
        const t = turmas.find((x) => x.id === tid);
        const doBanco = aulas.filter((h) => h.turma_id === tid && !h.assincrona && (t.turno !== "integral" || h.numero_aula <= 6 || turno !== "matutino"));
        // sigla -> disciplinas gravadas nas mesmas celulas
        const sigDisc = new Map();
        for (const cel of cels) {
          const h = doBanco.filter((x) => x.dia_semana === cel.d && x.numero_aula === cel.a);
          const k = norm(cel.sg);
          const mm = sigDisc.get(k) || { sg: cel.sg, cels: 0, discs: new Map(), profsUra: new Set() };
          mm.cels++; mm.profsUra.add(cel.nome);
          for (const x of h) mm.discs.set(x.disciplina_id, (mm.discs.get(x.disciplina_id) || 0) + 1);
          sigDisc.set(k, mm);
        }
        // carga: disciplinas da turma com menos aulas que a carga
        const faltas = td.filter((v) => v.turma_id === tid && v.carga > 0).map((v) => ({ ...v, n: doBanco.filter((h) => h.disciplina_id === v.disciplina_id).length })).filter((v) => v.n < v.carga);
        const sobras = td.filter((v) => v.turma_id === tid && v.carga > 0).map((v) => ({ ...v, n: doBanco.filter((h) => h.disciplina_id === v.disciplina_id).length })).filter((v) => v.n > v.carga);
        const ambiguas = [...sigDisc.values()].filter((s) => s.discs.size > 1);
        if (!faltas.length && !sobras.length && !ambiguas.length) continue;
        problemas++;
        log(`\n== ${t.nome} (${turno})`);
        for (const f of faltas) log(`   FALTA  ${disc.get(f.disciplina_id)}: ${f.n}/${f.carga} (vinculo: ${nomeP(f.professor_id)})`);
        for (const f of sobras) log(`   SOBRA  ${disc.get(f.disciplina_id)}: ${f.n}/${f.carga} (vinculo: ${nomeP(f.professor_id)})`);
        for (const s of [...sigDisc.values()].sort((a, b) => a.sg.localeCompare(b.sg)))
          log(`   Urania ${s.sg.padEnd(10)} ${String(s.cels).padStart(2)} celula(s) [${[...s.profsUra].join(", ")}] -> gravado: ${[...s.discs].map(([d, n]) => `${disc.get(d)} x${n}`).join(" | ") || "nada"}`);
      }
    }
    log(`\n${problemas} turma(s) com diferenca de carga ou sigla dividida.`);
    void integral;
  } finally {
    await c.end();
    fs.mkdirSync(path.join(__dirname, "_arquivo"), { recursive: true });
    const arq = path.join(__dirname, "_arquivo", "conferir-carga-urania-0211.txt");
    fs.writeFileSync(arq, linhas.join("\r\n"), "utf8");
    console.log(`\nRelatorio completo: ${arq}`);
  }
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
