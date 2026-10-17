// Migracao manual (17/10/2026): professor pode reservar mais de um espaco na MESMA aula
// (turma dividida, ex.: metade no Laboratorio 01 e metade no Laboratorio 02).
// Remove o indice "uma reserva por professor por aula". O indice de "uma reserva por
// espaco por aula" continua: o mesmo espaco nunca fica com duas reservas na mesma aula.
// Nada e apagado alem do indice. Uso (da pasta lib\db; le a DATABASE_URL do .env desta pasta):
//   node migracoes-manuais/20261017b-reserva-varios-espacos.cjs            (dry-run: so mostra)
//   node migracoes-manuais/20261017b-reserva-varios-espacos.cjs --aplicar  (aplica)
const fs = require("fs");
const { Client } = require("pg");
const APLICAR = process.argv.includes("--aplicar");
function lerDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const m = fs.readFileSync(".env", "utf8").match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m);
  if (!m) throw new Error("DATABASE_URL nao definido (nem no ambiente nem no .env desta pasta)");
  return m[1];
}
async function defIndice(c, nome) {
  const r = await c.query("select indexdef from pg_indexes where schemaname='public' and indexname=$1", [nome]);
  return r.rows[0]?.indexdef ?? null;
}
(async () => {
  const c = new Client({ connectionString: lerDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  const prof = await defIndice(c, "reservas_professor_slot_unico");
  const sala = await defIndice(c, "reservas_sala_slot_unico");
  console.log(`A REMOVER | reservas_professor_slot_unico: ${prof ?? "(ja nao existe)"}`);
  console.log(`FICA      | reservas_sala_slot_unico: ${sala ?? "(NAO EXISTE -- conferir!)"}`);
  if (!sala) { console.error("\nO indice de espaco nao existe: rode antes a 20261017-reserva-turno.cjs. Nada foi alterado."); await c.end(); process.exit(1); }
  if (!APLICAR) {
    console.log("\nDRY-RUN: nada foi alterado. Rode com --aplicar para remover o indice do professor.");
    console.log("Para voltar atras, se precisar: CREATE UNIQUE INDEX reservas_professor_slot_unico ON reservas (escola_id, professor_id, data, numero_aula, coalesce(turno, '')) WHERE status <> 'cancelada'");
    await c.end(); return;
  }
  await c.query('DROP INDEX IF EXISTS "reservas_professor_slot_unico"');
  console.log("\n=== conferencia depois ===");
  console.log(`reservas_professor_slot_unico: ${(await defIndice(c, "reservas_professor_slot_unico")) ?? "REMOVIDO"}`);
  console.log(`reservas_sala_slot_unico: ${await defIndice(c, "reservas_sala_slot_unico")}`);
  await c.end();
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
