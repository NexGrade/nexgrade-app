const fs = require("fs");
const { Client } = require("pg");
const dbUrl = fs.readFileSync(".env","utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const client = new Client({ connectionString: dbUrl });
client.connect().then(async () => {
  try {
    const r = await client.query(
      "INSERT INTO cursos (escola_id, nome, codigo_curso, nivel, eixo_tecnologico, forma_oferta) VALUES ('teste_escola', 'Teste Farmacia', '3251-15', 'tecnico', 'ambiente_saude', 'integrada') RETURNING id"
    );
    console.log("OK, id:", r.rows[0].id);
    await client.query("DELETE FROM cursos WHERE id = $1", [r.rows[0].id]);
  } catch (err) {
    console.error("ERRO REAL:", err.message);
  }
  await client.end();
});
