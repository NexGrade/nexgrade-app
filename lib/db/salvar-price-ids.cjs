// salvar-price-ids.cjs
//
// Uso:
//   node salvar-price-ids.cjs             -> dry-run
//   node salvar-price-ids.cjs --commit     -> aplica de verdade

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const envPath = path.join(__dirname, ".env");
const envContent = fs.readFileSync(envPath, "utf8");
const match = envContent.match(/^DATABASE_URL=(.+)$/m);
if (!match) {
  console.error("DATABASE_URL não encontrado em .env");
  process.exit(1);
}
const dbUrl = match[1].trim();
const shouldCommit = process.argv.includes("--commit");

const priceIds = [
  { nome: "Pro", mensal: "price_1TxydvCTACtR0C7I7cJ0hFiX", anual: "price_1TxyhnCTACtR0C7IKWc2kGOH" },
  { nome: "Master", mensal: "price_1TxykOCTACtR0C7IN5HkNWKa", anual: "price_1TxyluCTACtR0C7IrfzfsKfN" },
];

async function main() {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    await client.query("BEGIN");

    for (const p of priceIds) {
      const r = await client.query(
        `UPDATE planos SET stripe_price_id_mensal = $1, stripe_price_id_anual = $2 WHERE nome = $3`,
        [p.mensal, p.anual, p.nome],
      );
      console.log(`Plano ${p.nome}: ${r.rowCount} linha(s) atualizada(s)`);
    }

    const verificacao = await client.query(
      `SELECT nome, preco_mensal, preco_anual, stripe_price_id_mensal, stripe_price_id_anual FROM planos ORDER BY preco_mensal`,
    );
    console.log("\n--- Planos após atualização ---");
    console.table(verificacao.rows);

    if (shouldCommit) {
      await client.query("COMMIT");
      console.log("\nCOMMIT aplicado — Price IDs salvos.");
    } else {
      await client.query("ROLLBACK");
      console.log("\nDRY-RUN — nada foi gravado (ROLLBACK). Rode com --commit pra aplicar de verdade.");
    }
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("ERRO — ROLLBACK aplicado:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
