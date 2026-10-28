/**
 * importar-grade-anterior.cjs  [ENSAIO por padrao; grava so com --aplicar]
 * Importa a grade que a escola usa hoje (sistema anterior), ja convertida em JSON
 * (lib/db/dados/<escola>-grade-<data>.json: turno, turma, dia 0-4, aula, cod = Codigo Externo, prof):
 *  - cria os professores que faltam (nome como no sistema anterior; e-mail provisorio
 *    "sem-email.<nome>@pendente.invalid", que nao entra em lugar nenhum ate a escola trocar pelo real);
 *    nomes de vaga (Rec Mat1, REC 9 Mat2, Matematica...) ganham " (vaga)" no fim;
 *  - poe o professor no vinculo turma x disciplina (so onde ainda esta vazio) e em professor_disciplinas;
 *  - grava as aulas na grade OFICIAL (horarios, versao_grade 'oficial').
 * Confere antes: turma existe, disciplina (Codigo Externo) esta vinculada a turma, aulas = carga,
 * professor em dois lugares no mesmo turno/dia/aula, e turma que ja tem grade oficial (pula).
 * Aula com "assincrona": true entra na grade como assincrona. "modalidades" (opcional) grava em
 * turma_disciplinas as aulas assincronas por semana e o grupo do trio (so onde ainda esta no padrao).
 * Nao mexe em HA, disponibilidade, turmas nem disciplinas.
 * Uso (em lib\db):
 *   node importar-grade-anterior.cjs esc_xxx dados\heraclito-grade-26-10.json
 *   node importar-grade-anterior.cjs esc_xxx dados\heraclito-grade-26-10.json --aplicar
 *   --juntar="Luiz F.=Luiz Fernando"   (dois nomes da mesma pessoa; o da direita fica)
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const ARGS = process.argv.slice(2);
const APLICAR = ARGS.includes("--aplicar");
const [ESCOLA_ID, ARQ] = ARGS.filter((a) => !a.startsWith("--"));
const JUNTAR = new Map((ARGS.find((a) => a.startsWith("--juntar=")) ?? "--juntar=").slice(9).split(";").filter(Boolean)
  .map((p) => p.split("=").map((s) => s.trim())));
const ehVaga = (n) => /^(rec\b|rec\s|matematica$)/i.test(n.normalize("NFD").replace(/[̀-ͯ]/g, ""));
const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex"];

function carregarDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const p = [path.join(__dirname, ".env"), path.join("lib", "db", ".env")].find((f) => fs.existsSync(f));
  const linha = fs.readFileSync(p, "utf8").split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
  return linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}
const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "");

(async () => {
  if (!ESCOLA_ID || !ARQ) { console.log("Uso: node importar-grade-anterior.cjs esc_xxx dados\\arquivo.json [--aplicar]"); return; }
  const dados = JSON.parse(fs.readFileSync(path.resolve(ARQ), "utf8"));
  const aulas = dados.aulas.map((a) => ({ ...a, prof: JUNTAR.get(a.prof) ?? a.prof }));
  const c = new Client({ connectionString: carregarDatabaseUrl(), ssl: process.env.PGSSL === "0" ? false : { rejectUnauthorized: false } });
  await c.connect();
  try {
    const escola = (await c.query(`SELECT nome_fantasia FROM escolas WHERE id = $1`, [ESCOLA_ID])).rows[0];
    if (!escola) { console.log("Escola nao encontrada:", ESCOLA_ID); return; }
    console.log(`Escola: ${escola.nome_fantasia}\nArquivo: ${ARQ} (${aulas.length} aulas) · ${dados.fonte ?? ""}`);
    if (JUNTAR.size) console.log("Juntando nomes:", [...JUNTAR].map(([a, b]) => `${a} -> ${b}`).join(", "));

    const turmas = (await c.query(`SELECT id, nome, turno FROM turmas WHERE escola_id = $1`, [ESCOLA_ID])).rows;
    const vinc = (await c.query(
      `SELECT td.id, td.turma_id, td.disciplina_id, td.professor_id, d.codigo_externo_rco AS cod, d.nome,
              COALESCE(td.carga_horaria_semanal_override, d.carga_semanal) AS carga
         FROM turma_disciplinas td JOIN disciplinas d ON d.id = td.disciplina_id JOIN turmas t ON t.id = td.turma_id
        WHERE t.escola_id = $1`, [ESCOLA_ID])).rows;
    const profs = (await c.query(`SELECT id, nome, email FROM professores WHERE escola_id = $1`, [ESCOLA_ID])).rows;
    const comGrade = new Set((await c.query(
      `SELECT DISTINCT h.turma_id FROM horarios h JOIN turmas t ON t.id = h.turma_id
        WHERE t.escola_id = $1 AND COALESCE(h.versao_grade,'oficial') = 'oficial'`, [ESCOLA_ID])).rows.map((r) => r.turma_id));

    const erros = [], avisos = [];
    const turmaDe = (a) => turmas.find((t) => t.nome === a.turma && t.turno === a.turno);
    const grupos = new Map(); // turmaId|cod -> { turma, vinculo, aulas[], profs Map }
    for (const a of aulas) {
      const t = turmaDe(a);
      if (!t) { erros.push(`turma ${a.turma} (${a.turno}) nao existe`); continue; }
      const v = vinc.filter((x) => x.turma_id === t.id && Number(x.cod) === Number(a.cod));
      if (v.length !== 1) { erros.push(`${a.turma}: disciplina ${a.disc} (codigo ${a.cod}) ${v.length ? "vinculada " + v.length + " vezes" : "nao esta na turma"}`); continue; }
      const k = `${t.id}|${a.cod}`;
      if (!grupos.has(k)) grupos.set(k, { turma: t, vinculo: v[0], aulas: [], profs: new Map() });
      const g = grupos.get(k); g.aulas.push(a); g.profs.set(a.prof, (g.profs.get(a.prof) ?? 0) + 1);
    }
    for (const t of turmas.filter((x) => aulas.some((a) => a.turma === x.nome && a.turno === x.turno))) {
      for (const v of vinc.filter((x) => x.turma_id === t.id))
        if (![...grupos.values()].some((g) => g.vinculo.id === v.id)) avisos.push(`${t.nome}: ${v.nome} nao tem nenhuma aula no arquivo (carga ${v.carga})`);
    }
    for (const g of grupos.values()) {
      if (g.aulas.length !== Number(g.vinculo.carga)) avisos.push(`${g.turma.nome}: ${g.vinculo.nome} tem ${g.aulas.length} aulas na grade e carga ${g.vinculo.carga}`);
      if (g.profs.size > 1) avisos.push(`${g.turma.nome}: ${g.vinculo.nome} com ${g.profs.size} professores (${[...g.profs].map(([p, n]) => p + " " + n).join(", ")}); o vinculo fica com o de mais aulas`);
    }
    // modalidades (assincronas por semana e trio)
    const modal = (dados.modalidades ?? []).map((m) => {
      const t = turmas.find((x) => x.nome === m.turma && x.turno === m.turno);
      const v = t && vinc.find((x) => x.turma_id === t.id && Number(x.cod) === Number(m.cod));
      if (!v) erros.push(`modalidade: ${m.turma} codigo ${m.cod} nao encontrado`);
      return v ? { ...m, vinculoId: v.id, nome: v.nome } : null;
    }).filter(Boolean);
    if (modal.length) console.log(`\nModalidades: ${modal.map((m) => `${m.turma} ${m.nome}: ${m.aulasAssincronas ?? 0} assincrona(s)${m.grupoTrio ? ", trio " + m.grupoTrio : ""}`).join(" · ")}`);
    const uso = new Map();
    for (const a of aulas) { const k = `${a.turno}|${a.prof}|${a.dia}|${a.aula}`; uso.set(k, [...(uso.get(k) ?? []), a.turma]); }
    const nAss = aulas.filter((a) => a.assincrona).length;
    if (nAss) console.log(`Aulas assincronas no arquivo: ${nAss}`);
    for (const [k, ts] of uso) if (ts.length > 1) { const [tu, p, d, au] = k.split("|"); erros.push(`${p} em ${ts.join(" e ")} na ${DIAS[d]} ${au}a aula (${tu})`); }
    const turmasArq = [...new Set(aulas.map((a) => turmaDe(a)?.id).filter(Boolean))];
    const pular = turmasArq.filter((id) => comGrade.has(id));
    if (pular.length) avisos.push(`ja tem grade oficial e sera pulada: ${pular.map((id) => turmas.find((t) => t.id === id).nome).join(", ")}`);

    // professores
    const nomes = [...new Set(aulas.map((a) => a.prof))].sort((a, b) => a.localeCompare(b, "pt"));
    const nomeFinal = (n) => (ehVaga(n) ? `${n} (vaga)` : n);
    const plano = nomes.map((n) => ({ orig: n, nome: nomeFinal(n), existente: profs.find((p) => p.nome === nomeFinal(n)) ?? null, vaga: ehVaga(n) }));
    const novos = plano.filter((p) => !p.existente);
    const pessoas = plano.filter((p) => !p.vaga), vagas = plano.filter((p) => p.vaga);
    console.log(`\nProfessores no arquivo: ${pessoas.length} pessoas + ${vagas.length} vagas · a criar: ${novos.length}`);
    console.log("  " + pessoas.map((p) => `${p.nome}${p.existente ? " (ja existe)" : ""}`).join(", "));
    console.log("  Vagas: " + vagas.map((p) => p.nome).join(", "));
    const parecidos = [];
    const base = (s) => slug(s).split(".")[0];
    for (let i = 0; i < pessoas.length; i++) for (let j = i + 1; j < pessoas.length; j++)
      if (base(pessoas[i].nome) === base(pessoas[j].nome) || slug(pessoas[i].nome).replace(/[sz]/g, "") === slug(pessoas[j].nome).replace(/[sz]/g, "")) parecidos.push(`${pessoas[i].nome} / ${pessoas[j].nome}`);
    if (parecidos.length) console.log(`  Nomes parecidos (confira se sao a mesma pessoa; se for, use --juntar): ${parecidos.join(" · ")}`);

    // resumo por turno
    const porTurno = {};
    for (const a of aulas) { const t = turmaDe(a); if (t && !comGrade.has(t.id)) porTurno[a.turno] = (porTurno[a.turno] ?? 0) + 1; }
    console.log(`\nAulas a gravar na grade oficial: ${Object.entries(porTurno).map(([t, n]) => `${t} ${n}`).join(" · ")} · vinculos com professor: ${grupos.size}`);
    if (avisos.length) { console.log(`\nAvisos (${avisos.length}):`); avisos.forEach((a) => console.log("  " + a)); }
    if (erros.length) { console.log(`\nATENCAO (${erros.length}):`); [...new Set(erros)].forEach((e) => console.log("  " + e)); }

    if (!APLICAR) { console.log("\nENSAIO: nada foi gravado. Para gravar, rode de novo com --aplicar."); return; }
    if (erros.length) { console.log("\nNao gravei: resolva os itens de ATENCAO antes."); return; }

    const reg = { escolaId: ESCOLA_ID, arquivo: ARQ, em: new Date().toISOString(), professores: [], vinculos: [], profDisc: [], horarios: 0, turmas: [] };
    await c.query("BEGIN");
    try {
      const idProf = new Map();
      for (const p of plano) {
        if (p.existente) { idProf.set(p.orig, p.existente.id); continue; }
        const email = `sem-email.${slug(p.nome)}@pendente.invalid`;
        const r = await c.query(`INSERT INTO professores (escola_id, nome, email) VALUES ($1, $2, $3) RETURNING id`, [ESCOLA_ID, p.nome, email]);
        idProf.set(p.orig, r.rows[0].id); reg.professores.push({ id: r.rows[0].id, nome: p.nome });
      }
      const pdFeitos = new Set((await c.query(`SELECT professor_id, disciplina_id FROM professor_disciplinas pd JOIN professores p ON p.id = pd.professor_id WHERE p.escola_id = $1`, [ESCOLA_ID])).rows.map((r) => `${r.professor_id}|${r.disciplina_id}`));
      for (const g of grupos.values()) {
        const principal = [...g.profs].sort((a, b) => b[1] - a[1])[0][0];
        const pid = idProf.get(principal);
        if (g.vinculo.professor_id == null) {
          await c.query(`UPDATE turma_disciplinas SET professor_id = $1 WHERE id = $2 AND professor_id IS NULL`, [pid, g.vinculo.id]);
          reg.vinculos.push(g.vinculo.id);
        }
        for (const nomeP of g.profs.keys()) {
          const k = `${idProf.get(nomeP)}|${g.vinculo.disciplina_id}`;
          if (pdFeitos.has(k)) continue;
          await c.query(`INSERT INTO professor_disciplinas (professor_id, disciplina_id) VALUES ($1, $2)`, [idProf.get(nomeP), g.vinculo.disciplina_id]);
          pdFeitos.add(k); reg.profDisc.push(k);
        }
      }
      for (const g of grupos.values()) {
        if (comGrade.has(g.turma.id)) continue;
        for (const a of g.aulas) {
          await c.query(
            `INSERT INTO horarios (escola_id, turma_id, disciplina_id, professor_id, dia_semana, numero_aula, versao_grade, assincrona) VALUES ($1, $2, $3, $4, $5, $6, 'oficial', $7)`,
            [ESCOLA_ID, g.turma.id, g.vinculo.disciplina_id, idProf.get(a.prof), a.dia, a.aula, !!a.assincrona]);
          reg.horarios++;
        }
        if (!reg.turmas.includes(g.turma.id)) reg.turmas.push(g.turma.id);
      }
      reg.modalidades = [];
      for (const m of modal) {
        const r = await c.query(
          `UPDATE turma_disciplinas SET aulas_assincronas = $1, grupo_trio = COALESCE(grupo_trio, $2) WHERE id = $3 AND aulas_assincronas = 0`,
          [m.aulasAssincronas ?? 0, m.grupoTrio ?? null, m.vinculoId]);
        if (r.rowCount) reg.modalidades.push(m.vinculoId);
      }
      await c.query("COMMIT");
    } catch (e) { await c.query("ROLLBACK"); throw e; }
    const pasta = path.join(__dirname, "_arquivo"); fs.mkdirSync(pasta, { recursive: true });
    const arqReg = path.join(pasta, `importar-grade-${ESCOLA_ID}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(arqReg, JSON.stringify(reg, null, 2));
    const n = (await c.query(`SELECT COUNT(*)::int n FROM horarios WHERE escola_id = $1 AND COALESCE(versao_grade,'oficial') = 'oficial'`, [ESCOLA_ID])).rows[0].n;
    console.log(`\nGRAVADO: ${reg.professores.length} professores, ${reg.vinculos.length} vinculos com professor, ${reg.horarios} aulas na grade oficial (${reg.turmas.length} turmas). Aulas oficiais da escola agora: ${n}. Registro: ${arqReg}`);
  } finally { await c.end(); }
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
