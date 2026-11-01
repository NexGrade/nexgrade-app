import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, escolasTable } from "@workspace/db";
import { exigirEscolaLiberada, limparCacheSituacao } from "../situacao-escola";

// [TRAVA-AVALIACAO] a trava nas rotas reais, com uma escola de verdade no banco de teste
const TEM_BANCO = !!process.env.TEST_DATABASE_URL;
const E = `teste_trava_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

let server: Server;
let porta = 0;
async function chamar(metodo: string, caminho: string, usuario = "u_teste") {
  const r = await fetch(`http://127.0.0.1:${porta}${caminho}`, { method: metodo, headers: { "x-usuario": usuario } });
  const texto = await r.text();
  let body: any = null;
  try { body = JSON.parse(texto); } catch { /* sem JSON */ }
  return { status: r.status, body };
}
async function mudarEscola(dados: Partial<typeof escolasTable.$inferInsert>) {
  await db.update(escolasTable).set(dados).where(eq(escolasTable.id, E));
  limparCacheSituacao(E);
}

describe.skipIf(!TEM_BANCO)("trava do fim da avaliacao: integracao com banco real", () => {
  beforeAll(async () => {
    process.env.MASTER_USER_IDS = "u_master";
    const app = express();
    app.use((req: any, _res, next) => {
      const userId = req.headers["x-usuario"] as string;
      req.auth = Object.assign(() => ({ orgId: E, userId, orgRole: "org:admin", tokenType: "session_token" }), { [Symbol.for("@clerk/express.auth")]: true });
      next();
    });
    app.use(exigirEscolaLiberada);
    app.get("/horarios", (_req, res) => { res.json({ ok: true }); });
    app.get("/escolas/me", (_req, res) => { res.json({ ok: true }); });
    server = app.listen(0);
    porta = (server.address() as AddressInfo).port;
    await db.insert(escolasTable).values({ id: E, nomeFantasia: "Escola da trava", isenta: false, planoAtivo: true, trialEndsAt: new Date(Date.now() + 10 * 86_400_000) } as any);
  });

  afterAll(async () => {
    await db.delete(escolasTable).where(eq(escolasTable.id, E));
    delete process.env.MASTER_USER_IDS;
    await new Promise<void>((ok) => (server ? server.close(() => ok()) : ok()));
  });

  it("em avaliacao, a escola usa normalmente", async () => {
    expect((await chamar("GET", "/horarios")).status).toBe(200);
  });

  it("acabou a avaliacao sem assinatura: 403 ESCOLA_BLOQUEADA, mas os dados basicos da escola continuam", async () => {
    await mudarEscola({ trialEndsAt: new Date(Date.now() - 86_400_000) });
    const r = await chamar("GET", "/horarios");
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ codigo: "ESCOLA_BLOQUEADA", motivo: "avaliacao_encerrada" });
    expect((await chamar("GET", "/escolas/me")).status).toBe(200);
  });

  it("a Nexus Core (Master) nunca e bloqueada", async () => {
    expect((await chamar("GET", "/horarios", "u_master")).status).toBe(200);
  });

  it("isenta libera; Escola ativa desligado bloqueia como suspensa", async () => {
    await mudarEscola({ isenta: true });
    expect((await chamar("GET", "/horarios")).status).toBe(200);
    await mudarEscola({ isenta: false, planoAtivo: false, trialEndsAt: new Date(Date.now() + 10 * 86_400_000) });
    expect((await chamar("GET", "/horarios")).body).toMatchObject({ codigo: "ESCOLA_BLOQUEADA", motivo: "suspensa" });
  });

  it("assinatura em dia no Asaas libera depois da avaliacao", async () => {
    await mudarEscola({ planoAtivo: true, trialEndsAt: new Date(Date.now() - 86_400_000), asaasSubscriptionId: "sub_teste", asaasStatusAssinatura: "em_dia" });
    expect((await chamar("GET", "/horarios")).status).toBe(200);
  });
});
