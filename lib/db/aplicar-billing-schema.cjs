// aplicar-billing-schema.cjs
//
// Roda DEPOIS de você já ter aplicado a migration do Drizzle (que cria
// as colunas novas: preco_anual, stripe_price_id_mensal,
// stripe_price_id_anual em planos; isenta em escolas; e renomeia
// preco -> preco_mensal em planos).
//
// Esse script só ATUALIZA DADOS (não schema): os preços novos do Pro
// e Master, e marca a escola do Mário Braga como isenta de bloqueio
// de cobrança.
//
// Uso:
//   node aplicar-billing-schema.cjs             -> dry-run
//   node aplicar-billing-schema.cjs --commit     -> aplica de verdade

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

async function main() {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    await client.query("BEGIN");

    // 1) Confere que as colunas novas já existem (a migration já rodou)
    const cols = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'planos' AND column_name IN ('preco_mensal', 'preco_anual', 'stripe_price_id_mensal', 'stripe_price_id_anual')
    `);
    if (cols.rowCount !== 4) {
      console.error(
        `Faltam colunas em "planos" (achei ${cols.rowCount}/4). Rode a migration do Drizzle antes deste script.`,
      );
      await client.query("ROLLBACK");
      process.exit(1);
    }

    // 2) Atualiza os preços do Pro e Master (Gratuito não muda)
    const precos = [
      { nome: "Pro", precoMensal: 9700, precoAnual: 97000 },
      { nome: "Master", precoMensal: 18000, precoAnual: 180000 },
    ];
    for (const p of precos) {
      const r = await client.query(
        `UPDATE planos SET preco_mensal = $1, preco_anual = $2 WHERE nome = $3`,
        [p.precoMensal, p.precoAnual, p.nome],
      );
      console.log(`Plano ${p.nome}: ${r.rowCount} linha(s) atualizada(s) — mensal R$${(p.precoMensal / 100).toFixed(2)}, anual R$${(p.precoAnual / 100).toFixed(2)}`);
    }

    // 3) Marca a escola do Mário Braga como isenta (busca por nome, case-insensitive)
    const escola = await client.query(
      `SELECT id, nome_fantasia FROM escolas WHERE nome_fantasia ILIKE '%Mário%Braga%' OR nome_fantasia ILIKE '%Mario%Braga%'`,
    );
    if (escola.rowCount === 0) {
      console.log('[aviso] Nenhuma escola encontrada com nome contendo "Mário Braga" -- confira manualmente e marque com:');
      console.log("  UPDATE escolas SET isenta = true WHERE id = '<id_da_escola>';");
    } else {
      for (const row of escola.rows) {
        await client.query(`UPDATE escolas SET isenta = true WHERE id = $1`, [row.id]);
        console.log(`Escola isenta: "${row.nome_fantasia}" (id ${row.id})`);
      }
    }

    // 4) Confere o resultado
    const verificacao = await client.query(
      `SELECT nome, preco_mensal, preco_anual FROM planos ORDER BY preco_mensal`,
    );
    console.log("\n--- Planos após atualização ---");
    console.table(verificacao.rows);

    if (shouldCommit) {
      await client.query("COMMIT");
      console.log("\nCOMMIT aplicado — dados de billing atualizados.");
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
