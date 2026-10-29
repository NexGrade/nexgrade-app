/**
 * [CODOCENCIA-RECOMPOSICAO-HERACLITO] (28/10/2026) Troca as "(vaga)" de Recomposicao do Heraclito pelos
 * dois professores que dao a aula juntos, como no "Relatorio de Professores (Individual)" do sistema
 * anterior (26/10): cada aula de Recomposicao tem um titular e um professor de apoio (co-docencia).
 * Para cada vaga:
 *  - cadastra o professor que ainda nao existe (e-mail provisorio sem-email.<nome>@pendente.invalid);
 *  - turma_disciplinas: professor = titular, professor_apoio = apoio;
 *  - grade oficial: a aula da vaga passa para o titular e ganha uma copia para o apoio (mesmo horario);
 *  - habilitacao (professor_disciplinas) dos dois na disciplina;
 *  - tira HA automatica que estiver nesses horarios (a HA e recalculada depois);
 *  - apaga a vaga, que fica sem nada.
 * Recusa tudo se algum dos dois ja tiver aula em outra turma no mesmo horario, ou bloqueio real.
 * Uso (em lib\db):  node codocencia-recomposicao-heraclito.cjs            (ensaio)
 *                   node codocencia-recomposicao-heraclito.cjs --aplicar
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const APLICAR = process.argv.includes("--aplicar");
const ESCOLA = process.env.ESCOLA_ID || "esc_279086285f70451298dc1f31";
const DIA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
// vaga -> [titular, apoio]
const PARES = {
  "REC 9 Mat1 (vaga)": ["José Raul", "Luciane"],
  "REC 9 Mat2 (vaga)": ["Rosalina", "Luciane"],
  "Rec PORT1 (vaga)": ["Caroline", "Vanda"],
  "Rec PORT2 (vaga)": ["Elen", "Vanda"],
  "Rec PORT3 (vaga)": ["Manoel", "Vanda"],
  "Rec Mat (vaga)": ["Paulo Enzo", "Joseane"],
  "Rec Mat1 (vaga)": ["Altair", "Joseane"],
  "Rec Mat2 (vaga)": ["Francisco", "Joseane"],
  "Rec Mat3 (vaga)": ["Luiz Fernando", "Francisco"],
  "Rec Mat4 (vaga)": ["Altair", "Francisco"],
  "Rec Mat5 (vaga)": ["Robston", "Francisco"],
};

function carregarDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const p = [path.join(__dirname, ".env"), path.join("lib", "db", ".env")].find((f) => fs.existsSync(f));
  const linha = fs.readFileSync(p, "utf8").split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
  return linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}
const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "");

(async () => {
  const c = new Client({ connectionString: carregarDatabaseUrl(), ssl: process.env.PGSSL === "0" ? false : { rejectUnauthorized: false } });
  await c.connect();
  try {
    const escola = (await c.query("select nome_fantasia from escolas where id=$1", [ESCOLA])).rows[0];
    if (!escola) { console.log("Escola nao encontrada"); return; }
    console.log(`Escola: ${escola.nome_fantasia}`);
    const profs = (await c.query("select id, nome from professores where escola_id=$1", [ESCOLA])).rows;
    const porNome = new Map(profs.map((p) => [p.nome, p]));
    const novos = [...new Set(Object.values(PARES).flat())].filter((n) => !porNome.has(n));
    console.log(`Professores novos: ${novos.join(", ") || "nenhum"}`);

    const plano = { tds: [], mover: [], copiar: [], tirarHa: [], vagas: [], problemas: [] };
    const ocupa = new Map(); // "prof|turno|dia|aula" -> turma (aulas que ja existem, fora das vagas)
    const todas = (await c.query(
      `select h.professor_id, h.turma_id, t.nome turma, t.turno, h.dia_semana, h.numero_aula from horarios h join turmas t on t.id=h.turma_id
        where t.escola_id=$1 and coalesce(h.versao_grade,'oficial')='oficial'`, [ESCOLA])).rows;
    for (const a of todas) ocupa.set(`${a.professor_id}|${a.turno}|${a.dia_semana}|${a.numero_aula}`, a.turma);

    for (const [vagaNome, [tit, apo]] of Object.entries(PARES)) {
      const vaga = porNome.get(vagaNome);
      if (!vaga) { plano.problemas.push(`vaga "${vagaNome}" nao encontrada`); continue; }
      const idT = porNome.get(tit)?.id ?? null, idA = porNome.get(apo)?.id ?? null; // null = novo
      const aulas = (await c.query(
        `select h.*, t.nome turma, t.turno, d.nome disc from horarios h join turmas t on t.id=h.turma_id join disciplinas d on d.id=h.disciplina_id
          where h.professor_id=$1 and coalesce(h.versao_grade,'oficial')='oficial' order by t.nome, h.dia_semana, h.numero_aula`, [vaga.id])).rows;
      const tds = (await c.query("select td.*, t.nome turma, d.nome disc from turma_disciplinas td join turmas t on t.id=td.turma_id join disciplinas d on d.id=td.disciplina_id where td.professor_id=$1", [vaga.id])).rows;
      plano.vagas.push({ id: vaga.id, nome: vagaNome, aulas: aulas.length, tds: tds.length });
      for (const td of tds) plano.tds.push({ id: td.id, turma: td.turma, disc: td.disc, tit, apo, antes: { professor_id: td.professor_id, professor_apoio_id: td.professor_apoio_id } });
      for (const h of aulas) {
        const rot = `${h.turma} ${DIA[h.dia_semana]} ${h.numero_aula}a`;
        for (const [nome, id] of [[tit, idT], [apo, idA]]) {
          if (id == null) continue;
          const outra = ocupa.get(`${id}|${h.turno}|${h.dia_semana}|${h.numero_aula}`);
          if (outra) plano.problemas.push(`${nome} ja tem aula na ${outra} em ${DIA[h.dia_semana]} ${h.numero_aula}a (${h.turno})`);
          const disp = (await c.query(
            "select * from disponibilidade_professores where professor_id=$1 and dia_semana=$2 and horario_slot=$3 and (turno=$4 or turno is null)",
            [id, h.dia_semana, h.numero_aula, h.turno])).rows;
          for (const d of disp) {
            if (d.hora_atividade_obrigatoria) plano.tirarHa.push({ ...d, quem: nome, rot });
            else if (!d.disponivel) plano.problemas.push(`${nome} tem bloqueio em ${rot}: ${d.motivo ?? "indisponivel"}`);
          }
          ocupa.set(`${id}|${h.turno}|${h.dia_semana}|${h.numero_aula}`, h.turma);
        }
        plano.mover.push({ id: h.id, para: tit, rot, disc: h.disc });
        plano.copiar.push({ base: h, para: apo });
      }
    }

    console.log("");
    for (const v of plano.vagas) {
      const [tit, apo] = PARES[v.nome];
      const turmas = [...new Set(plano.mover.filter((m) => m.para === tit && plano.tds.some((t) => t.tit === tit && t.apo === apo)).map((m) => m.rot.split(" ")[0]))];
      console.log(`${v.nome.padEnd(18)} -> titular ${tit.padEnd(13)} apoio ${apo.padEnd(9)} · ${v.aulas} aula(s), ${v.tds} vinculo(s)`);
    }
    for (const t of plano.tds) console.log(`   ${t.turma} ${t.disc}: ${t.tit} + ${t.apo}`);
    console.log(`\nResumo: ${novos.length} professor(es) novo(s) · ${plano.tds.length} vinculos · ${plano.mover.length} aulas passam para o titular · ${plano.copiar.length} aulas novas do apoio · ${plano.tirarHa.length} HA tirada(s) desses horarios · ${plano.vagas.length} vagas apagadas`);
    if (plano.tirarHa.length) console.log(`   HA tirada: ${plano.tirarHa.map((d) => `${d.quem} ${d.rot}`).join("; ")}`);
    if (plano.problemas.length) { console.log(`\nATENCAO (${plano.problemas.length}) - nada sera gravado:`); for (const p of plano.problemas) console.log("  - " + p); return; }
    if (!APLICAR) { console.log("\nENSAIO: nada foi gravado. Para gravar, rode de novo com --aplicar."); return; }

    const pasta = path.join(__dirname, "_arquivo"); fs.mkdirSync(pasta, { recursive: true });
    const arq = path.join(pasta, `backup-codocencia-heraclito-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    const vagaIds = plano.vagas.map((v) => v.id);
    const backup = {
      vagas: (await c.query("select * from professores where id = any($1)", [vagaIds])).rows,
      horarios: (await c.query("select * from horarios where professor_id = any($1)", [vagaIds])).rows,
      turmaDisciplinas: (await c.query("select * from turma_disciplinas where professor_id = any($1)", [vagaIds])).rows,
      professorDisciplinas: (await c.query("select * from professor_disciplinas where professor_id = any($1)", [vagaIds])).rows,
      disponibilidadeVagas: (await c.query("select * from disponibilidade_professores where professor_id = any($1)", [vagaIds])).rows,
      haTirada: plano.tirarHa,
    };
    fs.writeFileSync(arq, JSON.stringify(backup, null, 1));
    await c.query("BEGIN");
    try {
      const id = new Map([...porNome].map(([n, p]) => [n, p.id]));
      for (const n of novos) {
        const r = await c.query("insert into professores (escola_id, nome, email) values ($1,$2,$3) returning id", [ESCOLA, n, `sem-email.${slug(n)}@pendente.invalid`]);
        id.set(n, r.rows[0].id);
      }
      for (const t of plano.tds) await c.query("update turma_disciplinas set professor_id=$1, professor_apoio_id=$2 where id=$3", [id.get(t.tit), id.get(t.apo), t.id]);
      for (const m of plano.mover) await c.query("update horarios set professor_id=$1 where id=$2", [id.get(m.para), m.id]);
      for (const a of plano.copiar) {
        const h = a.base;
        await c.query(
          `insert into horarios (escola_id, turma_id, disciplina_id, professor_id, dia_semana, numero_aula, sala, versao_grade, assincrona, fixa)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [h.escola_id, h.turma_id, h.disciplina_id, id.get(a.para), h.dia_semana, h.numero_aula, h.sala, h.versao_grade ?? "oficial", h.assincrona, h.fixa]);
      }
      const habil = new Set();
      for (const t of plano.tds) {
        const td = (await c.query("select disciplina_id from turma_disciplinas where id=$1", [t.id])).rows[0];
        for (const n of [t.tit, t.apo]) habil.add(`${id.get(n)}|${td.disciplina_id}`);
      }
      for (const k of habil) {
        const [p, d] = k.split("|").map(Number);
        const ja = (await c.query("select 1 from professor_disciplinas where professor_id=$1 and disciplina_id=$2", [p, d])).rows.length;
        if (!ja) await c.query("insert into professor_disciplinas (professor_id, disciplina_id) values ($1,$2)", [p, d]);
      }
      if (plano.tirarHa.length) await c.query("delete from disponibilidade_professores where id = any($1)", [plano.tirarHa.map((d) => d.id)]);
      await c.query("delete from professores where id = any($1) and escola_id=$2", [vagaIds, ESCOLA]);
      await c.query("COMMIT");
    } catch (e) { await c.query("ROLLBACK"); throw e; }
    console.log(`\nGRAVADO. Backup: ${arq}`);
    console.log("Proximo passo: importar a disponibilidade (tracos) e recalcular a HA.");
  } finally { await c.end(); }
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
