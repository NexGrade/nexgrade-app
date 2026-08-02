import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// RF-BILLING-ASAAS: o Asaas garante entrega "at least once" -- o mesmo
// evento pode chegar mais de uma vez no webhook. Guardamos o `id` do
// evento (não da cobrança) assim que processado; se o mesmo `id`
// chegar de novo, a rota ignora sem reprocessar (idempotência
// recomendada pela própria documentação do Asaas).
export const asaasWebhookEventosTable = pgTable("asaas_webhook_eventos", {
  id: text("id").primaryKey(), // id do evento, ex: "evt_123456789"
  tipo: text("tipo").notNull(), // ex: "PAYMENT_CONFIRMED"
  processadoEm: timestamp("processado_em", { withTimezone: true }).notNull().defaultNow(),
});
