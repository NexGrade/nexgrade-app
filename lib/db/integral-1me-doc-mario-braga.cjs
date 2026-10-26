/**
 * integral-1me-doc-mario-braga.cjs
 *
 * Passa a 1ME DOC (Formacao de Docentes) do C.E. Prof. Mario Braga para o turno INTEGRAL
 * (26/10/2026), igual ao RCO:
 *   - manha: as aulas que ja existem (1a a 6a, 07:30 a 11:55) continuam como estao;
 *   - tarde: Pratica de Formacao (Est. Supe) - Turma 01 na SEGUNDA e - Turma 02 na SEXTA,
 *     7a a 11a aula (13:05, 13:55, 15:00, 15:50, 16:40), professor Roberval, aulas fixas.
 * Cria as duas disciplinas (nome igual ao do RCO) se ainda nao existirem, habilita o Roberval
 * nelas e faz o vinculo na turma (5 aulas cada).
 *
 * Antes confere: esquema Integral da escola salvo (11 aulas, 9a as 15:00); a turma nao tem aula
 * da 7a em diante; o Roberval nao tem aula, HA nem bloqueio na tarde de segunda e sexta (no
 * horario real do Vespertino). Se algo nao bater, nao faz nada.
 *
 * Seguro: ensaio por padrao; --aplicar grava numa transacao e guarda backup em lib/db/_arquivo/.
 * Uso (em lib\db):
 *   node integral-1me-doc-mario-braga.cjs            (ensaio)
 *   node integral-1me-doc-mario-braga.cjs --aplicar  (grava)
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8"; // C.E. Prof. Mario B.T. Braga
const CODIGO_SERE_1ME = 2729930;
const APLICAR = process.argv.includes("--aplicar");
const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex"];
const PRATICAS = [
  { nome: "Prática de Formação (Est. Supe) - Turma 01", sigla: "PF T1", dia: 0 },
  { nome: "Prática de Formação (Est. Supe) - Turma 02", sigla: "PF T2", dia: 4 },
];
const AULAS_TARDE = [7, 8, 9, 10, 11];

function carregarDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const p = [path.join(__dirname, ".env"), path.join("lib", "db", ".env")].find((f) => fs.existsSync(f));
  if (!p) throw new Error("DATABASE_URL nao encontrada (defina a variavel ou crie lib/db/.env)");
  const linha = fs.readFileSync(p, "utf8").split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
  return linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const hhmm = (t) => String(t).slice(0, 5);
const min = (h) => { const [a, b] = hhmm(h).split(":").map(Number); return a * 60 + b; };

async function main() {
  const c = new Client({ connectionString: carregarDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  const problemas = [];
  try {
    // 1) esquema integral
    const slots = (await c.query(
      `SELECT turno, nivel_ensino, numero_aula, hora_inicio, duracao_minutos, letivo FROM horario_slots
        WHERE escola_id = $1 AND turno IN ('integral','vespertino') ORDER BY turno, numero_aula`, [ESCOLA_ID])).rows;
    const integral = slots.filter((s) => s.turno === "integral" && s.numero_aula >= 1);
    console.log("== Esquema Integral da escola");
    if (!integral.length) problemas.push("O esquema Integral ainda nao foi salvo (Horario -> Esquema de aulas -> Integral).");
    for (const s of integral) console.log(`   ${s.numero_aula}a ${hhmm(s.hora_inicio)} (${s.duracao_minutos} min)`);
    const s9 = integral.find((s) => s.numero_aula === 9);
    if (integral.length && integral.length !== 11) problemas.push(`O esquema Integral tem ${integral.length} aulas (o RCO tem 11).`);
    if (s9 && hhmm(s9.hora_inicio) !== "15:00") problemas.push(`A 9a aula do Integral esta as ${hhmm(s9.hora_inicio)}; no RCO e 15:00.`);
    // equivalente real (vespertino) de cada aula da tarde, por maior sobreposicao
    const vesp = slots.filter((s) => s.turno === "vespertino" && s.numero_aula >= 1 && s.letivo !== false);
    const real = {};
    for (const n of AULAS_TARDE) {
      const i = integral.find((s) => s.numero_aula === n);
      if (!i) continue;
      let melhor = null, sobreMax = 0;
      for (const v of vesp) {
        const sobre = Math.min(min(i.hora_inicio) + i.duracao_minutos, min(v.hora_inicio) + v.duracao_minutos) - Math.max(min(i.hora_inicio), min(v.hora_inicio));
        if (sobre > sobreMax) { sobreMax = sobre; melhor = v; }
      }
      if (melhor) real[n] = melhor.numero_aula;
    }

    // 2) turma e professor
    const turmas = (await c.query(
      `SELECT id, nome, turno, nivel_ensino, codigo_sere FROM turmas WHERE escola_id = $1 AND (codigo_sere = $2 OR nome ILIKE '%DOC%')`,
      [ESCOLA_ID, CODIGO_SERE_1ME])).rows;
    if (turmas.length !== 1) { problemas.push(`Esperava 1 turma 1ME DOC, encontrei ${turmas.length}: ${turmas.map((t) => t.nome).join(", ")}`); }
    const turma = turmas[0];
    const profs = (await c.query(`SELECT id, nome FROM professores WHERE escola_id = $1 AND nome ILIKE 'ROBERVAL%'`, [ESCOLA_ID])).rows;
    if (profs.length !== 1) problemas.push(`Esperava 1 professor Roberval, encontrei ${profs.length}.`);
    const prof = profs[0];
    if (problemas.length) return fim(problemas);
    console.log(`\n== Turma ${turma.nome} (id ${turma.id}, SERE ${turma.codigo_sere}): turno ${turma.turno} -> integral`);

    const aulasTurma = (await c.query(
      `SELECT h.dia_semana, h.numero_aula, d.nome AS disciplina FROM horarios h JOIN disciplinas d ON d.id = h.disciplina_id
        WHERE h.turma_id = $1 AND COALESCE(h.versao_grade,'oficial') = 'oficial' ORDER BY 1, 2`, [turma.id])).rows;
    console.log(`   aulas atuais: ${aulasTurma.length} (manha: ${aulasTurma.filter((a) => a.numero_aula <= 6).length})`);
    const tarde = aulasTurma.filter((a) => a.numero_aula >= 7);
    if (tarde.length) problemas.push(`A turma ja tem ${tarde.length} aula(s) da 7a em diante: ${tarde.map((a) => `${DIAS[a.dia_semana]} ${a.numero_aula}a ${a.disciplina}`).join("; ")}`);

    // 3) Roberval livre na tarde de seg e sex (horario real do vespertino)
    const aulasProf = (await c.query(
      `SELECT h.dia_semana, h.numero_aula, t.nome AS turma, t.turno FROM horarios h JOIN turmas t ON t.id = h.turma_id
        WHERE h.professor_id = $1 AND COALESCE(h.versao_grade,'oficial') = 'oficial'`, [prof.id])).rows;
    const disps = (await c.query(
      `SELECT dia_semana, horario_slot, turno, hora_atividade_obrigatoria AS ha, disponivel, motivo FROM disponibilidade_professores
        WHERE professor_id = $1 AND turno = 'vespertino' AND (hora_atividade_obrigatoria OR disponivel = false)`, [prof.id])).rows;
    console.log(`\n== ${prof.nome}: tarde de segunda e sexta`);
    for (const P of PRATICAS) for (const n of AULAS_TARDE) {
      const v = real[n];
      if (v == null) { problemas.push(`A ${n}a do Integral nao tem horario equivalente no Vespertino.`); continue; }
      const choque = aulasProf.filter((a) => a.dia_semana === P.dia && ((a.turno === "vespertino" && a.numero_aula === v) || (a.turno === "integral" && a.numero_aula === n)));
      const disp = disps.filter((d) => d.dia_semana === P.dia && d.horario_slot === v);
      if (choque.length) problemas.push(`${DIAS[P.dia]} ${n}a (tarde ${v}a): ja tem aula na ${choque.map((a) => a.turma).join(", ")}`);
      if (disp.length) problemas.push(`${DIAS[P.dia]} ${n}a (tarde ${v}a): ${disp.map((d) => (d.ha ? "HA" : `bloqueio (${d.motivo || ""})`)).join(", ")}`);
    }
    if (problemas.length) return fim(problemas);
    console.log("   livre nos 10 horarios.");

    // 4) disciplinas
    const discs = (await c.query(`SELECT id, nome FROM disciplinas WHERE escola_id = $1`, [ESCOLA_ID])).rows;
    console.log("\n== Disciplinas");
    for (const P of PRATICAS) {
      const achada = discs.filter((d) => norm(d.nome) === norm(P.nome));
      if (achada.length > 1) problemas.push(`Mais de uma disciplina "${P.nome}".`);
      P.id = achada[0]?.id;
      console.log(`   ${P.nome}: ${P.id ? `ja existe (id ${P.id})` : "sera criada"}`);
    }
    const parecidas = discs.filter((d) => norm(d.nome).startsWith("PRATICADEFORMACAO") && !PRATICAS.some((P) => P.id === d.id));
    if (parecidas.length) console.log(`   (existem tambem: ${parecidas.map((d) => `${d.nome} id ${d.id}`).join("; ")} -- nao mexo nelas)`);
    if (problemas.length) return fim(problemas);

    console.log("\n== Aulas novas (fixas)");
    for (const P of PRATICAS) console.log(`   ${DIAS[P.dia]} ${AULAS_TARDE.map((n) => `${n}a ${hhmm(integral.find((s) => s.numero_aula === n).hora_inicio)}`).join(", ")}: ${P.nome} (${prof.nome})`);

    if (!APLICAR) { console.log("\nENSAIO: nada foi gravado. Para gravar: node integral-1me-doc-mario-braga.cjs --aplicar"); return; }

    await c.query("BEGIN");
    const criado = { turma: { id: turma.id, turnoAntes: turma.turno }, disciplinas: [], professorDisciplinas: [], turmaDisciplinas: [], horarios: [] };
    await c.query(`UPDATE turmas SET turno = 'integral' WHERE id = $1 AND escola_id = $2`, [turma.id, ESCOLA_ID]);
    for (const P of PRATICAS) {
      if (!P.id) {
        P.id = (await c.query(`INSERT INTO disciplinas (escola_id, nome, sigla, carga_semanal) VALUES ($1, $2, $3, 5) RETURNING id`, [ESCOLA_ID, P.nome, P.sigla])).rows[0].id;
        criado.disciplinas.push(P.id);
      }
      const pd = await c.query(`SELECT 1 FROM professor_disciplinas WHERE professor_id = $1 AND disciplina_id = $2`, [prof.id, P.id]);
      if (!pd.rowCount) criado.professorDisciplinas.push((await c.query(`INSERT INTO professor_disciplinas (professor_id, disciplina_id) VALUES ($1, $2) RETURNING id`, [prof.id, P.id])).rows[0].id);
      const td = await c.query(`SELECT id FROM turma_disciplinas WHERE turma_id = $1 AND disciplina_id = $2`, [turma.id, P.id]);
      if (!td.rowCount) criado.turmaDisciplinas.push((await c.query(
        `INSERT INTO turma_disciplinas (turma_id, disciplina_id, professor_id, carga_horaria_semanal_override) VALUES ($1, $2, $3, 5) RETURNING id`,
        [turma.id, P.id, prof.id])).rows[0].id);
      for (const n of AULAS_TARDE) criado.horarios.push((await c.query(
        `INSERT INTO horarios (escola_id, turma_id, disciplina_id, professor_id, dia_semana, numero_aula, versao_grade, fixa)
         VALUES ($1, $2, $3, $4, $5, $6, 'oficial', true) RETURNING id`, [ESCOLA_ID, turma.id, P.id, prof.id, P.dia, n])).rows[0].id);
    }
    await c.query("COMMIT");
    const dir = path.join(__dirname, "_arquivo"); fs.mkdirSync(dir, { recursive: true });
    const arq = path.join(dir, `backup-integral-1me-doc-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(arq, JSON.stringify(criado, null, 2));
    console.log(`\nGRAVADO. Para desfazer, o que foi criado/mudado esta em: ${arq}`);
  } catch (e) {
    try { await c.query("ROLLBACK"); } catch {}
    throw e;
  } finally {
    await c.end();
  }
}
function fim(problemas) {
  console.log("\nNADA FOI FEITO:");
  problemas.forEach((p) => console.log("  - " + p));
}
main().catch((e) => { console.error(e); process.exit(1); });
