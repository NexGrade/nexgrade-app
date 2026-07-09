ALTER TABLE "horario_slots" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "aulas_fixas" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "horario_slots" CASCADE;--> statement-breakpoint
DROP TABLE "aulas_fixas" CASCADE;--> statement-breakpoint
ALTER TABLE "turma_disciplinas" DROP CONSTRAINT "turma_disciplinas_professor_id_professores_id_fk";
--> statement-breakpoint
ALTER TABLE "itens_matriz" ALTER COLUMN "categoria_curricular" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "itens_matriz" ALTER COLUMN "categoria_curricular" SET DEFAULT 'base_nacional_comum';--> statement-breakpoint
ALTER TABLE "disciplinas" ADD COLUMN "tipo_sala_exigido" text;--> statement-breakpoint
ALTER TABLE "turma_disciplinas" ADD COLUMN "max_aulas_consecutivas_dia" integer;--> statement-breakpoint
ALTER TABLE "turma_disciplinas" ADD COLUMN "grupo_compartilhado_id" text;--> statement-breakpoint
ALTER TABLE "disponibilidade_professores" ADD COLUMN "turno" text;--> statement-breakpoint
ALTER TABLE "disponibilidade_professores" ADD COLUMN "hora_atividade_obrigatoria" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "professores" DROP COLUMN "abreviatura";--> statement-breakpoint
ALTER TABLE "disciplinas" DROP COLUMN "abreviatura";--> statement-breakpoint
ALTER TABLE "turma_disciplinas" DROP COLUMN "professor_id";--> statement-breakpoint
ALTER TABLE "horarios" DROP COLUMN "modalidade";--> statement-breakpoint
ALTER TABLE "matrizes_curriculares" DROP COLUMN "codigo_matriz_sere";--> statement-breakpoint
DROP TYPE "public"."composicao_curricular";