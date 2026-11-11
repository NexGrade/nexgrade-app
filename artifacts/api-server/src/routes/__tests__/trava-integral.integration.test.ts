import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  db, disciplinasTable, disponibilidadeTable, horariosExperimentaisTable, horariosTable, horarioSlotsTable,
  professoresTable, turmaDisciplinasTable, turmasTable,
} from "@workspace/db";
import { exigirAdminParaAlterar } from "../../lib/permissao";
import { salvarBackupGrade } from "../../lib/backup-grade";
import disponibilidadeRouter from "../disponibilidade";
import horariosRouter from "../horarios";
import turmasRouter from "../turmas";

// [TRAVA-INTEGRAL] (11/11/2026) A turma integral (1ME DOC) nao muda por nenhum caminho enquanto travada: aula a mao,
// excluir, rascunho, trocar aula, trocar professor, promover, voltar copia, Turmas e bloqueio/HA no horario DOC.
// Destravada (por pouco tempo), muda. So roda com TEST_DATABASE_URL.
const TEM_BANCO = !!process.env.TEST_DATABASE_URL;
const E = `trint_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const enc = encodeURIComponent;

let server: Server;
let porta = 0;
async function chamar(metodo: string, caminho: string, corpo?: unknown, cargo = "direcao") {
  const r = await fetch(`http://127.0.0.1:${porta}${caminho}`, {
    method: metodo,
    headers: { "Content-Type": "application/json", "x-cargo": cargo },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const tipo = r.headers.get("content-type") ?? "";
  const body: any = tipo.includes("json") ? await r.json() : await r.text();
  return { status: r.status, body };
}
const ids = { ana: 0, bia: 0, mat: 0, por: 0, doc: 0, t1: 0, tdMatDoc: 0, aulaDoc: 0 };
const aulasDe = (turmaId: number) => db.select().from(horariosTable).where(and(eq(horariosTable.escolaId, E), eq(horariosTable.turmaId, turmaId)));
const idAulaDoc = async () => (await aulasDe(ids.doc)).sort((a, b) => a.diaSemana - b.diaSemana || a.numeroAula - b.numeroAula)[0]!.id; // o promover regrava as aulas (ids novos)
const lugares = async (turmaId: number) => (await aulasDe(turmaId)).map((h) => `${h.diaSemana}-${h.numeroAula}-${h.professorId}`).sort();

