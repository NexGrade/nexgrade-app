const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

function carregarDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const p = [path.join(__dirname, ".env"), path.join("lib", "db", ".env")].find((f) => fs.existsSync(f));
  const linha = fs.readFileSync(p, "utf8").split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
  return linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

(async () => {
  const c = new Client({ connectionString: carregarDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const res = await c.query(`
      SELECT t.nome AS turma, h.numero_aula, d.nome AS disciplina, p.nome AS professor, h.id
      FROM horarios h
      JOIN turmas t ON t.id = h.turma_id
      JOIN disciplinas d ON d.id = h.disciplina_id
      LEFT JOIN professores p ON p.id = h.professor_id
      WHERE t.nome IN ('1ME DOC', '1MD MA') AND h.dia_semana = 1 -- 1 = Terça-feira no seu sistema
      ORDER BY t.nome, h.numero_aula
    `);
    
    console.log("\n=== GRADE DE TERÇA-FEIRA ===");
    let currentTurma = "";
    for (const r of res.rows) {
      if (r.turma !== currentTurma) {
        currentTurma = r.turma;
        console.log(`\nTurma: ${currentTurma}`);
      }
      console.log(`  ${r.numero_aula}ª aula: ${r.disciplina.padEnd(20)} | Professor: ${r.professor || "Vago"} (ID Horário: ${r.id})`);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await c.end();
  }
})();
