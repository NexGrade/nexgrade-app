CREATE TABLE "regras_reserva_professor" (
	"id" serial PRIMARY KEY NOT NULL,
	"escola_id" text NOT NULL,
	"professor_id" integer NOT NULL,
	"limite_semanal" integer DEFAULT 2 NOT NULL,
	"prioridade" integer DEFAULT 3 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservas" (
	"id" serial PRIMARY KEY NOT NULL,
	"escola_id" text NOT NULL,
	"sala_id" integer NOT NULL,
	"professor_id" integer NOT NULL,
	"horario_id" integer,
	"data" date NOT NULL,
	"dia_semana" integer NOT NULL,
	"numero_aula" integer NOT NULL,
	"titulo" text NOT NULL,
	"observacoes" text,
	"status" text DEFAULT 'confirmada' NOT NULL,
	"prioridade_aplicada" integer DEFAULT 3 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "horario_slots" ADD COLUMN "letivo" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "disciplinas_catalogo" ADD COLUMN "sigla" text;--> statement-breakpoint
ALTER TABLE "regras_reserva_professor" ADD CONSTRAINT "regras_reserva_professor_professor_id_professores_id_fk" FOREIGN KEY ("professor_id") REFERENCES "public"."professores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_sala_id_salas_id_fk" FOREIGN KEY ("sala_id") REFERENCES "public"."salas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_professor_id_professores_id_fk" FOREIGN KEY ("professor_id") REFERENCES "public"."professores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_horario_id_horarios_id_fk" FOREIGN KEY ("horario_id") REFERENCES "public"."horarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "regras_reserva_professor_escola_professor_idx" ON "regras_reserva_professor" USING btree ("escola_id","professor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reservas_sala_slot_unico" ON "reservas" USING btree ("escola_id","sala_id","data","numero_aula") WHERE "reservas"."status" != 'cancelada';--> statement-breakpoint
CREATE UNIQUE INDEX "reservas_professor_slot_unico" ON "reservas" USING btree ("escola_id","professor_id","data","numero_aula") WHERE "reservas"."status" != 'cancelada';