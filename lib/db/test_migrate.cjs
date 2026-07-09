const { drizzle } = require("drizzle-orm/node-postgres");
const { migrate } = require("drizzle-orm/node-postgres/migrator");
const { Pool } = require("pg");
const path = require("path");

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL não está definida.");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);
  console.log("🔄 Aplicando migrations pendentes...");
  await migrate(db, { migrationsFolder: path.join(__dirname, "drizzle") });
  console.log("✅ Migrations aplicadas com sucesso!");
  await pool.end();
}

main().catch((err) => {
  console.error("❌ Erro ao aplicar migrations:", err);
  process.exit(1);
});