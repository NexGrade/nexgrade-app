CREATE TABLE "presencas_observacoes" (
	"id" serial PRIMARY KEY NOT NULL,
	"escola_id" text NOT NULL,
	"data" date NOT NULL,
	"turno" text NOT NULL,
	"professor_id" integer NOT NULL,
	"observacao" text NOT NULL,
	"registrado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "presencas_observacoes" ADD CONSTRAINT "presencas_observacoes_professor_id_professores_id_fk" FOREIGN KEY ("professor_id") REFERENCES "public"."professores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "presencas_observacoes_professor_uq" ON "presencas_observacoes" USING btree ("escola_id","data","turno","professor_id");