// [MIGRACOES] Faz o banco que JA existe (criado por push/scripts) "adotar" as migracoes versionadas:
// registra a migracao de base (lib/db/drizzle) como JA APLICADA na tabela de controle do drizzle
// (drizzle.__drizzle_migrations), SEM executar o SQL dela. Depois disso, `pnpm --filter @workspace/db run migrate`
// so aplica migracoes NOVAS.
//
// DRY-RUN por padrao: mostra o que registraria, sem gravar nada.
//
// Como rodar (PowerShell, na pasta do projeto):
//   $env:DATABASE_URL = "..."
//   npx tsx scripts/adotar-migracoes.ts            # dry-run
//   npx tsx scripts/adotar-migracoes.ts --aplicar  # grava os registros

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";

const aplicar = process.argv.includes("--aplicar");

// Se alguma destas tabelas nao existir, o banco nao e o do NexGrade com o esquema atual: nao registra nada.
const TABELAS_ESPERADAS = ["professores", "turmas", "horarios", "salas", "reservas", "reservas_recursos", "recursos", "acessos_escola"];

async function main() {
  const migracoes = readMigrationFiles({ migrationsFolder: "lib/db/drizzle" });
  console.log(`Modo: ${aplicar ? "APLICAR" : "DRY-RUN (nada sera gravado)"}`);
  console.log(`Migracoes na pasta: ${migracoes.length}`);

  const tabelas = await db.execute(sql`select table_name from information_schema.tables where table_schema = 'public'`);
  const existentes = new Set((tabelas.rows as Array<{ table_name: string }>).map((r) => r.table_name));
  const faltando = TABELAS_ESPERADAS.filter((t) => !existentes.has(t));
  if (faltando.length) {
    console.error(`\nPARADO: faltam tabelas no banco (${faltando.join(", ")}). Este banco nao tem o esquema atual; nada foi registrado.`);
    process.exit(1);
  }
  console.log(`Esquema conferido: ${TABELAS_ESPERADAS.length} tabelas-chave existem.`);

  const controle = await db.execute(sql`select to_regclass('drizzle.__drizzle_migrations') as t`);
  const temControle = (controle.rows[0] as { t: string | null }).t !== null;
  const jaRegistradas = new Set<string>();
  if (temControle) {
    const r = await db.execute(sql`select hash from drizzle.__drizzle_migrations`);
    for (const row of r.rows as Array<{ hash: string }>) jaRegistradas.add(row.hash);
  }
  console.log(`Tabela de controle: ${temControle ? `existe (${jaRegistradas.size} registro(s))` : "ainda nao existe (sera criada)"}`);

  const faltam = migracoes.filter((m) => !jaRegistradas.has(m.hash));
  if (faltam.length === 0) {
    console.log("\nNada a fazer: todas as migracoes ja estao registradas.");
    process.exit(0);
  }
  for (const m of faltam) console.log(`  a registrar: hash ${m.hash.slice(0, 12)}…  data ${new Date(m.folderMillis).toISOString()}`);

  if (!aplicar) {
    console.log("\nDry-run concluido. Para gravar, rode de novo com --aplicar (o SQL das migracoes NAO e executado).");
    process.exit(0);
  }

  await db.transaction(async (tx) => {
    await tx.execute(sql`CREATE SCHEMA IF NOT EXISTS drizzle`);
    await tx.execute(sql`CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`);
    for (const m of faltam) {
      await tx.execute(sql`insert into drizzle.__drizzle_migrations ("hash", "created_at") values (${m.hash}, ${m.folderMillis})`);
    }
  });
  console.log(`\nFeito: ${faltam.length} migracao(oes) registrada(s) como aplicada(s). A partir de agora use: pnpm --filter @workspace/db run migrate`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
