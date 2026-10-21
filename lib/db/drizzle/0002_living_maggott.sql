CREATE TABLE "grade_backups" (
	"id" serial PRIMARY KEY NOT NULL,
	"escola_id" text NOT NULL,
	"motivo" text NOT NULL,
	"qtd_aulas" integer DEFAULT 0 NOT NULL,
	"qtd_ha" integer DEFAULT 0 NOT NULL,
	"dados" jsonb NOT NULL,
	"usuario_nome" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "escolas" ADD COLUMN IF NOT EXISTS "logo_data_url" text;--> statement-breakpoint
ALTER TABLE "planos" ADD COLUMN IF NOT EXISTS "preco_por_turma_parcelado" integer;--> statement-breakpoint
CREATE INDEX "grade_backups_escola_idx" ON "grade_backups" USING btree ("escola_id","created_at");