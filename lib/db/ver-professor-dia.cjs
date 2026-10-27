/**
 * ver-professor-dia.cjs  [SOMENTE LEITURA]
 * Lista as aulas de um professor num dia da semana (grade oficial), por turno e aula,
 * e marca os horarios em que ele aparece em mais de uma turma.
 * Uso (em lib\db):
 *   node ver-professor-dia.cjs "Karina Kowalski" Ter
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex"];
function carregarDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const p = [path.join(__dirname, ".env"), path.join("lib", "db", ".env")].find((f) => fs.existsSync(f));
  const linha = fs.readFileSync(p, "utf8").split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
  return linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

(async () => {
  const nome = process.argv[2];
  const dia = DIAS.indexOf(process.argv[3] || "Ter");
  if (!nome || dia < 0) { console.log('Uso: node ver-professor-dia.cjs "Nome do professor" Ter'); return; }
  const c = new Client({ connectionString: carregarDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const r = (await c.query(
      `SELECT e.nome_fantasia AS escola, p.nome AS professor, t.nome AS turma, t.turno, h.numero_aula, h.assincrona, h.fixa,
              d.nome AS disciplina, h.id
         FROM horarios h
         JOIN professores p ON p.id = h.professor_id
         JOIN turmas t ON t.id = h.turma_id
         JOIN disciplinas d ON d.id = h.disciplina_id
         LEFT JOIN escolas e ON e.id = h.escola_id
        WHERE p.nome ILIKE $1 AND h.dia_semana = $2 AND COALESCE(h.versao_grade, 'oficial') = 'oficial'
        ORDER BY e.nome_fantasia, t.turno, h.numero_aula, t.nome`,
      [`%${nome}%`, dia],
    )).rows;
    if (!r.length) { console.log("Nenhuma aula encontrada para", nome, "na", DIAS[dia]); return; }
    const vistos = {};
    for (const x of r) { const k = `${x.escola}|${x.turno}|${x.numero_aula}`; vistos[k] = (vistos[k] || 0) + 1; }
    let escola = null;
    for (const x of r) {
      if (x.escola !== escola) { escola = x.escola; console.log(`\n${escola} - ${x.professor} - ${DIAS[dia]}`); }
      const dup = vistos[`${x.escola}|${x.turno}|${x.numero_aula}`] > 1 ? "  <== CONFLITO" : "";
      console.log(`  ${x.turno.padEnd(10)} ${x.numero_aula}a aula  ${x.turma.padEnd(10)} ${x.disciplina}${x.assincrona ? " (assincrona)" : ""}${x.fixa ? " (fixa)" : ""}  [id ${x.id}]${dup}`);
    }
  } finally { await c.end(); }
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
