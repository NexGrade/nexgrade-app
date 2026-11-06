CREATE TABLE "atribuicao_experimental" (
	"id" serial PRIMARY KEY NOT NULL,
	"escola_id" text NOT NULL,
	"nome" text NOT NULL,
	"turma_disciplina_id" integer NOT NULL,
	"professor_id" integer,
	"criado_por" text,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experimentos" (
	"id" serial PRIMARY KEY NOT NULL,
	"escola_id" text NOT NULL,
	"nome" text NOT NULL,
	"criado_por" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "atribuicao_experimental" ADD CONSTRAINT "atribuicao_experimental_turma_disciplina_id_turma_disciplinas_id_fk" FOREIGN KEY ("turma_disciplina_id") REFERENCES "public"."turma_disciplinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atribuicao_experimental" ADD CONSTRAINT "atribuicao_experimental_professor_id_professores_id_fk" FOREIGN KEY ("professor_id") REFERENCES "public"."professores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "atribuicao_experimental_uq" ON "atribuicao_experimental" USING btree ("escola_id","nome","turma_disciplina_id");--> statement-breakpoint
CREATE UNIQUE INDEX "experimentos_escola_nome_uq" ON "experimentos" USING btree ("escola_id","nome");