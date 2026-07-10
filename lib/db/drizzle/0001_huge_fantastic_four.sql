CREATE TABLE "calendario_escolar" (
"id" serial PRIMARY KEY NOT NULL,
"escola_id" text DEFAULT 'escola_default' NOT NULL,
"ano" integer NOT NULL,
"data" date NOT NULL,
"tipo" text NOT NULL,
"descricao" text NOT NULL,
"dia_letivo" boolean DEFAULT false NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trimestres_letivos" (
"id" serial PRIMARY KEY NOT NULL,
"escola_id" text DEFAULT 'escola_default' NOT NULL,
"ano" integer NOT NULL,
"trimestre" integer NOT NULL,
"data_inicio" date NOT NULL,
"data_fim" date NOT NULL,
"dias_letivos" integer NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);