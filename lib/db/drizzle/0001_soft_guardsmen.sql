CREATE TYPE "public"."composicao_curricular" AS ENUM('BNC', 'PD', 'FGB', 'PFO', 'IFA', 'IFP', 'APF');--> statement-breakpoint
CREATE TABLE "horario_slots" (
	"id" serial PRIMARY KEY NOT NULL,
	"escola_id" text DEFAULT 'escola_default' NOT NULL,
	"turno" text NOT NULL,
	"numero_aula" integer NOT NULL,
	"hora_inicio" time NOT NULL,
	"duracao_minutos" integer DEFAULT 50 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "aulas_fixas" (
	"id" serial PRIMARY KEY NOT NULL,
	"escola_id" text DEFAULT 'escola_default' NOT NULL,
	"turma_id" integer NOT NULL,
	"disciplina_id" integer NOT NULL,
	"professor_id" integer NOT NULL,
	"dia_semana" integer NOT NULL,
	"numero_aula" integer NOT NULL,
	"ano_letivo" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "itens_matriz" ALTER COLUMN "categoria_curricular" SET DEFAULT 'BNC'::"public"."composicao_curricular";--> statement-breakpoint
ALTER TABLE "itens_matriz" ALTER COLUMN "categoria_curricular" SET DATA TYPE "public"."composicao_curricular" USING "categoria_curricular"::"public"."composicao_curricular";--> statement-breakpoint
ALTER TABLE "professores" ADD COLUMN "abreviatura" text;--> statement-breakpoint
ALTER TABLE "disciplinas" ADD COLUMN "abreviatura" text;--> statement-breakpoint
ALTER TABLE "turma_disciplinas" ADD COLUMN "professor_id" integer;--> statement-breakpoint
ALTER TABLE "matrizes_curriculares" ADD COLUMN "codigo_matriz_sere" text;--> statement-breakpoint
ALTER TABLE "aulas_fixas" ADD CONSTRAINT "aulas_fixas_turma_id_turmas_id_fk" FOREIGN KEY ("turma_id") REFERENCES "public"."turmas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aulas_fixas" ADD CONSTRAINT "aulas_fixas_disciplina_id_disciplinas_id_fk" FOREIGN KEY ("disciplina_id") REFERENCES "public"."disciplinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aulas_fixas" ADD CONSTRAINT "aulas_fixas_professor_id_professores_id_fk" FOREIGN KEY ("professor_id") REFERENCES "public"."professores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turma_disciplinas" ADD CONSTRAINT "turma_disciplinas_professor_id_professores_id_fk" FOREIGN KEY ("professor_id") REFERENCES "public"."professores"("id") ON DELETE set null ON UPDATE no action;