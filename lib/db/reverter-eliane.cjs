// Reverte os professores id 619 ("Eliane") e id 620 ("Eliane Rocha")
// de volta ao nome/e-mail placeholder original -- foram incorretamente
// atualizados para os mesmos dados (mesma "Eliane Rocha" do Click
// Reserva), mas são pessoas diferentes segundo a coordenação.
//
// Uso:
//   node reverter-eliane.cjs            → dry-run (ROLLBACK)
//   node reverter-eliane.cjs --aplicar   → aplica de verdade (COMMIT)

const { Client } = require("pg");
const APLICAR = process.argv.includes("--aplicar");

const REVERTER = [
  { id: 619, nome: "Eliane", email: "eliane@escola.exemplo.br" },
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("ERRO: DATABASE_URL não definida nesta sessão.");
    process.exit(1);
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query("BEGIN");

    for (const r of REVERTER) {
      const antes = (await client.query(`SELECT id, nome, email FROM professores WHERE id = $1`, [r.id])).rows[0];
      if (!antes) {
        console.log(`  [PULADO] id ${r.id} não encontrado.`);
        continue;
      }
      await client.query(`UPDATE professores SET nome = $1, email = $2 WHERE id = $3`, [r.nome, r.email, r.id]);
      console.log(`  [${r.id}] "${antes.nome}" / "${antes.email}"  ->  "${r.nome}" / "${r.email}"`);
    }

    if (APLICAR) {
      await client.query("COMMIT");
      console.log("\n✅ APLICADO.");
    } else {
      await client.query("ROLLBACK");
      console.log("\n🔎 DRY-RUN — nada foi salvo. Revise e rode com --aplicar.");
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("ERRO:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}
main();
