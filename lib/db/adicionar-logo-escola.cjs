// [LOGO-ESCOLA] (21/10/2026) cria a coluna escolas.logo_data_url.
// Padrao: DRY-RUN (so mostra o que faria). Para aplicar: node adicionar-logo-escola.cjs --aplicar
// Rodar ANTES de publicar o backend novo: o Drizzle lista as colunas no SELECT,
// e sem a coluna o GET /escolas/me quebraria.
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const APLICAR = process.argv.includes("--aplicar");

function lerDatabaseUrl() {
  const arquivo = path.join(__dirname, ".env");
  const texto = fs.readFileSync(arquivo, "utf8");
  for (const linha of texto.split(/\r?\n/)) {
    const m = linha.match(/^\s*DATABASE_URL\s*=\s*(.+?)\s*$/);
    if (m) return m[1].replace(/^["']|["']$/g, "");
  }
  throw new Error("DATABASE_URL nao encontrada em " + arquivo);
}

async function main() {
  const client = new Client({ connectionString: lerDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const col = await client.query(
      `SELECT data_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'escolas' AND column_name = 'logo_data_url'`
    );
    const escolas = await client.query(`SELECT id, nome_fantasia FROM escolas ORDER BY created_at`);

    console.log("Escolas no banco: " + escolas.rowCount);
    for (const e of escolas.rows) console.log("  - " + e.nome_fantasia + " (" + e.id + ")");

    if (col.rowCount > 0) {
      console.log("\nA coluna escolas.logo_data_url JA EXISTE (" + col.rows[0].data_type + "). Nada a fazer.");
      return;
    }

    const sql = "ALTER TABLE escolas ADD COLUMN IF NOT EXISTS logo_data_url text";
    console.log("\nA coluna escolas.logo_data_url NAO existe.");
    console.log("Comando: " + sql);
    console.log("Efeito: coluna nova, vazia (NULL) para todas as escolas. Nenhum dado existente muda.");

    if (!APLICAR) {
      console.log("\n[DRY-RUN] Nada foi alterado. Rode de novo com --aplicar para criar a coluna.");
      return;
    }
    await client.query(sql);
    const conf = await client.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'escolas' AND column_name = 'logo_data_url'`
    );
    console.log(conf.rowCount > 0 ? "\n[APLICADO] Coluna criada com sucesso." : "\n[ERRO] A coluna nao apareceu depois do ALTER.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Falhou:", err.message);
  process.exit(1);
});
