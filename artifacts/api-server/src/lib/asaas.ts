// RF-BILLING-ASAAS: cliente HTTP fino pra API do Asaas -- sem SDK
// oficial pra Node, então chamamos a REST API diretamente com fetch.
//
// Ambientes: ASAAS_API_KEY começando com "$aact_prod_" -> produção
// (api.asaas.com); começando com "$aact_hmlg_" -> sandbox
// (api-sandbox.asaas.com). Detectamos pelo prefixo da própria chave em
// vez de uma env var separada, pra impossibilitar o par errado
// (chave de produção + URL de sandbox, ou vice-versa) causar erro
// silencioso -- a chave sempre "aponta" pro ambiente certo.

const ASAAS_API_KEY = process.env.ASAAS_API_KEY;

function baseUrl(): string {
  if (!ASAAS_API_KEY) {
    throw new Error("ASAAS_API_KEY não configurada no servidor.");
  }
  return ASAAS_API_KEY.startsWith("$aact_prod_")
    ? "https://api.asaas.com/v3"
    : "https://api-sandbox.asaas.com/v3";
}

class AsaasError extends Error {
  constructor(public status: number, public body: unknown) {
    super(`Asaas API respondeu ${status}: ${JSON.stringify(body)}`);
  }
}

async function asaasFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!ASAAS_API_KEY) {
    throw new Error("ASAAS_API_KEY não configurada no servidor.");
  }
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "NexGrade/1.0",
      access_token: ASAAS_API_KEY,
      ...init?.headers,
    },
  });

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new AsaasError(res.status, body);
  }
  return body as T;
}

export type AsaasCustomer = {
  id: string;
  name: string;
  cpfCnpj: string;
  email?: string;
  mobilePhone?: string;
};

export type AsaasSubscription = {
  id: string;
  customer: string;
  billingType: "UNDEFINED" | "BOLETO" | "PIX" | "CREDIT_CARD";
  cycle: "MONTHLY" | "YEARLY";
  value: number;
  nextDueDate: string;
  status: string;
};

// POST /customers -- reaproveita se já existir um Customer com o
// mesmo cpfCnpj (evita duplicar cliente no painel do Asaas caso a
// rota seja chamada mais de uma vez pra mesma escola).
export async function criarOuReaproveitarCustomer(input: {
  name: string;
  cpfCnpj: string;
  email?: string;
  mobilePhone?: string;
  externalReference: string; // escolaId, pra rastrear no painel do Asaas
}): Promise<AsaasCustomer> {
  const existentes = await asaasFetch<{ data: AsaasCustomer[] }>(
    `/customers?cpfCnpj=${encodeURIComponent(input.cpfCnpj)}`,
  );
  if (existentes.data.length > 0) {
    return existentes.data[0];
  }
  return asaasFetch<AsaasCustomer>("/customers", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// POST /subscriptions -- billingType "UNDEFINED" deixa a escola
// escolher entre as formas de pagamento habilitadas na conta Asaas
// (painel: Configurações > Formas de pagamento -- Cartão de Crédito
// fica desativado lá, restando só PIX e Boleto). O Asaas dispara
// e-mail/WhatsApp automaticamente pro Customer com a primeira
// cobrança, sem a aplicação precisar montar nada.
export async function criarSubscription(input: {
  customer: string;
  value: number; // em reais (não centavos -- diferente do Stripe)
  cycle: "MONTHLY" | "YEARLY";
  nextDueDate: string; // "YYYY-MM-DD"
  description: string;
  externalReference: string; // escolaId
}): Promise<AsaasSubscription> {
  return asaasFetch<AsaasSubscription>("/subscriptions", {
    method: "POST",
    body: JSON.stringify({ ...input, billingType: "UNDEFINED" }),
  });
}

export async function cancelarSubscription(subscriptionId: string): Promise<void> {
  await asaasFetch(`/subscriptions/${subscriptionId}`, { method: "DELETE" });
}
