CREATE TYPE "public"."forma_oferta" AS ENUM('integrada', 'concomitante_intercomplementar');--> statement-breakpoint
ALTER TABLE "cursos" ADD COLUMN "forma_oferta" "forma_oferta";