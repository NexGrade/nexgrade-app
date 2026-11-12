import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import {
  db, disciplinasTable, disponibilidadeTable, horariosExperimentaisTable, horariosTable, horarioSlotsTable,
  professorDisciplinasTable, professoresTable, turmaDisciplinasTable, turmasTable,
} from "@workspace/db";
import { exigirAdminParaAlterar } from "../../lib/permissao";
import disponibilidadeRouter from "../disponibilidade";
import horariosRouter from "../horarios";
import turmasRouter from "../turmas";

// [MODO-RASCUNHO] (06/11/2026) Fluxo completo do rascunho com Postgres de verdade e os casos de erro: permissoes,
// nomes repetidos, trocas invalidas, professor/disciplina de fora, aplicar com tudo junto e voltar pela copia,
// descartar e apagar pela lista do Modo Experimental. So roda com TEST_DATABASE_URL.
const TEM_BANCO = !!process.env.TEST_DATABASE_URL;
const E = `rasc_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
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
const ids = { ana: 0, bia: 0, caio: 0, mat: 0, por: 0, t1: 0, t2: 0, tdMat1: 0, tdPor2: 0 };
const oficialDe = (turmaId: number) => db.select().from(horariosTable).where(and(eq(horariosTable.escolaId, E), eq(horariosTable.turmaId, turmaId)));
const doRascunho = (nome: string) => db.select().from(horariosExperimentaisTable).where(and(eq(horariosExperimentaisTable.escolaId, E), eq(horariosExperimentaisTable.nome, nome)));
const lugar = (h: { diaSemana: number; numeroAula: number }) => `${h.diaSemana}-${h.numeroAula}`;

describe.skipIf(!TEM_BANCO)("modo rascunho: fluxo completo e casos de erro", () => {
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

    for (const [n, h] of [[1, "07:30"], [2, "08:20"], [3, "09:10"]] as const)
      await db.insert(horarioSlotsTable).values({ escolaId: E, turno: "matutino", nivelEnsino: "medio_tecnico", numeroAula: n, horaInicio: h, duracaoMinutos: 50, letivo: true } as any);
    const [mat] = await db.insert(disciplinasTable).values({ escolaId: E, nome: "Matemática", sigla: "MAT" } as any).returning();
    const [por] = await db.insert(disciplinasTable).values({ escolaId: E, nome: "Português", sigla: "POR" } as any).returning();
    const [t1] = await db.insert(turmasTable).values({ escolaId: E, nome: "1A", serie: "1", anoLetivo: 2026, turno: "matutino", nivelEnsino: "medio_tecnico" } as any).returning();
    const [t2] = await db.insert(turmasTable).values({ escolaId: E, nome: "1B", serie: "1", anoLetivo: 2026, turno: "matutino", nivelEnsino: "medio_tecnico" } as any).returning();
    const p: Record<string, number> = {};
    for (const nome of ["Ana", "Bia", "Caio"]) {
      const [x] = await db.insert(professoresTable).values({ escolaId: E, nome, email: `${nome}.${E}@escola.test` }).returning();
      p[nome] = x!.id;
    }
    // credenciados: Ana e Bia em Matematica, Caio em Portugues
    await db.insert(professorDisciplinasTable).values([{ professorId: p.Ana!, disciplinaId: mat!.id }, { professorId: p.Bia!, disciplinaId: mat!.id }, { professorId: p.Caio!, disciplinaId: por!.id }] as any);
    const [tdMat1] = await db.insert(turmaDisciplinasTable).values({ turmaId: t1!.id, disciplinaId: mat!.id, professorId: p.Ana! } as any).returning();
    await db.insert(turmaDisciplinasTable).values({ turmaId: t1!.id, disciplinaId: por!.id, professorId: p.Caio! } as any);
    await db.insert(turmaDisciplinasTable).values({ turmaId: t2!.id, disciplinaId: mat!.id, professorId: p.Ana! } as any);
    const [tdPor2] = await db.insert(turmaDisciplinasTable).values({ turmaId: t2!.id, disciplinaId: por!.id, professorId: p.Caio! } as any).returning();
    // grade oficial: 1A seg 1a e 2a Mat (Ana), seg 3a Por (Caio); 1B ter 1a Mat (Ana), ter 2a Por (Caio)
    const aula = (turmaId: number, disciplinaId: number, professorId: number, diaSemana: number, numeroAula: number) => ({ escolaId: E, turmaId, disciplinaId, professorId, diaSemana, numeroAula } as any);
    await db.insert(horariosTable).values([
      aula(t1!.id, mat!.id, p.Ana!, 0, 1), aula(t1!.id, mat!.id, p.Ana!, 0, 2), aula(t1!.id, por!.id, p.Caio!, 0, 3),
      aula(t2!.id, mat!.id, p.Ana!, 1, 1), aula(t2!.id, por!.id, p.Caio!, 1, 2),
    ]);
    Object.assign(ids, { ana: p.Ana, bia: p.Bia, caio: p.Caio, mat: mat!.id, por: por!.id, t1: t1!.id, t2: t2!.id, tdMat1: tdMat1!.id, tdPor2: tdPor2!.id });
  });

  afterAll(async () => {
    await new Promise<void>((ok) => (server ? server.close(() => ok()) : ok()));
    for (const t of ["configuracoes", "atribuicao_experimental", "experimentos", "disponibilidade_experimental", "horarios_experimentais", "grade_backups", "horarios", "horario_slots", "turmas", "disciplinas", "professores"]) {
      await db.execute(sql.raw(`delete from ${t} where escola_id = '${E}'`));
    }
  });

  it("quem nao edita a grade nao cria nem descarta rascunho", async () => {
    for (const cargo of ["professor", "pedagogia", "reservas"]) {
      expect((await chamar("POST", "/horarios/rascunho/atual", { nome: "x" }, cargo)).status).toBe(403);
      expect((await chamar("DELETE", "/horarios/rascunho/atual", undefined, cargo)).status).toBe(403);
    }
  });

  it("valida nome e deixa so um rascunho por vez", async () => {
    expect((await chamar("POST", "/horarios/rascunho/atual", { nome: "   " })).status).toBe(400);
    await db.insert(horariosExperimentaisTable).values({ escolaId: E, nome: "Já existe", turmaId: ids.t1, disciplinaId: ids.mat, professorId: ids.ana, diaSemana: 4, numeroAula: 1 });
    expect((await chamar("POST", "/horarios/rascunho/atual", { nome: "Já existe" })).status).toBe(409);
    await db.delete(horariosExperimentaisTable).where(and(eq(horariosExperimentaisTable.escolaId, E), eq(horariosExperimentaisTable.nome, "Já existe")));
    const r = await chamar("POST", "/horarios/rascunho/atual", { nome: "Plano A" });
    expect(r.status).toBe(201);
    expect(r.body.aulas).toBe(5); // a grade oficial inteira copiada
    expect((await chamar("POST", "/horarios/rascunho/atual", { nome: "Plano B" })).status).toBe(409);
    await chamar("DELETE", "/horarios/rascunho/atual");
  });

  it("trocas e atribuicoes invalidas sao recusadas sem mexer em nada", async () => {
    await chamar("POST", "/horarios/rascunho/atual", { nome: "Plano C" });
    const url = `/horarios/experimentais/${enc("Plano C")}`;
    expect((await chamar("POST", `${url}/trocar-aulas`, { turmaId: ids.t1, de: { diaSemana: 0, numeroAula: 1 }, para: { diaSemana: 0, numeroAula: 1 } })).status).toBe(400);
    expect((await chamar("POST", `${url}/trocar-aulas`, { turmaId: ids.t1, de: { diaSemana: 3, numeroAula: 1 }, para: { diaSemana: 3, numeroAula: 2 } })).status).toBe(404);
    expect((await chamar("POST", `${url}/trocar-aulas`, { turmaId: 999999999, de: { diaSemana: 0, numeroAula: 1 }, para: { diaSemana: 0, numeroAula: 2 } })).status).toBe(404);
    expect((await chamar("POST", `${url}/trocar-aulas`, { turmaId: ids.t1, de: { diaSemana: 9, numeroAula: 1 }, para: { diaSemana: 0, numeroAula: 2 } })).status).toBe(400);
    expect((await chamar("PUT", `${url}/atribuicoes`, { turmaDisciplinaId: 999999999, professorId: ids.bia })).status).toBe(404);
    expect((await chamar("PUT", `${url}/atribuicoes`, { turmaDisciplinaId: ids.tdMat1, professorId: 999999999 })).status).toBe(400);
    expect((await chamar("GET", `${url}/diferencas`)).body.turmas).toEqual([]); // nada mudou
    await chamar("DELETE", "/horarios/rascunho/atual");
  });

  it("apagar o rascunho pela lista do Modo Experimental encerra o rascunho da escola", async () => {
    await chamar("POST", "/horarios/rascunho/atual", { nome: "Plano D" });
    expect((await chamar("DELETE", `/horarios/experimentais/${enc("Plano D")}`)).status).toBe(204);
    expect((await chamar("GET", "/horarios/rascunho/atual")).body).toEqual({ rascunho: null });
  });

  it("[RASCUNHO-AVISO-PROFESSOR] trocar o professor avisa choque com aula em outra turma e com bloqueio; so troca confirmando", async () => {
    await chamar("POST", "/horarios/rascunho/atual", { nome: "Plano G" });
    const url = `/horarios/experimentais/${enc("Plano G")}`;
    // no rascunho, o Caio tambem tem Portugues na 1B na segunda 1a (mesmo horario da Matematica da 1A)
    await db.insert(horariosExperimentaisTable).values({ escolaId: E, nome: "Plano G", turmaId: ids.t2, disciplinaId: ids.por, professorId: ids.caio, diaSemana: 0, numeroAula: 1 });
    // e a Bia esta bloqueada na segunda 2a, so no rascunho
    await chamar("POST", `/disponibilidade/lote?experimento=${enc("Plano G")}`, { professorId: ids.bia, itens: [{ diaSemana: 0, horarioSlot: 2, turno: "matutino", disponivel: false, motivo: "Bloqueio (definido na tela)", horaAtividadeObrigatoria: false }] });
    let r = await chamar("PUT", `${url}/atribuicoes`, { turmaDisciplinaId: ids.tdMat1, professorId: ids.caio });
    expect(r.body).toMatchObject({ aplicado: false, avisos: ["Caio já tem aula na 1B na segunda, 1ª aula.", "Com esse choque o rascunho não pode ser aplicado na escola até uma das aulas mudar de horário."] });
    r = await chamar("PUT", `${url}/atribuicoes`, { turmaDisciplinaId: ids.tdMat1, professorId: ids.bia });
    expect(r.body).toMatchObject({ aplicado: false, avisos: ["Bia tem bloqueio na segunda, 2ª aula."] });
    // sem confirmar, nada mudou
    expect((await doRascunho("Plano G")).filter((h) => h.turmaId === ids.t1 && h.disciplinaId === ids.mat).map((h) => h.professorId)).toEqual([ids.ana, ids.ana]);
    expect((await chamar("GET", `${url}/atribuicoes`)).body.filter((x: any) => x.mudou)).toEqual([]);
    // confirmando, troca
    r = await chamar("PUT", `${url}/atribuicoes`, { turmaDisciplinaId: ids.tdMat1, professorId: ids.bia, confirmar: true });
    expect(r.body).toMatchObject({ aplicado: true, aulasAtualizadas: 2 });
    // voltar para a professora da escola nao pede confirmacao (ela ja dava essas aulas)
    r = await chamar("PUT", `${url}/atribuicoes`, { turmaDisciplinaId: ids.tdMat1, professorId: ids.ana });
    expect(r.body.aplicado).toBe(true);
    await chamar("DELETE", "/horarios/rascunho/atual");
  });

  it("descartar com professor, disponibilidade e troca: a escola fica como estava", async () => {
    await chamar("POST", "/horarios/rascunho/atual", { nome: "Plano E" });
    const url = `/horarios/experimentais/${enc("Plano E")}`;
    await chamar("PUT", `${url}/atribuicoes`, { turmaDisciplinaId: ids.tdMat1, professorId: ids.bia });
    await chamar("POST", `/disponibilidade/lote?experimento=${enc("Plano E")}`, { professorId: ids.ana, itens: [{ diaSemana: 4, horarioSlot: 3, turno: "matutino", disponivel: false, motivo: "Bloqueio (definido na tela)", horaAtividadeObrigatoria: false }] });
    await chamar("POST", `${url}/trocar-aulas`, { turmaId: ids.t2, de: { diaSemana: 1, numeroAula: 1 }, para: { diaSemana: 1, numeroAula: 3 }, confirmar: true });
    const antes = (await oficialDe(ids.t2)).map(lugar).sort();
    expect((await chamar("DELETE", "/horarios/rascunho/atual")).status).toBe(204);
    expect((await oficialDe(ids.t2)).map(lugar).sort()).toEqual(antes);
    const [td] = await db.select().from(turmaDisciplinasTable).where(eq(turmaDisciplinasTable.id, ids.tdMat1));
    expect(td!.professorId).toBe(ids.ana);
    expect(await db.select().from(disponibilidadeTable).where(eq(disponibilidadeTable.professorId, ids.ana))).toEqual([]);
    expect((await chamar("GET", "/horarios/experimentos-resumo")).body.experimentos).toEqual([]);
  });

  it("fluxo completo: mudar professor, disponibilidade e aulas no rascunho, aplicar e voltar pela copia", async () => {
    expect((await chamar("POST", "/horarios/rascunho/atual", { nome: "Plano F" })).status).toBe(201);
    const url = `/horarios/experimentais/${enc("Plano F")}`;
    // 1) Matematica da 1A: Ana -> Bia (as 2 aulas passam para a Bia no rascunho)
    let r = await chamar("PUT", `${url}/atribuicoes`, { turmaDisciplinaId: ids.tdMat1, professorId: ids.bia });
    expect(r.body.aulasAtualizadas).toBe(2);
    // 2) Ana bloqueada na sexta 3a (so no rascunho)
    r = await chamar("POST", `/disponibilidade/lote?experimento=${enc("Plano F")}`, { professorId: ids.ana, itens: [{ diaSemana: 4, horarioSlot: 3, turno: "matutino", disponivel: false, motivo: "Bloqueio (definido na tela)", horaAtividadeObrigatoria: false }] });
    expect(r.status).toBe(201);
    // 3) 1B: Matematica da ter 1a vai para a ter 3a (vago)
    r = await chamar("POST", `${url}/trocar-aulas`, { turmaId: ids.t2, de: { diaSemana: 1, numeroAula: 1 }, para: { diaSemana: 1, numeroAula: 3 } });
    expect(r.body).toEqual({ aplicado: true, avisos: [] });
    // trocar a Mat da 1B (Ana) para a seg 1a avisa: a Ana ja tem a Mat da 1A? Nao: no rascunho a 1A e da Bia. A Bia nao esta na 1B.
    // Agora a Por do Caio na 1B (ter 2a) para seg 3a: o Caio ja da Por na 1A seg 3a -> aviso
    r = await chamar("POST", `${url}/trocar-aulas`, { turmaId: ids.t2, de: { diaSemana: 1, numeroAula: 2 }, para: { diaSemana: 0, numeroAula: 3 } });
    expect(r.body.aplicado).toBe(false);
    expect(r.body.avisos).toEqual(["Caio já tem aula na 1A na segunda, 3ª aula."]);

    // a escola ainda nao mudou
    expect((await oficialDe(ids.t1)).map((h) => h.professorId)).toEqual([ids.ana, ids.ana, ids.caio]);
    // ver mudancas: professor (1A) e aulas (1A trocou professor, 1B trocou lugar)
    const dif = await chamar("GET", `${url}/diferencas`);
    expect(dif.body.turmas.map((t: any) => [t.turma, t.mudancas.length])).toEqual([["1A", 2], ["1B", 2]]);
    const atrib = await chamar("GET", `${url}/atribuicoes`);
    expect(atrib.body.filter((a: any) => a.mudou).map((a: any) => [a.turma, a.disciplina, a.professorId])).toEqual([["1A", "Matemática", ids.bia]]);
    // "voltar a 1B como esta na escola" desfaz so a troca da 1B
    await chamar("POST", `${url}/restaurar-turma`, { turmaId: ids.t2 });
    expect((await chamar("GET", `${url}/diferencas`)).body.turmas.map((t: any) => t.turma)).toEqual(["1A"]);
    // e restaurar a 1A mantem a Bia (a atribuicao do rascunho continua)
    await chamar("POST", `${url}/restaurar-turma`, { turmaId: ids.t1 });
    expect((await doRascunho("Plano F")).filter((h) => h.turmaId === ids.t1 && h.disciplinaId === ids.mat).map((h) => h.professorId)).toEqual([ids.bia, ids.bia]);

    // aplicar na escola
    r = await chamar("POST", `${url}/promover`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ atribuicaoAplicada: 1, disponibilidadeAplicada: 1 });
    expect((await oficialDe(ids.t1)).filter((h) => h.disciplinaId === ids.mat).map((h) => h.professorId)).toEqual([ids.bia, ids.bia]); // Bia recebeu
    expect((await db.select().from(horariosTable).where(and(eq(horariosTable.escolaId, E), eq(horariosTable.professorId, ids.ana), eq(horariosTable.turmaId, ids.t1))))).toEqual([]); // Ana saiu da 1A
    expect((await db.select().from(horariosTable).where(and(eq(horariosTable.escolaId, E), eq(horariosTable.professorId, ids.ana))))).toHaveLength(1); // ficou so a Mat da 1B
    const [td] = await db.select().from(turmaDisciplinasTable).where(eq(turmaDisciplinasTable.id, ids.tdMat1));
    expect(td!.professorId).toBe(ids.bia);
    expect((await db.select().from(disponibilidadeTable).where(eq(disponibilidadeTable.professorId, ids.ana)))
      .filter((d) => !d.disponivel && !d.horaAtividadeObrigatoria).map((d) => [d.diaSemana, d.horarioSlot])).toEqual([[4, 3]]); // o bloqueio do rascunho valeu
    expect((await chamar("GET", "/horarios/rascunho/atual")).body).toEqual({ rascunho: null });
    expect(await doRascunho("Plano F")).toEqual([]);

    // voltar a grade anterior: tudo como antes
    expect((await chamar("POST", `/horarios/backups/${r.body.backupId}/restaurar`)).status).toBe(200);
    expect((await oficialDe(ids.t1)).map((h) => h.professorId).sort()).toEqual([ids.ana, ids.ana, ids.caio].sort());
    const [volta] = await db.select().from(turmaDisciplinasTable).where(eq(turmaDisciplinasTable.id, ids.tdMat1));
    expect(volta!.professorId).toBe(ids.ana);
    const bloqueiosAna = (await db.select().from(disponibilidadeTable).where(eq(disponibilidadeTable.professorId, ids.ana))).filter((d) => !d.disponivel && !d.horaAtividadeObrigatoria);
    expect(bloqueiosAna).toEqual([]);
  });

  it("[RASCUNHO-ALCANCE] rascunho so de turmas escolhidas; turma de fora entra ao trocar o professor", async () => {
    expect((await chamar("POST", "/horarios/rascunho/atual", { nome: "So 1A", alcance: "turmas", turmaIds: [] })).status).toBe(400);
    expect((await chamar("POST", "/horarios/rascunho/atual", { nome: "So tarde", alcance: "vespertino" })).status).toBe(400); // a escola nao tem tarde
    const r = await chamar("POST", "/horarios/rascunho/atual", { nome: "So 1A", alcance: "turmas", turmaIds: [ids.t1] });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ aulas: 3, alcance: "turmas", turmaIds: [ids.t1] });
    expect((await chamar("GET", "/horarios/rascunho/atual")).body.rascunho).toMatchObject({ alcance: "turmas", turmaIds: [ids.t1], aulas: 3 });
    expect(new Set((await doRascunho("So 1A")).map((h) => h.turmaId))).toEqual(new Set([ids.t1]));
    // Portugues da 1B (fora do rascunho): Caio -> Bia; a 1B entra no rascunho e a aula passa para a Bia
    const t = await chamar("PUT", `/horarios/experimentais/${enc("So 1A")}/atribuicoes`, { turmaDisciplinaId: ids.tdPor2, professorId: ids.bia, confirmar: true });
    expect(t.body).toMatchObject({ aplicado: true, aulasAtualizadas: 1 });
    expect((await doRascunho("So 1A")).filter((h) => h.turmaId === ids.t2).map((h) => [h.disciplinaId, h.professorId]).sort())
      .toEqual([[ids.mat, ids.ana], [ids.por, ids.bia]].sort());
    await chamar("DELETE", "/horarios/rascunho/atual");
    expect((await oficialDe(ids.t2)).map((h) => h.professorId).sort()).toEqual([ids.ana, ids.caio].sort()); // a escola nao mudou
  });

  it("[CHOQUE-ANTES-DE-GRAVAR] rascunho com professor em duas turmas no mesmo horario nao e aplicado, e diz qual", async () => {
    await chamar("POST", "/horarios/rascunho/atual", { nome: "Plano H", alcance: "matutino" });
    const url = `/horarios/experimentais/${enc("Plano H")}`;
    // Caio com Portugues na 1B na segunda 1a e, confirmando o aviso, a Matematica da 1A (segunda 1a e 2a) tambem
    await db.insert(horariosExperimentaisTable).values({ escolaId: E, nome: "Plano H", turmaId: ids.t2, disciplinaId: ids.por, professorId: ids.caio, diaSemana: 0, numeroAula: 1 });
    await chamar("PUT", `${url}/atribuicoes`, { turmaDisciplinaId: ids.tdMat1, professorId: ids.caio, confirmar: true });
    const c = await chamar("GET", `${url}/choques`);
    expect(c.body.choques).toHaveLength(1);
    expect(c.body.choques[0]).toContain("Caio: segunda, 1ª aula");
    // [CHOQUE-NA-SIMULACAO] a simulacao tambem traz os choques (o veredito so compara janelas)
    const sim = await chamar("GET", `${url}/simulacao`);
    expect(sim.status).toBe(200);
    expect(sim.body.choques).toEqual(c.body.choques);
    const antes = (await oficialDe(ids.t1)).map((h) => `${lugar(h)}|${h.professorId}`).sort();
    const r = await chamar("POST", `${url}/promover`);
    expect(r.status).toBe(409);
    expect(r.body.choques).toHaveLength(1);
    expect((await oficialDe(ids.t1)).map((h) => `${lugar(h)}|${h.professorId}`).sort()).toEqual(antes); // nada aplicado
    const [td] = await db.select().from(turmaDisciplinasTable).where(eq(turmaDisciplinasTable.id, ids.tdMat1));
    expect(td!.professorId).toBe(ids.ana); // nem a atribuicao
    expect((await chamar("GET", "/horarios/rascunho/atual")).body.rascunho?.nome).toBe("Plano H"); // o rascunho continua
    await chamar("DELETE", "/horarios/rascunho/atual");
  });

  it("[CHOQUE-ANTES-DE-GRAVAR] lancar aula com choque na grade oficial responde 409 com a mensagem da trava", async () => {
    // Ana ja da Matematica na 1A na segunda 1a
    const r = await chamar("POST", "/horarios", { turmaId: ids.t2, disciplinaId: ids.mat, professorId: ids.ana, diaSemana: 0, numeroAula: 1 });
    expect(r.status).toBe(409);
    expect(r.body.error).toContain("1A");
  });

  it("[TROCA-LEVA-AULAS] trocar o professor em Turmas passa as aulas da grade; com choque, avisa e as aulas ficam", async () => {
    const urlMat1 = `/turmas/${ids.t1}/disciplinas/linha/${ids.tdMat1}`;
    // Ana -> Bia: sem choque, as 2 aulas de Matematica da 1A passam para a Bia
    let r = await chamar("PATCH", urlMat1, { professorId: ids.bia });
    expect(r.body).toMatchObject({ aplicado: true, aulasPassadas: 2 });
    expect((await oficialDe(ids.t1)).filter((h) => h.disciplinaId === ids.mat).map((h) => h.professorId)).toEqual([ids.bia, ids.bia]);
    // Bia -> Caio, mas o Caio tem aula na 1B na segunda 1a: avisa e, sem confirmar, nada muda
    const [extra] = await db.insert(horariosTable).values({ escolaId: E, turmaId: ids.t2, disciplinaId: ids.por, professorId: ids.caio, diaSemana: 0, numeroAula: 1 } as any).returning();
    r = await chamar("PATCH", urlMat1, { professorId: ids.caio });
    expect(r.body).toMatchObject({ aplicado: false, aulasNaGrade: 2 });
    expect(r.body.choques).toHaveLength(1);
    let [td] = await db.select().from(turmaDisciplinasTable).where(eq(turmaDisciplinasTable.id, ids.tdMat1));
    expect(td!.professorId).toBe(ids.bia);
    // confirmando: troca o vinculo, as aulas ficam com a Bia e a resposta explica
    r = await chamar("PATCH", urlMat1, { professorId: ids.caio, confirmar: true });
    expect(r.body).toMatchObject({ aplicado: true, aulasPassadas: 0 });
    expect(r.body.aviso).toContain("continuam com o anterior");
    [td] = await db.select().from(turmaDisciplinasTable).where(eq(turmaDisciplinasTable.id, ids.tdMat1));
    expect(td!.professorId).toBe(ids.caio);
    expect((await oficialDe(ids.t1)).filter((h) => h.disciplinaId === ids.mat).map((h) => h.professorId)).toEqual([ids.bia, ids.bia]);
    // volta como estava
    await db.delete(horariosTable).where(eq(horariosTable.id, extra!.id));
    await chamar("PATCH", urlMat1, { professorId: ids.bia, confirmar: true });
    r = await chamar("PATCH", urlMat1, { professorId: ids.ana });
    expect(r.body).toMatchObject({ aplicado: true, aulasPassadas: 2 });
  });
});
