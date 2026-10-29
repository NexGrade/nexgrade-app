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
    const profRes = await c.query("SELECT id, nome FROM professores WHERE nome ILIKE '%Alecksey%'");
    if (profRes.rows.length === 0) {
      console.log("Professor não encontrado.");
      return;
    }
    const profId = profRes.rows[0].id;
    console.log(`Professor encontrado: ${profRes.rows[0].nome} (ID: ${profId})\n`);

    const dispRes = await c.query(`
      SELECT dia_semana, horario_slot, disponivel, motivo 
      FROM disponibilidade_professores 
      WHERE professor_id = $1 
      ORDER BY dia_semana, horario_slot
    `, [profId]);

    const DIAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];
    console.log("=== BLOQUEIOS E DISPONIBILIDADE ===");
    let bloqueios = 0;
    for (const r of dispRes.rows) {
      const diaNome = DIAS[r.dia_semana] || `Dia ${r.dia_semana}`;
      const aulaNum = r.horario_slot + 1;
      if (r.disponivel === false) {
        console.log(`  ? BLOQUEADO: ${diaNome}-feira, ${aulaNum}ª aula | Motivo: ${r.motivo || "Não informado"}`);
        bloqueios++;
      } else {
        console.log(`  ? Disponível: ${diaNome}-feira, ${aulaNum}ª aula`);
      }
    }
    if (bloqueios === 0) {
      console.log("  Nenhum bloqueio cadastrado para este professor.");
    }
  } catch (err) {
    console.error(err);
  } finally {
    await c.end();
  }
})();
