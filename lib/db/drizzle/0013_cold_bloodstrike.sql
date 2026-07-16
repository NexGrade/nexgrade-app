CREATE TABLE "disciplinas_catalogo" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"codigo_sae" text,
	"categoria_curricular_padrao" "composicao_curricular",
	"carga_semanal_sugerida" integer DEFAULT 2 NOT NULL,
	"tipo_sala_exigido" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
