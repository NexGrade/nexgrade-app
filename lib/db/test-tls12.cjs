const { Client } = require("pg");
const fs = require("fs");
const conteudo = fs.readFileSync(".env", "utf8");
const linha = conteudo.split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
const url = linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
async function main() {
  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2", maxVersion: "TLSv1.2" }
  });
  try {
    await client.connect();
    const r = await client.query("SELECT 1 as ok");
    console.log("Conectou forcando TLS 1.2:", JSON.stringify(r.rows));
  } catch (e) {
    console.error("ERRO:", e.message);
  } finally {
    await client.end().catch(() => {});
  }
}
main();
