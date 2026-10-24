CREATE TABLE "viradas_ano" (
	"id" serial PRIMARY KEY NOT NULL,
	"escola_id" text NOT NULL,
	"ano_de" integer NOT NULL,
	"ano_para" integer NOT NULL,
	"status" text NOT NULL,
	"backup" jsonb,
	"resumo" jsonb,
	"feita_por" text,
	"liberada_por" text,
	"feita_em" timestamp with time zone,
	"desfeita_em" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "viradas_ano_escola_idx" ON "viradas_ano" USING btree ("escola_id","ano_para");