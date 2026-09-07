const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const porMotivo = await c.query(
    "SELECT motivo, count(*) FROM disponibilidade_professores GROUP BY motivo ORDER BY count(*) DESC"
  );
  console.log("--- Contagem atual por motivo ---");
  console.table(porMotivo.rows);
  await c.end();
})();