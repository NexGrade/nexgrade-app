const fs = require('fs');
const { Client } = require('pg');
const dbUrl = fs.readFileSync('.env','utf8').match(/^DATABASE_URL=(.+)$/m)[1].trim();
const client = new Client({ connectionString: dbUrl });
client.connect().then(async () => {
  const r = await client.query("SELECT codigo_curso, nome, eixo_tecnologico FROM cursos WHERE escola_id = 'catalogo_geral' ORDER BY codigo_curso");
  console.table(r.rows);
  await client.end();
});
