CREATE TABLE "equipe_apoio" (
	"id" serial PRIMARY KEY NOT NULL,
	"escola_id" text NOT NULL,
	"nome" text NOT NULL,
	"funcao" text NOT NULL,
	"complemento" text,
	"expediente" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "equipe_apoio_escola_idx" ON "equipe_apoio" USING btree ("escola_id");