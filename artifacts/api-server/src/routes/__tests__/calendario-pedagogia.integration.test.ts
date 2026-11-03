import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { exigirAdminParaAlterar } from "../../lib/permissao";
import calendarioRouter from "../calendario-escolar";

// [CALENDARIO-PEDAGOGIA] (03/11/2026) Pedagogia marca, edita e exclui datas do calendario com Postgres de verdade
// (rotas reais, filtro de permissao real); trimestres e o calendario oficial continuam so com a equipe gestora.
// So roda com TEST_DATABASE_URL (o CI sobe um Postgres migrado).
const TEM_BANCO = !!process.env.TEST_DATABASE_URL;
const E = `cal_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

let server: Server;
let porta = 0;
async function chamar(metodo: string, caminho: string, corpo?: unknown, cargo = "pedagogia") {
  const r = await fetch(`http://127.0.0.1:${porta}${caminho}`, {
    method: metodo,
    headers: { "Content-Type": "application/json", "x-cargo": cargo },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return { status: r.status, body: (await r.json()) as any };
}

describe.skipIf(!TEM_BANCO)("calendario: pedagogia altera as datas (integracao com banco real)", () => {
  beforeAll(async () => {
    process.env.ACESSOS_PELO_BANCO = "1"; // permissao pelo cargo (x-cargo)
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.auth = Object.assign(() => ({ orgId: E, userId: "u_teste", orgRole: "org:member", tokenType: "session_token" }), { [Symbol.for("@clerk/express.auth")]: true });
      const cargo = req.headers["x-cargo"] as string;
      req.acesso = { userId: "u_teste", email: "pedagogia@escola.test", escolas: [], escolaId: E, nomeEscola: "Teste", cargo };
      next();
    });
    app.use(exigirAdminParaAlterar);
    app.use("/calendario-escolar", calendarioRouter);
    server = app.listen(0);
    porta = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((ok) => (server ? server.close(() => ok()) : ok()));
    for (const t of ["calendario_escolar", "trimestres_letivos"]) await db.execute(sql.raw(`delete from ${t} where escola_id = '${E}'`));
  });

  it("marca, edita e exclui uma data; professor e gestor de reservas nao", async () => {
    const novo = { data: "2026-11-20", tipo: "estudo_planejamento", descricao: "Reunião pedagógica" };
    for (const cargo of ["professor", "reservas"]) expect((await chamar("POST", "/calendario-escolar", novo, cargo)).status, cargo).toBe(403);

    const criado = await chamar("POST", "/calendario-escolar", novo);
    expect(criado.status).toBe(201);
    const id = criado.body.id as number;
    expect((await chamar("PUT", `/calendario-escolar/${id}`, { ...novo, descricao: "Conselho de classe" }, "professor")).status).toBe(403);
    const editado = await chamar("PUT", `/calendario-escolar/${id}`, { ...novo, descricao: "Conselho de classe" });
    expect(editado.status).toBe(200);
    expect(editado.body.descricao).toBe("Conselho de classe");
    const lista = await chamar("GET", "/calendario-escolar?ano=2026");
    expect(lista.body.map((e: any) => e.descricao)).toEqual(["Conselho de classe"]);

    expect((await chamar("DELETE", `/calendario-escolar/${id}`, undefined, "reservas")).status).toBe(403);
    expect((await chamar("DELETE", `/calendario-escolar/${id}`)).status).toBe(200);
    expect((await chamar("GET", "/calendario-escolar?ano=2026")).body).toEqual([]);
  });

  it("pedagogia nao muda os trimestres nem aplica o calendario oficial; a coordenacao sim", async () => {
    const trimestres = { ano: 2026, trimestres: [] };
    expect((await chamar("PUT", "/calendario-escolar/trimestres", trimestres)).status).toBe(403);
    expect((await chamar("POST", "/calendario-escolar/aplicar-oficial", { ano: 2026 })).status).toBe(403);
    expect((await chamar("PUT", "/calendario-escolar/trimestres", trimestres, "coordenacao")).status).not.toBe(403);
  });
});
