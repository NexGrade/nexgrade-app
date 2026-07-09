// Aplica as migrations pendentes diretamente via drizzle-orm, sem
// passar pela CLI do drizzle-kit — que trava silenciosamente no
// PowerShell (spinner da lib "ora" não funciona bem nesse terminal).
//
// Pré-requisito: rodar `pnpm --filter @workspace/db exec drizzle-kit
// generate` primeiro, pra gerar o(s) arquivo(s) de migration em
// lib/db/drizzle/ a partir da mudança de schema.
//
// Como rodar (a partir da raiz do monorepo):
//   $env:DATABASE_URL = "sua-connection-string"
//   node lib/db/test_migrate.js

const { drizzle } = require("drizzle-orm/node-postgres");
const { migrate } = require("drizzle-orm/node-postgres/migrator");
const { Pool } = require("pg");
const path = require("path");

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL não está definida. Rode:");
    console.error('   $env:DATABASE_URL = "postgresql://..."');
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
