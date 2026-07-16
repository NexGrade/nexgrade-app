CREATE TYPE "public"."nivel_ensino" AS ENUM('fundamental', 'medio_tecnico');--> statement-breakpoint
ALTER TABLE "turmas" ADD COLUMN "nivel_ensino" "nivel_ensino";--> statement-breakpoint
ALTER TABLE "horario_slots" ADD COLUMN "nivel_ensino" "nivel_ensino";