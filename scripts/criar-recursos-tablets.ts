// [RECURSOS-TABLETS] Cria as tabelas "recursos" e "reservas_recursos" (so elas, e so se faltarem).
// DRY-RUN por padrao: mostra o SQL e o que ja existe, sem gravar nada.
//
// Como rodar (PowerShell, na pasta do projeto):
//   $env:DATABASE_URL = "..."
//   npx tsx scripts/criar-recursos-tablets.ts            # dry-run
//   npx tsx scripts/criar-recursos-tablets.ts --aplicar  # grava

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const aplicar = process.argv.includes("--aplicar");

const COMANDOS: Array<{ tabela: string; sql: string }> = [
  {
    tabela: "recursos",
    sql: `CREATE TABLE IF NOT EXISTS "recursos" (
	"id" serial PRIMARY KEY NOT NULL,
	"escola_id" text NOT NULL,
	"nome" text NOT NULL,
	"quantidade_total" integer NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  },
  {
    tabela: "recursos",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "recursos_escola_nome_idx" ON "recursos" USING btree ("escola_id","nome")`,
  },
  {
    tabela: "reservas_recursos",
    sql: `CREATE TABLE IF NOT EXISTS "reservas_recursos" (
	"id" serial PRIMARY KEY NOT NULL,
	"escola_id" text NOT NULL,
	"recurso_id" integer NOT NULL REFERENCES "recursos"("id") ON DELETE cascade,
	"professor_id" integer NOT NULL REFERENCES "professores"("id") ON DELETE cascade,
	"data" date NOT NULL,
	"dia_semana" integer NOT NULL,
	"numero_aula" integer NOT NULL,
	"turno" text NOT NULL,
	"quantidade" integer NOT NULL,
	"titulo" text NOT NULL,
	"observacoes" text,
	"status" text DEFAULT 'confirmada' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  },
  {
    tabela: "reservas_recursos",
    sql: `CREATE INDEX IF NOT EXISTS "reservas_recursos_slot_idx" ON "reservas_recursos" USING btree ("escola_id","recurso_id","data","numero_aula")`,
  },
];

async function main() {
  const existentes = await db.execute(
    sql`select table_name from information_schema.tables where table_schema = 'public' and table_name in ('recursos', 'reservas_recursos')`,
  );
  const nomes = (existentes.rows as Array<{ table_name: string }>).map((r) => r.table_name);
  console.log(`Modo: ${aplicar ? "APLICAR" : "DRY-RUN (nada sera gravado)"}`);
  console.log(`Tabelas que ja existem: ${nomes.length ? nomes.join(", ") : "nenhuma"}`);
  for (const c of COMANDOS) {
    console.log(`\n-- ${c.tabela}\n${c.sql};`);
    if (aplicar) await db.execute(sql.raw(c.sql));
  }
  console.log(aplicar ? "\nFeito." : "\nDry-run concluido. Para gravar, rode de novo com --aplicar.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
