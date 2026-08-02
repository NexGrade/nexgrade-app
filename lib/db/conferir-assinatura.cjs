const { Client } = require("pg");
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect().then(async () => {
  const r = await client.query(`
    SELECT e.id, e.nome_fantasia, e.plano_ativo, e.stripe_customer_id, e.stripe_subscription_id, p.nome AS plano
    FROM escolas e LEFT JOIN planos p ON p.id = e.plano_id
  `);
  console.table(r.rows);
  await client.end();
});
