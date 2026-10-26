/**
 * ver-noturno-mario-braga.cjs  [SOMENTE LEITURA]
 * Mostra a grade oficial atual de turmas e professores do noturno do Mario Braga.
 * Uso (em lib\db):
 *   node ver-noturno-mario-braga.cjs 3NB                  (uma turma)
 *   node ver-noturno-mario-braga.cjs 3NB Carlos Viviane   (turma e professores; nome pelo inicio)
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";
const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex"];
const HORA = { 1: "18:00", 2: "18:45", 3: "19:35", 4: "20:35", 5: "21:25", 6: "22:10" };
function carregarDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const p = [path.join(__dirname, ".env"), path.join("lib", "db", ".env")].find((f) => fs.existsSync(f));
  const linha = fs.readFileSync(p, "utf8").split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
  return linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();

(async () => {
  const filtros = process.argv.slice(2).map(norm);
  const c = new Client({ connectionString: carregarDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const r = (await c.query(
      `SELECT t.nome AS turma, h.dia_semana, h.numero_aula, h.assincrona, d.nome AS disciplina, p.nome AS professor, p.id AS pid
         FROM horarios h JOIN turmas t ON t.id = h.turma_id JOIN disciplinas d ON d.id = h.disciplina_id
         JOIN professores p ON p.id = h.professor_id
        WHERE h.escola_id = $1 AND t.turno = 'noturno' AND COALESCE(h.versao_grade,'oficial') = 'oficial'
        ORDER BY h.dia_semana, h.numero_aula, t.nome`, [ESCOLA_ID])).rows;
    const turmas = filtros.filter((f) => r.some((x) => norm(x.turma) === f));
    const profs = filtros.filter((f) => !turmas.includes(f));
    for (const t of turmas) {
      console.log(`\n== Turma ${t}`);
      for (const x of r.filter((x) => norm(x.turma) === t))
        console.log(`  ${DIAS[x.dia_semana]} ${HORA[x.numero_aula]}  ${x.disciplina} (${x.professor})${x.assincrona ? "  [assincrona]" : ""}`);
    }
    for (const p of profs) {
      const xs = r.filter((x) => norm(x.professor).startsWith(p));
      console.log(`\n== Professor ${p} (${[...new Set(xs.map((x) => x.professor))].join(", ")})`);
      for (const x of xs) console.log(`  ${DIAS[x.dia_semana]} ${HORA[x.numero_aula]}  ${x.turma} ${x.disciplina}${x.assincrona ? "  [assincrona]" : ""}`);
      const ids = [...new Set(xs.map((x) => x.pid))];
      if (ids.length) {
        const ds = (await c.query(
          `SELECT dia_semana, horario_slot, hora_atividade_obrigatoria AS ha, disponivel, motivo FROM disponibilidade_professores
            WHERE professor_id = ANY($1) AND turno = 'noturno' AND (hora_atividade_obrigatoria OR disponivel = false)
            ORDER BY dia_semana, horario_slot`, [ids])).rows;
        for (const d of ds) console.log(`  ${DIAS[d.dia_semana]} ${HORA[d.horario_slot]}  ${d.ha ? "HA" : "bloqueio"} ${d.ha ? "" : d.motivo || ""}`);
      }
    }
  } finally { await c.end(); }
})().catch((e) => { console.error(e); process.exit(1); });
