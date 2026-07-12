CREATE TABLE "limites_diarios_professor" (
	"id" serial PRIMARY KEY NOT NULL,
	"escola_id" text DEFAULT 'escola_default' NOT NULL,
	"professor_id" integer NOT NULL,
	"turma_id" integer,
	"max_aulas_por_dia" integer DEFAULT 2 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "itens_matriz" ALTER COLUMN "categoria_curricular" SET DEFAULT 'BNC'::"public"."composicao_curricular";--> statement-breakpoint
ALTER TABLE "itens_matriz" ALTER COLUMN "categoria_curricular" SET DATA TYPE "public"."composicao_curricular" USING "categoria_curricular"::"public"."composicao_curricular";--> statement-breakpoint
ALTER TABLE "limites_diarios_professor" ADD CONSTRAINT "limites_diarios_professor_professor_id_professores_id_fk" FOREIGN KEY ("professor_id") REFERENCES "public"."professores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "limites_diarios_professor" ADD CONSTRAINT "limites_diarios_professor_turma_id_turmas_id_fk" FOREIGN KEY ("turma_id") REFERENCES "public"."turmas"("id") ON DELETE cascade ON UPDATE no action;