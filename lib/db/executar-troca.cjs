const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

function carregarDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const p = [path.join(__dirname, ".env"), path.join("lib", "db", ".env")].find((f) => fs.existsSync(f));
  const linha = fs.readFileSync(p, "utf8").split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
  return linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

(async () => {
  const c = new Client({ connectionString: carregarDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    console.log("Iniciando a permuta de horários segura...");
    await c.query("BEGIN"); // Inicia uma transação segura

    // 1. Mover Biologia (Alecksey) do ID 99456 para a 2ª aula
    await c.query("UPDATE horarios SET numero_aula = 2 WHERE id = 99456");
    console.log("? Biologia (Alecksey) movida para a 2ª aula.");

    // 2. Mover Matemática (Katia) do ID 99497 para a 3ª aula
    await c.query("UPDATE horarios SET numero_aula = 3 WHERE id = 99497");
    console.log("? Matemática (Katia) movida para a 3ª aula.");

    await c.query("COMMIT"); // Confirma as alterações no banco
    console.log("\n?? SUCESSO! A permuta foi salva com sucesso no banco de dados.");

  } catch (err) {
    await c.query("ROLLBACK"); // Desfaz se houver algum erro
    console.error("? ERRO ao atualizar: as alterações foram desfeitas.", err);
  } finally {
    await c.end();
  }
})();
