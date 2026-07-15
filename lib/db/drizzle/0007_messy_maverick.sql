ALTER TABLE "turmas" DROP CONSTRAINT "turmas_matriz_curricular_id_matrizes_curriculares_id_fk";
--> statement-breakpoint
ALTER TABLE "turmas" ADD CONSTRAINT "turmas_matriz_curricular_id_matrizes_curriculares_id_fk" FOREIGN KEY ("matriz_curricular_id") REFERENCES "public"."matrizes_curriculares"("id") ON DELETE set null ON UPDATE no action;