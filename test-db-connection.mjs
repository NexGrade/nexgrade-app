import { pool } from "./lib/db/src/index.ts";

try {
  const result = await pool.query("select 1 as ok");
  console.log("CONEXAO OK:", result.rows);
} catch (err) {
  console.error("ERRO DE CONEXAO:", err.message);
} finally {
  await pool.end();
  process.exit(0);
}
