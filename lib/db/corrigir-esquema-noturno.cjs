const { Client } = require("pg");
const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";
const APLICAR = process.argv.includes("--aplicar");

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log("=== horario_slots atuais para NOTURNO ===");
  const atuais = await client.query(
    `SELECT * FROM horario_slots WHERE escola_id = $1 AND turno = 'noturno' ORDER BY numero_aula`,
    [ESCOLA_ID]
  );
  console.log(JSON.stringify(atuais.rows, null, 2));

  const jaTem6 = atuais.rows.some(r => r.numero_aula === 6);
  if (jaTem6) {
    console.log("\nJá existe período 6 cadastrado. Nada a fazer.");
    return client.end();
  }

  console.log("\n=== Não existe período 6. Vou inserir. ===");
  if (APLICAR) {
    await client.query(
      `INSERT INTO horario_slots (escola_id, turno, nivel_ensino, numero_aula, hora_inicio, duracao_minutos, letivo)
       VALUES ($1, 'noturno', $2, 6, '22:10', 50, true)`,
      [ESCOLA_ID, atuais.rows[0]?.nivel_ensino ?? null]
    );
    console.log("✅ APLICADO — período 6 (22:10) criado pro noturno.");
  } else {
    console.log("🔎 DRY-RUN — rode com --aplicar para inserir de verdade.");
  }

  return client.end();
}
main().catch(err => { console.error(err); process.exit(1); });
