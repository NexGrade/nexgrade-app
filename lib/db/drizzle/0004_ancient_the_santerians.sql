CREATE TABLE "presencas_professores" (
	"id" serial PRIMARY KEY NOT NULL,
	"escola_id" text NOT NULL,
	"data" date NOT NULL,
	"turno" text NOT NULL,
	"numero_aula" integer NOT NULL,
	"professor_id" integer NOT NULL,
	"status" text NOT NULL,
	"substituto_id" integer,
	"substituto_nome" text,
	"observacao" text,
	"registrado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "presencas_professores" ADD CONSTRAINT "presencas_professores_professor_id_professores_id_fk" FOREIGN KEY ("professor_id") REFERENCES "public"."professores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presencas_professores" ADD CONSTRAINT "presencas_professores_substituto_id_professores_id_fk" FOREIGN KEY ("substituto_id") REFERENCES "public"."professores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "presencas_professores_aula_uq" ON "presencas_professores" USING btree ("escola_id","data","turno","numero_aula","professor_id");--> statement-breakpoint
CREATE INDEX "presencas_professores_escola_data_idx" ON "presencas_professores" USING btree ("escola_id","data");