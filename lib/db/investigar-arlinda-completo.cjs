const { Client } = require("pg");
const c = new Client({ connectionString: process.env.DATABASE_URL });
c.connect().then(async () => {
  const escola = await c.query("SELECT id FROM escolas WHERE nome_fantasia ILIKE '%arlinda%'");
  const escolaId = escola.rows[0].id;

  const turmas = await c.query("SELECT nome, serie, turno, nivel_ensino, ano_letivo FROM turmas WHERE escola_id = $1 ORDER BY nome", [escolaId]);
  const slots = await c.query("SELECT turno, nivel_ensino, numero_aula, hora_inicio FROM horario_slots WHERE escola_id = $1 ORDER BY turno, numero_aula", [escolaId]);
  const profs = await c.query("SELECT COUNT(*) FROM professores WHERE escola_id = $1", [escolaId]);
  const discs = await c.query("SELECT COUNT(*) FROM disciplinas WHERE escola_id = $1", [escolaId]);
  const catalogo = await c.query("SELECT nome, codigo_sae FROM disciplinas_catalogo ORDER BY nome");

  console.log("=== Turmas já cadastradas (" + turmas.rows.length + ") ===");
  console.log(JSON.stringify(turmas.rows, null, 2));
  console.log("=== Horario_slots já configurados (" + slots.rows.length + ") ===");
  console.log(JSON.stringify(slots.rows, null, 2));
  console.log("=== Professores já cadastrados:", profs.rows[0].count);
  console.log("=== Disciplinas já cadastradas:", discs.rows[0].count);
  console.log("=== Catálogo mestre de disciplinas (" + catalogo.rows.length + " no total) ===");
  require("fs").writeFileSync("catalogo-disciplinas.json", JSON.stringify(catalogo.rows, null, 2));
  console.log("(salvo em catalogo-disciplinas.json, é grande demais pra mostrar aqui)");

  await c.end();
});
