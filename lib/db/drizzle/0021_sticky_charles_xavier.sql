ALTER TABLE "horarios" ALTER COLUMN "turma_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "comunicados" ALTER COLUMN "escola_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "usuarios" ALTER COLUMN "escola_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "disciplinas" ADD COLUMN "sem_turma" boolean DEFAULT false NOT NULL;