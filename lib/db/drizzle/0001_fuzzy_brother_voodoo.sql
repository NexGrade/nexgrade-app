CREATE TABLE "bloqueios" (
	"id" serial PRIMARY KEY NOT NULL,
	"escola_id" text NOT NULL,
	"alvo_tipo" text NOT NULL,
	"sala_id" integer,
	"recurso_id" integer,
	"quantidade" integer,
	"data_inicio" date NOT NULL,
	"data_fim" date NOT NULL,
	"turno" text,
	"numeros_aula" integer[],
	"motivo" text NOT NULL,
	"descricao" text,
	"criado_por" text DEFAULT 'Sistema' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bloqueios" ADD CONSTRAINT "bloqueios_sala_id_salas_id_fk" FOREIGN KEY ("sala_id") REFERENCES "public"."salas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bloqueios" ADD CONSTRAINT "bloqueios_recurso_id_recursos_id_fk" FOREIGN KEY ("recurso_id") REFERENCES "public"."recursos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bloqueios_escola_periodo_idx" ON "bloqueios" USING btree ("escola_id","data_inicio","data_fim");