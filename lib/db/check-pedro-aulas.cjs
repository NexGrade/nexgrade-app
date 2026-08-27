const { Client } = require("pg");
const fs = require("fs");
const conteudo = fs.readFileSync(".env", "utf8");
const linha = conteudo.split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
const url = linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
async function main() {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const r = await client.query(
      `SELECT h.id, h.dia_semana, h.numero_aula, t.turno, t.nome as turma, d.nome as disciplina
       FROM horarios h
       JOIN turmas t ON t.id = h.turma_id
       LEFT JOIN disciplinas d ON d.id = h.disciplina_id
       WHERE h.professor_id = 663
       ORDER BY t.turno, h.dia_semana, h.numero_aula`
    );
    console.log("Todas as aulas do Prof. Pedro (id 663):");
    console.table(r.rows);
  } finally {
    await client.end();
  }
}
main().catch((err) => { console.error("ERRO:", err.message); process.exit(1); });