describe.skipIf(!TEM_BANCO)("trava da turma integral", () => {
  let docAntes: string[] = [];
  beforeAll(async () => {
    process.env.ACESSOS_PELO_BANCO = "1";
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.auth = Object.assign(() => ({ orgId: E, userId: "u_teste", orgRole: "org:admin", tokenType: "session_token" }), { [Symbol.for("@clerk/express.auth")]: true });
      req.acesso = { userId: "u_teste", email: "direcao@escola.test", escolas: [], escolaId: E, nomeEscola: "Teste", cargo: req.headers["x-cargo"] };
      next();
    });
    app.use(exigirAdminParaAlterar);
    app.use("/disponibilidade", disponibilidadeRouter);
    app.use("/horarios", horariosRouter);
    app.use("/turmas", turmasRouter);
    server = app.listen(0);
    porta = (server.address() as AddressInfo).port;

    // a integral tem os mesmos horarios da manha: aula 1 da integral = 1a da manha, aula 2 = 2a
    for (const [n, h] of [[1, "07:30"], [2, "08:20"], [3, "09:10"]] as const) {
      await db.insert(horarioSlotsTable).values({ escolaId: E, turno: "matutino", nivelEnsino: "medio_tecnico", numeroAula: n, horaInicio: h, duracaoMinutos: 50, letivo: true } as any);
      await db.insert(horarioSlotsTable).values({ escolaId: E, turno: "integral", numeroAula: n, horaInicio: h, duracaoMinutos: 50, letivo: true } as any);
    }
    const [mat] = await db.insert(disciplinasTable).values({ escolaId: E, nome: "Matemática", sigla: "MAT" } as any).returning();
    const [por] = await db.insert(disciplinasTable).values({ escolaId: E, nome: "Português", sigla: "POR" } as any).returning();
    const [doc] = await db.insert(turmasTable).values({ escolaId: E, nome: "1ME DOC", serie: "1", anoLetivo: 2026, turno: "integral", nivelEnsino: "medio_tecnico" } as any).returning();
    const [t1] = await db.insert(turmasTable).values({ escolaId: E, nome: "1A", serie: "1", anoLetivo: 2026, turno: "matutino", nivelEnsino: "medio_tecnico" } as any).returning();
    const [ana] = await db.insert(professoresTable).values({ escolaId: E, nome: "Ana", email: `ana.${E}@escola.test` }).returning();
    const [bia] = await db.insert(professoresTable).values({ escolaId: E, nome: "Bia", email: `bia.${E}@escola.test` }).returning();
    const [tdMatDoc] = await db.insert(turmaDisciplinasTable).values({ turmaId: doc!.id, disciplinaId: mat!.id, professorId: ana!.id } as any).returning();
    await db.insert(turmaDisciplinasTable).values({ turmaId: t1!.id, disciplinaId: por!.id, professorId: bia!.id } as any);
    const aula = (turmaId: number, disciplinaId: number, professorId: number, diaSemana: number, numeroAula: number) => ({ escolaId: E, turmaId, disciplinaId, professorId, diaSemana, numeroAula } as any);
    const [aulaDoc] = await db.insert(horariosTable).values(aula(doc!.id, mat!.id, ana!.id, 0, 1)).returning();
    await db.insert(horariosTable).values([aula(doc!.id, mat!.id, ana!.id, 0, 2), aula(t1!.id, por!.id, bia!.id, 1, 1), aula(t1!.id, por!.id, bia!.id, 1, 2)]);
    Object.assign(ids, { ana: ana!.id, bia: bia!.id, mat: mat!.id, por: por!.id, doc: doc!.id, t1: t1!.id, tdMatDoc: tdMatDoc!.id, aulaDoc: aulaDoc!.id });
    docAntes = await lugares(doc!.id);
  });

  afterAll(async () => {
    await new Promise<void>((ok) => (server ? server.close(() => ok()) : ok()));
    if (ids.ana) await db.delete(disponibilidadeTable).where(inArray(disponibilidadeTable.professorId, [ids.ana, ids.bia]));
    for (const t of ["configuracoes", "atribuicao_experimental", "experimentos", "disponibilidade_experimental", "horarios_experimentais", "grade_backups", "horarios", "horario_slots", "turmas", "disciplinas", "professores"]) {
      await db.execute(sql.raw(`delete from ${t} where escola_id = '${E}'`));
    }
  });

  it("comeca travada", async () => {
    const r = await chamar("GET", "/horarios/trava-integral");
    expect(r.body).toMatchObject({ temIntegral: true, travada: true, destrava: null, turmas: [{ id: ids.doc, nome: "1ME DOC" }] });
  });

  it("aula a mao e excluir aula: a integral recusa (423), a turma comum segue", async () => {
    let r = await chamar("POST", "/horarios", { turmaId: ids.doc, disciplinaId: ids.mat, professorId: ids.ana, diaSemana: 2, numeroAula: 1 });
    expect(r.status).toBe(423);
    expect(r.body.error).toContain("1ME DOC");
    expect(r.body.error).toContain("Destravar a integral");
    expect((await chamar("DELETE", `/horarios/${ids.aulaDoc}`)).status).toBe(423);
    r = await chamar("POST", "/horarios", { turmaId: ids.t1, disciplinaId: ids.por, professorId: ids.bia, diaSemana: 3, numeroAula: 1 });
    expect(r.status).not.toBe(423);
    expect(await lugares(ids.doc)).toEqual(docAntes);
  });

  it("rascunho: so da integral ou com ela escolhida e recusado; o da escola toda nao mexe nela", async () => {
    expect((await chamar("POST", "/horarios/rascunho/atual", { nome: "So DOC", alcance: "integral" })).status).toBe(423);
    expect((await chamar("POST", "/horarios/rascunho/atual", { nome: "Com DOC", alcance: "turmas", turmaIds: [ids.doc, ids.t1] })).status).toBe(423);
    expect((await chamar("POST", "/horarios/rascunho/atual", { nome: "Escola" })).status).toBe(201);
    const url = `/horarios/experimentais/${enc("Escola")}`;
    expect((await chamar("POST", `${url}/trocar-aulas`, { turmaId: ids.doc, de: { diaSemana: 0, numeroAula: 1 }, para: { diaSemana: 0, numeroAula: 3 } })).status).toBe(423);
    expect((await chamar("PUT", `${url}/atribuicoes`, { turmaDisciplinaId: ids.tdMatDoc, professorId: ids.bia })).status).toBe(423);
    // a turma comum troca e o rascunho promove (a integral foi copiada igual)
    expect((await chamar("POST", `${url}/trocar-aulas`, { turmaId: ids.t1, de: { diaSemana: 1, numeroAula: 1 }, para: { diaSemana: 1, numeroAula: 3 }, confirmar: true })).status).toBe(200);
    const p = await chamar("POST", `${url}/promover`);
    expect(p.status).toBeLessThan(300);
    expect((await aulasDe(ids.t1)).some((h) => h.diaSemana === 1 && h.numeroAula === 3)).toBe(true);
    expect(await lugares(ids.doc)).toEqual(docAntes);
  });

  it("promover experimento que muda a integral e recusado sem mexer na oficial", async () => {
    await db.insert(horariosExperimentaisTable).values([
      { escolaId: E, nome: "Mexe DOC", turmaId: ids.doc, disciplinaId: ids.mat, professorId: ids.ana, diaSemana: 3, numeroAula: 1 },
      { escolaId: E, nome: "Mexe DOC", turmaId: ids.doc, disciplinaId: ids.mat, professorId: ids.ana, diaSemana: 3, numeroAula: 2 },
    ]);
    const r = await chamar("POST", `/horarios/experimentais/${enc("Mexe DOC")}/promover`);
    expect(r.status).toBe(423);
    expect(await lugares(ids.doc)).toEqual(docAntes);
    await chamar("DELETE", `/horarios/experimentais/${enc("Mexe DOC")}`);
  });

  it("Turmas: trocar professor, excluir e mudar disciplinas da integral sao recusados; renomear pode", async () => {
    expect((await chamar("PATCH", `/turmas/${ids.doc}/disciplinas/linha/${ids.tdMatDoc}`, { professorId: ids.bia, confirmar: true })).status).toBe(423);
    expect((await chamar("DELETE", `/turmas/${ids.doc}`)).status).toBe(423);
    expect((await chamar("PATCH", `/turmas/${ids.doc}`, { disciplinaIds: [ids.por] })).status).toBe(423);
    expect((await chamar("PATCH", `/turmas/${ids.doc}`, { nome: "1ME DOC" })).status).toBe(200);
    const [linha] = await db.select().from(turmaDisciplinasTable).where(eq(turmaDisciplinasTable.id, ids.tdMatDoc));
    expect(linha!.professorId).toBe(ids.ana);
  });

  it("[DOC-TRAVADA] a rota de um horario nao bloqueia nem poe HA no horario de aula DOC", async () => {
    const base = { professorId: ids.ana, diaSemana: 0, horarioSlot: 1, turno: "matutino" };
    expect((await chamar("POST", "/disponibilidade", { ...base, disponivel: false, motivo: "Bloqueio" })).status).toBe(423);
    expect((await chamar("POST", "/disponibilidade", { ...base, disponivel: true, horaAtividadeObrigatoria: true, motivo: "HA" })).status).toBe(423);
    expect((await chamar("POST", "/disponibilidade", { ...base, horarioSlot: 3, disponivel: false, motivo: "Bloqueio" })).status).toBeLessThan(300);
    const linhas = await db.select().from(disponibilidadeTable).where(and(eq(disponibilidadeTable.professorId, ids.ana), eq(disponibilidadeTable.horarioSlot, 1)));
    expect(linhas).toEqual([]);
  });

  it("voltar copia que muda a integral e recusado com ela travada", async () => {
    const b = await salvarBackupGrade(E, "copia de teste");
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    // destrava, muda a integral e trava de novo: a copia (sem a aula nova) mudaria a integral
    expect((await chamar("POST", "/horarios/trava-integral/destravar", { horas: 1 })).body.travada).toBe(false);
    expect((await chamar("POST", "/horarios", { turmaId: ids.doc, disciplinaId: ids.mat, professorId: ids.ana, diaSemana: 4, numeroAula: 1 })).status).toBe(201);
    expect((await chamar("POST", "/horarios/trava-integral/travar")).body.travada).toBe(true);
    const depois = await lugares(ids.doc);
    expect((await chamar("POST", `/horarios/backups/${b.id}/restaurar`)).status).toBe(423);
    expect(await lugares(ids.doc)).toEqual(depois);
  });

  it("destravar: so quem edita a grade, com prazo de no maximo 4 h; destravada a integral muda; travar volta", async () => {
    expect((await chamar("POST", "/horarios/trava-integral/destravar", { horas: 1 }, "professor")).status).toBe(403);
    expect((await chamar("POST", "/horarios/trava-integral/destravar", { horas: 10 })).status).toBe(400);
    const d = await chamar("POST", "/horarios/trava-integral/destravar", { horas: 1 });
    expect(d.body).toMatchObject({ travada: false, destrava: { por: "direcao@escola.test" } });
    const minutos = (new Date(d.body.destrava.ate).getTime() - Date.now()) / 60000;
    expect(minutos).toBeGreaterThan(55);
    expect(minutos).toBeLessThan(61);
    const [extra] = await db.select().from(horariosTable).where(and(eq(horariosTable.turmaId, ids.doc), eq(horariosTable.diaSemana, 4)));
    expect((await chamar("DELETE", `/horarios/${extra!.id}`)).status).toBe(204);
    await chamar("POST", "/horarios/trava-integral/travar");
    expect((await chamar("GET", "/horarios/trava-integral")).body.travada).toBe(true);
    expect((await chamar("DELETE", `/horarios/${await idAulaDoc()}`)).status).toBe(423);
  });

  it("destrava vencida conta como travada", async () => {
    await db.execute(sql`insert into configuracoes (escola_id, chave, valor) values (${E}, 'integral.destravada', ${JSON.stringify({ ate: new Date(Date.now() - 60000).toISOString(), em: new Date().toISOString(), por: null })}::jsonb)`);
    expect((await chamar("GET", "/horarios/trava-integral")).body.travada).toBe(true);
    expect((await chamar("DELETE", `/horarios/${await idAulaDoc()}`)).status).toBe(423);
  });
});
