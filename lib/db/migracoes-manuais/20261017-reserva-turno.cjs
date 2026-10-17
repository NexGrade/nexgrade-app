// Migracao manual (17/10/2026): turno na reserva de espaco.
// Antes a reserva guardava so o numero da aula: a 1a aula da manha e a 1a aula da noite
// eram "a mesma" -- reservar o laboratorio de manha bloqueava a noite, e o professor que
// da a 1a aula nos dois turnos nao conseguia reservar as duas.
// 1) acrescenta reservas.turno (texto, pode ficar vazio);
// 2) preenche o turno das reservas que ja existem pela aula do professor (horario_id ou,
//    sem ele, a unica aula do professor naquele dia e numero);
// 3) refaz os 2 indices de "uma reserva por sala/professor por aula" incluindo o turno.
// Nada e apagado. Uso (da pasta lib\db; le a DATABASE_URL do .env desta pasta):
//   node migracoes-manuais/20261017-reserva-turno.cjs            (dry-run: so mostra)
//   node migracoes-manuais/20261017-reserva-turno.cjs --aplicar  (aplica, numa transacao)
const fs = require("fs");
const { Client } = require("pg");
function lerDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const m = fs.readFileSync(".env", "utf8").match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m);
  if (!m) throw new Error("DATABASE_URL nao definido (nem no ambiente nem no .env desta pasta)");
  return m[1];
}
const APLICAR = process.argv.includes("--aplicar");

const SQL_PREENCHER_POR_HORARIO = `
  UPDATE reservas r SET turno = t.turno
  FROM horarios h JOIN turmas t ON t.id = h.turma_id
  WHERE r.turno IS NULL AND h.id = r.horario_id`;
const SQL_PREENCHER_POR_AULA = `
  UPDATE reservas r SET turno = x.turno
  FROM (
    SELECT r2.id, min(t.turno) AS turno
    FROM reservas r2
    JOIN horarios h ON h.escola_id = r2.escola_id AND h.professor_id = r2.professor_id
      AND h.dia_semana = r2.dia_semana AND h.numero_aula = r2.numero_aula
      AND (h.versao_grade = 'oficial' OR h.versao_grade IS NULL)
    JOIN turmas t ON t.id = h.turma_id
    WHERE r2.turno IS NULL
    GROUP BY r2.id
    HAVING count(DISTINCT t.turno) = 1
  ) x
  WHERE r.id = x.id`;
const INDICES = [
  ["reservas_sala_slot_unico", "escola_id, sala_id, data, numero_aula, coalesce(turno, '')"],
  ["reservas_professor_slot_unico", "escola_id, professor_id, data, numero_aula, coalesce(turno, '')"],
];

async function colunaExiste(c) {
  const r = await c.query("select 1 from information_schema.columns where table_schema='public' and table_name='reservas' and column_name='turno'");
  return r.rowCount > 0;
}
async function defIndice(c, nome) {
  const r = await c.query("select indexdef from pg_indexes where schemaname='public' and indexname=$1", [nome]);
  return r.rows[0]?.indexdef ?? null;
}

(async () => {
  const c = new Client({ connectionString: lerDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  const ja = await colunaExiste(c);
  console.log(`${ja ? "JA EXISTE" : "A CRIAR  "} | reservas.turno (text)`);
  const total = (await c.query("select count(*)::int n, count(*) filter (where status <> 'cancelada')::int ativas from reservas")).rows[0];
  console.log(`Reservas: ${total.n} no total, ${total.ativas} ativas`);
  for (const [nome] of INDICES) console.log(`Indice ${nome}: ${(await defIndice(c, nome)) ?? "(nao existe)"}`);

  try {
    await c.query("BEGIN");
    if (!ja) await c.query('ALTER TABLE reservas ADD COLUMN IF NOT EXISTS turno text');
    const a = await c.query(SQL_PREENCHER_POR_HORARIO);
    const b = await c.query(SQL_PREENCHER_POR_AULA);
    const sem = (await c.query("select count(*)::int n from reservas where turno is null")).rows[0].n;
    console.log(`\nTurno preenchido: ${a.rowCount} pela aula ligada (horario_id) + ${b.rowCount} pela aula do professor no dia`);
    console.log(`Ficam sem turno: ${sem} (aula nao encontrada ou ambigua; continuam valendo, e o sistema trata como "qualquer turno" na conferencia de conflito)`);
    for (const [nome, cols] of INDICES) {
      await c.query(`DROP INDEX IF EXISTS "${nome}"`);
      await c.query(`CREATE UNIQUE INDEX "${nome}" ON reservas (${cols}) WHERE status <> 'cancelada'`);
      console.log(`Indice ${nome} -> (${cols})`);
    }
    if (!APLICAR) {
      await c.query("ROLLBACK");
      console.log("\nDRY-RUN: tudo acima foi testado dentro de uma transacao e DESFEITO. Nada foi alterado. Rode com --aplicar para gravar.");
      await c.end();
      return;
    }
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    console.error("ERRO -- nada foi alterado (rollback):", e.message);
    process.exit(1);
  }
  console.log("\n=== conferencia depois ===");
  console.log(`${(await colunaExiste(c)) ? "OK      " : "FALTANDO"} | reservas.turno`);
  for (const [nome] of INDICES) console.log(`Indice ${nome}: ${await defIndice(c, nome)}`);
  await c.end();
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
