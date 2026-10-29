// [SOMENTE LEITURA] SituaÃ§Ã£o atual da 1ME DOC (FormaÃ§Ã£o de Docentes) e dos
// esquemas de aula do MÃ¡rio Braga, antes de criar o turno Integral.
// Uso (em lib\db):  node conferir-integral-1me.cjs
const { Client } = require("pg");
const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8"; // C.E. Prof. MÃ¡rio B.T. Braga
const DIAS = ["", "Seg", "Ter", "Qua", "Qui", "Sex", "SÃ¡b"];

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const t = await c.query(
      `SELECT id, nome, turno, nivel_ensino, serie, codigo_sere, fantasma
         FROM turmas WHERE escola_id = $1 AND (nome ILIKE '%DOC%' OR codigo_sere = 2729930)`,
      [ESCOLA_ID]);
    console.log("== Turma(s) ==");
    console.table(t.rows);
    if (!t.rows.length) return;
    const turmaId = t.rows[0].id;

    const td = await c.query(
      `SELECT d.nome AS disciplina, d.codigo_externo_rco AS cod_rco,
              COALESCE(td.carga_horaria_semanal_override, 0) AS carga_override,
              p.nome AS professor
         FROM turma_disciplinas td
         JOIN disciplinas d ON d.id = td.disciplina_id
         LEFT JOIN professores p ON p.id = td.professor_id
        WHERE td.turma_id = $1 ORDER BY d.nome`, [turmaId]);
    console.log("\n== VÃ­nculos turma x disciplina ==");
    console.table(td.rows);

    const h = await c.query(
      `SELECT h.dia_semana, h.numero_aula, d.nome AS disciplina, p.nome AS professor
         FROM horarios h
         LEFT JOIN disciplinas d ON d.id = h.disciplina_id
         LEFT JOIN professores p ON p.id = h.professor_id
        WHERE h.turma_id = $1 AND COALESCE(h.versao_grade,'oficial') = 'oficial' ORDER BY h.dia_semana, h.numero_aula`, [turmaId]);
    console.log(`\n== Grade oficial da turma (${h.rows.length} aulas) ==`);
    for (const r of h.rows) console.log(`${DIAS[r.dia_semana]} ${r.numero_aula}Âª  ${r.disciplina}  â€”  ${r.professor ?? "(sem professor)"}`);

    const s = await c.query(
      `SELECT turno, nivel_ensino, numero_aula, to_char(hora_inicio,'HH24:MI') AS inicio,
              duracao_minutos AS min, letivo
         FROM horario_slots WHERE escola_id = $1 AND turno IN ('matutino','vespertino')
        ORDER BY turno, nivel_ensino NULLS FIRST, numero_aula`, [ESCOLA_ID]);
    console.log("\n== Esquemas de aula (matutino e vespertino) ==");
    console.table(s.rows);
  } finally {
    await c.end();
  }
})().catch(e => { console.error(e); process.exit(1); });
