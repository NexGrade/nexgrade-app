CREATE TABLE "disponibilidade_experimental" (
	"id" serial PRIMARY KEY NOT NULL,
	"escola_id" text NOT NULL,
	"nome" text NOT NULL,
	"professor_id" integer NOT NULL,
	"dia_semana" integer NOT NULL,
	"horario_slot" integer NOT NULL,
	"turno" text NOT NULL,
	"disponivel" boolean DEFAULT true NOT NULL,
	"motivo" text,
	"hora_atividade_obrigatoria" boolean DEFAULT false NOT NULL,
	"criado_por" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "disponibilidade_experimental" ADD CONSTRAINT "disponibilidade_experimental_professor_id_professores_id_fk" FOREIGN KEY ("professor_id") REFERENCES "public"."professores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "disponibilidade_experimental_chave_uq" ON "disponibilidade_experimental" USING btree ("escola_id","nome","professor_id","dia_semana","horario_slot","turno");