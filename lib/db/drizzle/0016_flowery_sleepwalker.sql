ALTER TABLE "planos" RENAME COLUMN "stripe_price_id" TO "stripe_price_id_mensal";--> statement-breakpoint
ALTER TABLE "escolas" ADD COLUMN "isenta" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "planos" ADD COLUMN "preco_mensal" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "planos" ADD COLUMN "preco_anual" integer;--> statement-breakpoint
ALTER TABLE "planos" ADD COLUMN "stripe_price_id_anual" text;--> statement-breakpoint
ALTER TABLE "planos" DROP COLUMN "preco";