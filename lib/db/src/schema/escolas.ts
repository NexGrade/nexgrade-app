import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const planosTable = pgTable("planos", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  // [RENOMEADO] Era só "preco" -- agora "precoMensal" pra ficar
  // simétrico com precoAnual (RF-BILLING: plano anual com desconto).
  precoMensal: integer("preco_mensal").notNull().default(0),
  // Nulo pro plano Gratuito (não tem opção anual) e enquanto o plano
  // pago ainda não teve o valor anual definido.
  precoAnual: integer("preco_anual"),
  maxProfessores: integer("max_professores").notNull().default(10),
  maxTurmas: integer("max_turmas").notNull().default(5),
  temIA: boolean("tem_ia").notNull().default(false),
  temExport: boolean("tem_export").notNull().default(false),
  temImport: boolean("tem_import").notNull().default(false),
  ativo: boolean("ativo").notNull().default(true),
  visivelPublicamente: boolean("visivel_publicamente").notNull().default(true),
  // [RENOMEADO/NOVO] Era um único "stripePriceId" -- o Stripe usa um
  // Price ID diferente por periodicidade dentro do mesmo Product
  // (RF-BILLING). Ambos nulos até você colar os price_... do Stripe
  // pelo Painel Master, depois de criar o produto lá.
  stripePriceIdMensal: text("stripe_price_id_mensal"),
  stripePriceIdAnual: text("stripe_price_id_anual"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const escolasTable = pgTable("escolas", {
  id: text("id").primaryKey(),
  nomeFantasia: text("nome_fantasia").notNull(),
  cnpj: text("cnpj"),
  cidade: text("cidade"),
  estado: text("estado").notNull().default("SP"),
  modalidade: text("modalidade").notNull().default("regular"),
  // [NOVO] Identificação oficial da escola perante o MEC/SEED --
  // usados em relatórios oficiais e para diferenciar escolas com nome
  // fantasia parecido. Opcionais: nem toda escola (ex: escola nova em
  // fase de cadastro) tem esses dados no ato do onboarding.
  codigoInep: text("codigo_inep"),
  nre: text("nre"), // Núcleo Regional de Educação (SEED-PR) ou equivalente estadual
  // Armazenado como texto separado por vírgula (ex: "matutino,vespertino")
  // em vez de array do Postgres, pra manter consistência com o resto
  // do schema (nenhuma outra coluna usa array) e simplificar leitura/
  // escrita sem precisar de driver específico pra tipo array.
  turnosOfertados: text("turnos_ofertados"),
  resolucaoSeedPr: text("resolucao_seed_pr"),
  planoId: integer("plano_id").references(() => planosTable.id),
  clerkOrgId: text("clerk_org_id").unique(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  // [NOVO] RF-BILLING-ASAAS: contato usado pelo Asaas pra notificar a
  // escola automaticamente (e-mail/WhatsApp com o boleto ou PIX da
  // assinatura) -- sem isso, o Customer criado no Asaas fica sem meio
  // de receber a cobrança. Preenchido no onboarding ou depois pelo
  // Painel Master, antes de ativar a assinatura.
  emailContato: text("email_contato"),
  telefoneContato: text("telefone_contato"),
  emailCobranca: text("email_cobranca"),
  
  // [NOVO] RF-BILLING-ASAAS: substituem stripeCustomerId/
  // stripeSubscriptionId como billing provider ativo -- os campos do
  // Stripe acima ficam intactos (não usados) até a migração completa
  // de dados ser decidida.
  asaasCustomerId: text("asaas_customer_id"),
  asaasSubscriptionId: text("asaas_subscription_id"),
  // [NOVO] RF-BILLING-ASAAS: alimentados pelo webhook (routes/
  // asaas-webhook.ts) a cada evento de cobrança -- refletem o status
  // real da última cobrança da assinatura, pra exibir no Painel
  // Master (badge "Em dia"/"Atrasada"/"Cancelada" + data de
  // vencimento), no mesmo modelo do Nex Reserva.
  asaasStatusAssinatura: text("asaas_status_assinatura"), // "em_dia" | "atrasada" | "cancelada"
  asaasProximoVencimento: timestamp("asaas_proximo_vencimento", { withTimezone: true }),
  planoAtivo: boolean("plano_ativo").notNull().default(true),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  // [NOVO] Marca escolas isentas de cobrança/bloqueio -- caso do
  // Mário Braga (piloto). Fora do fluxo normal de trial/pagamento,
  // pra nenhum bloqueio automático encostar nela por engano, mesmo
  // que o trial "vença" no meio do piloto. `false` por padrão pra
  // toda escola nova/existente.
  isenta: boolean("isenta").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPlanoSchema = createInsertSchema(planosTable).omit({ id: true, createdAt: true });
export type InsertPlano = z.infer<typeof insertPlanoSchema>;
export type Plano = typeof planosTable.$inferSelect;

export const insertEscolaSchema = createInsertSchema(escolasTable).omit({ createdAt: true, updatedAt: true });
export type InsertEscola = z.infer<typeof insertEscolaSchema>;
export type Escola = typeof escolasTable.$inferSelect;
