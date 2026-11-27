import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db, disciplinasTable, professorDisciplinasTable, professoresTable } from "@workspace/db";
import { exigirAdminParaAlterar } from "../../lib/permissao";
import professoresRouter from "../professores";

// [PATCH-SO-DISCIPLINAS] (27/11/2026) PATCH /professores/:id so com disciplinaIds dava 500 ("No values to set"):
// a rota tentava gravar o professor sem nenhum campo. A tela manda o formulario inteiro, mas a rota tem de aceitar
// so as disciplinas. So roda com TEST_DATABASE_URL.
const TEM_BANCO = !!process.env.TEST_DATABASE_URL;
const E = `psd_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

let server: Server;
let porta = 0;
const ids = { prof: 0, geo: 0, paee: 0 };
async function chamar(metodo: string, caminho: string, corpo?: unknown) {
  const r = await fetch(`http://127.0.0.1:${porta}${caminho}`, {
    method: metodo, headers: { "Content-Type": "application/json" }, body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return { status: r.status, body: (await r.json().catch(() => null)) as any };
}
const disciplinasDoProf = async () => (await db.select().from(professorDisciplinasTable)
  .where(eq(professorDisciplinasTable.professorId, ids.prof))).map((x) => x.disciplinaId).sort();

describe.skipIf(!TEM_BANCO)("editar professor mandando só as disciplinas", () => {
  beforeAll(async () => {
    process.env.ACESSOS_PELO_BANCO = "1";
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.auth = Object.assign(() => ({ orgId: E, userId: "u_teste", orgRole: "org:admin", tokenType: "session_token" }), { [Symbol.for("@clerk/express.auth")]: true });
      req.acesso = { userId: "u_teste", email: "direcao@escola.test", escolas: [], escolaId: E, nomeEscola: "Teste", cargo: "direcao" };
      next();
    });
    app.use(exigirAdminParaAlterar);
    app.use("/professores", professoresRouter);
    server = app.listen(0);
    porta = (server.address() as AddressInfo).port;

    const [geo] = await db.insert(disciplinasTable).values({ escolaId: E, nome: "Geografia", sigla: "GEO", cargaSemanal: 2 } as any).returning();
    const [paee] = await db.insert(disciplinasTable).values({ escolaId: E, nome: "PAEE", sigla: "PAEE", cargaSemanal: 2 } as any).returning();
    const [prof] = await db.insert(professoresTable).values({ escolaId: E, nome: "Amanda Oliveira", email: `amanda.${E}@escola.test` }).returning();
    Object.assign(ids, { prof: prof!.id, geo: geo!.id, paee: paee!.id });
    await db.insert(professorDisciplinasTable).values([{ professorId: ids.prof, disciplinaId: ids.paee }, { professorId: ids.prof, disciplinaId: ids.geo }]);
  });

  afterAll(async () => {
    await new Promise<void>((ok) => (server ? server.close(() => ok()) : ok()));
    if (ids.prof) await db.delete(professorDisciplinasTable).where(eq(professorDisciplinasTable.professorId, ids.prof));
    await db.delete(professoresTable).where(eq(professoresTable.escolaId, E));
    if (ids.geo) await db.delete(disciplinasTable).where(inArray(disciplinasTable.id, [ids.geo, ids.paee]));
  });

  it("tira uma disciplina sem mandar nome nem e-mail", async () => {
    const r = await chamar("PATCH", `/professores/${ids.prof}`, { disciplinaIds: [ids.paee] });
    expect(r.status).toBe(200);
    expect(await disciplinasDoProf()).toEqual([ids.paee]);
    const [p] = await db.select().from(professoresTable).where(eq(professoresTable.id, ids.prof));
    expect(p!.nome).toBe("Amanda Oliveira"); // o cadastro nao muda
  });

  it("com nome e disciplinas, grava os dois", async () => {
    const r = await chamar("PATCH", `/professores/${ids.prof}`, { nome: "Amanda O. Santos", disciplinaIds: [ids.paee, ids.geo] });
    expect(r.status).toBe(200);
    expect(await disciplinasDoProf()).toEqual([ids.paee, ids.geo].sort());
    const [p] = await db.select().from(professoresTable).where(eq(professoresTable.id, ids.prof));
    expect(p!.nome).toBe("Amanda O. Santos");
  });
});
