CREATE TABLE "asaas_webhook_eventos" (
	"id" text PRIMARY KEY NOT NULL,
	"tipo" text NOT NULL,
	"processado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "escolas" ADD COLUMN "email_contato" text;--> statement-breakpoint
ALTER TABLE "escolas" ADD COLUMN "telefone_contato" text;--> statement-breakpoint
ALTER TABLE "escolas" ADD COLUMN "asaas_customer_id" text;--> statement-breakpoint
ALTER TABLE "escolas" ADD COLUMN "asaas_subscription_id" text;--> statement-breakpoint
ALTER TABLE "escolas" ADD COLUMN "asaas_status_assinatura" text;--> statement-breakpoint
ALTER TABLE "escolas" ADD COLUMN "asaas_proximo_vencimento" timestamp with time zone;