import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import {
  db, disciplinasTable, disponibilidadeTable, disponibilidadeExperimentalTable, gradeBackupsTable, horariosExperimentaisTable,
  horariosTable, horarioSlotsTable, professoresTable, turmasTable, turmaDisciplinasTable,
} from "@workspace/db";
import { exigirAdminParaAlterar } from "../../lib/permissao";
import disponibilidadeRouter from "../disponibilidade";
import horariosRouter from "../horarios";
import { comExperimento, sobreporExperimento, sobreporAtribuicao, middlewareDisponibilidadeExperimental } from "../../lib/disponibilidade-experimento";

// [DISP-EXPERIMENTAL] (06/11/2026) Disponibilidade dentro de um experimento, com Postgres de verdade (migracao 0008):
// editar so no experimento, a oficial intacta, as leituras do experimento enxergando a mudanca, promover aplicando
// tudo e a copia de seguranca desfazendo. So roda com TEST_DATABASE_URL.
const TEM_BANCO = !!process.env.TEST_DATABASE_URL;
const E = `dexp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const EXP = "Teste Ana sem segunda";

let server: Server;
let porta = 0;
async function chamar(metodo: string, caminho: string, corpo?: unknown) {
  const r = await fetch(`http://127.0.0.1:${porta}${caminho}`, {
    method: metodo,
    headers: { "Content-Type": "application/json", "x-cargo": "direcao" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const tipo = r.headers.get("content-type") ?? "";
  const body: any = tipo.includes("json") ? await r.json() : await r.text();
  return { status: r.status, body };
}
const ids = { ana: 0, turma: 0, disc: 0, bia: 0, td: 0 };
const dispOficial = () => db.select().from(disponibilidadeTable).where(eq(disponibilidadeTable.professorId, ids.ana));
const enc = encodeURIComponent;

describe.skipIf(!TEM_BANCO)("disponibilidade em experimento: integracao com banco real", () => {
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
    // rota de teste atras do mesmo middleware das rotas de experimento: devolve a disponibilidade que ela enxerga
    const sonda = express.Router();
    sonda.use(middlewareDisponibilidadeExperimental);
    const ver = async (_req: any, res: any) => {
      await new Promise((ok) => setTimeout(ok, 5)); // o contexto sobrevive a esperas
      const r = await db.select().from(disponibilidadeTable).where(eq(disponibilidadeTable.professorId, ids.ana));
      res.json(sobreporExperimento(r, (d) => d.professorId === ids.ana).filter((d) => !d.disponivel).map((d) => `${d.diaSemana}-${d.horarioSlot}`).sort());
    };
    sonda.post("/gerar", ver);
    sonda.get("/experimentais/:nome/simulacao", ver);
    sonda.get("/pdf", ver);
    app.use("/sonda", sonda);
    server = app.listen(0);
    porta = (server.address() as AddressInfo).port;

    const [disc] = await db.insert(disciplinasTable).values({ escolaId: E, nome: "Matemática", sigla: "MAT" } as any).returning();
    const [turma] = await db.insert(turmasTable).values({ escolaId: E, nome: "1ºA", serie: "1", anoLetivo: 2026, turno: "matutino", nivelEnsino: "medio_tecnico" } as any).returning();
    for (const [n, h] of [[1, "07:30"], [2, "08:20"]] as const)
      await db.insert(horarioSlotsTable).values({ escolaId: E, turno: "matutino", nivelEnsino: "medio_tecnico", numeroAula: n, horaInicio: h, duracaoMinutos: 50, letivo: true } as any);
    const [ana] = await db.insert(professoresTable).values({ escolaId: E, nome: "Ana", email: `ana.${E}@escola.test` }).returning();
    Object.assign(ids, { ana: ana!.id, turma: turma!.id, disc: disc!.id });
    // [EXPERIMENTO-COMPLETO] Bia (outra professora) e a linha da disciplina na turma (professora oficial: Ana)
    const [bia] = await db.insert(professoresTable).values({ escolaId: E, nome: "Bia", email: `bia.${E}@escola.test` }).returning();
    const [td] = await db.insert(turmaDisciplinasTable).values({ turmaId: turma!.id, disciplinaId: disc!.id, professorId: ana!.id } as any).returning();
    Object.assign(ids, { bia: bia!.id, td: td!.id });
    await db.insert(horariosTable).values({ escolaId: E, turmaId: turma!.id, disciplinaId: disc!.id, professorId: ana!.id, diaSemana: 1, numeroAula: 1 } as any);
    // oficial: Ana bloqueada na quinta, 2a aula
    await db.insert(disponibilidadeTable).values({ professorId: ana!.id, diaSemana: 3, horarioSlot: 2, turno: "matutino", disponivel: false, motivo: "Bloqueio (definido na tela)" });
  });

  afterAll(async () => {
    await new Promise<void>((ok) => (server ? server.close(() => ok()) : ok()));
    for (const t of ["atribuicao_experimental", "experimentos", "disponibilidade_experimental", "horarios_experimentais", "grade_backups", "horarios", "horario_slots", "turmas", "disciplinas", "professores"]) {
      await db.execute(sql.raw(`delete from ${t} where escola_id = '${E}'`));
    }
  });

  it("grava so no experimento: a oficial nao muda e o experimento enxerga a mudanca", async () => {
    const r = await chamar("POST", `/disponibilidade/lote?experimento=${enc(EXP)}`, { professorId: ids.ana, itens: [
      { diaSemana: 0, horarioSlot: 1, turno: "matutino", disponivel: false, motivo: "Bloqueio (definido na tela)", horaAtividadeObrigatoria: false },
      { diaSemana: 0, horarioSlot: 2, turno: "matutino", disponivel: false, motivo: "Bloqueio (definido na tela)", horaAtividadeObrigatoria: false },
      { diaSemana: 3, horarioSlot: 2, turno: "matutino", disponivel: true, motivo: "", horaAtividadeObrigatoria: false }, // libera a quinta
    ] });
    expect(r.status).toBe(201);
    expect((await dispOficial()).map((d) => [d.diaSemana, d.horarioSlot, d.disponivel])).toEqual([[3, 2, false]]);
    const noExp = await chamar("GET", `/disponibilidade?professorId=${ids.ana}&experimento=${enc(EXP)}`);
    const estado = Object.fromEntries(noExp.body.map((d: any) => [`${d.diaSemana}-${d.horarioSlot}`, [d.disponivel, !!d.noExperimento]]));
    expect(estado).toEqual({ "0-1": [false, true], "0-2": [false, true], "3-2": [true, true] });
    const semExp = await chamar("GET", `/disponibilidade?professorId=${ids.ana}`);
    expect(semExp.body).toHaveLength(1);
  });

  it("horario que volta a ficar igual a oficial sai do experimento; lista e detalhe das mudancas", async () => {
    await chamar("POST", `/disponibilidade/lote?experimento=${enc(EXP)}`, { professorId: ids.ana, itens: [
      { diaSemana: 3, horarioSlot: 2, turno: "matutino", disponivel: false, motivo: "Bloqueio (definido na tela)", horaAtividadeObrigatoria: false },
    ] });
    const lista = await chamar("GET", "/disponibilidade/experimentos");
    expect(lista.body.experimentos).toEqual([{ nome: EXP, mudancas: 2, professores: 1 }]);
    const det = await chamar("GET", `/disponibilidade/experimentos/${enc(EXP)}`);
    expect(det.body.mudancas.map((m: any) => [m.diaSemana, m.horarioSlot, m.antes, m.depois])).toEqual([[0, 1, "Livre", "Bloqueio"], [0, 2, "Livre", "Bloqueio"]]);
    expect((await chamar("POST", `/disponibilidade/lote?experimento=${enc(EXP)}`, { professorId: ids.ana, itens: [{ diaSemana: 0, horarioSlot: 1, disponivel: false, horaAtividadeObrigatoria: false }] })).status).toBe(400); // sem turno
  });

  it("leituras dentro do experimento enxergam a disponibilidade dele; fora dele, a oficial", async () => {
    const ler = () => dispOficial().then((r) => sobreporExperimento(r, (d) => d.professorId === ids.ana));
    expect((await ler()).length).toBe(1);
    const dentro = await comExperimento(E, EXP, ler);
    expect(dentro.filter((d) => !d.disponivel).map((d) => `${d.diaSemana}-${d.horarioSlot}`).sort()).toEqual(["0-1", "0-2", "3-2"]);
  });

  it("o middleware das rotas de experimento (corpo, URL e /experimentais/:nome/simulacao) liga a disponibilidade dele", async () => {
    const comMudanca = ["0-1", "0-2", "3-2"];
    expect((await chamar("POST", "/sonda/gerar", { nomeExperimental: EXP })).body).toEqual(comMudanca);
    expect((await chamar("GET", `/sonda/experimentais/${enc(EXP)}/simulacao`)).body).toEqual(comMudanca);
    expect((await chamar("GET", `/sonda/pdf?nomeExperimental=${enc(EXP)}`)).body).toEqual(comMudanca);
    expect((await chamar("POST", "/sonda/gerar", { nomeExperimental: EXP, experimental: false })).body).toEqual(["3-2"]);
    expect((await chamar("GET", "/sonda/pdf")).body).toEqual(["3-2"]);
  });

  it("experimento so com disponibilidade: nao promove (400) e pede para gerar", async () => {
    const r = await chamar("POST", `/horarios/experimentais/${enc(EXP)}/promover`);
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/Gere a grade/);
  });

  it("promover aplica a disponibilidade, apaga o experimento e a copia de seguranca desfaz", async () => {
    // a grade do experimento: Ana passa da segunda (1a aula) para a terca
    await db.insert(horariosExperimentaisTable).values({ escolaId: E, nome: EXP, turmaId: ids.turma, disciplinaId: ids.disc, professorId: ids.ana, diaSemana: 1, numeroAula: 2 });
    const r = await chamar("POST", `/horarios/experimentais/${enc(EXP)}/promover`);
    expect(r.status).toBe(200);
    expect(r.body.disponibilidadeAplicada).toBe(2);
    const bloqueios = (await dispOficial()).filter((d) => !d.disponivel && !d.horaAtividadeObrigatoria).map((d) => `${d.diaSemana}-${d.horarioSlot}`).sort();
    expect(bloqueios).toEqual(["0-1", "0-2", "3-2"]);
    expect(await db.select().from(disponibilidadeExperimentalTable).where(eq(disponibilidadeExperimentalTable.escolaId, E))).toEqual([]);
    const [backup] = await db.select().from(gradeBackupsTable).where(and(eq(gradeBackupsTable.escolaId, E), eq(gradeBackupsTable.id, r.body.backupId)));
    expect((backup!.dados as any).disponibilidade.chaves).toHaveLength(2);

    const volta = await chamar("POST", `/horarios/backups/${r.body.backupId}/restaurar`);
    expect(volta.status).toBe(200);
    const depois = (await dispOficial()).filter((d) => !d.disponivel && !d.horaAtividadeObrigatoria).map((d) => `${d.diaSemana}-${d.horarioSlot}`);
    expect(depois).toEqual(["3-2"]);
  });

  it("remover o experimento apaga tambem a disponibilidade dele (a oficial fica)", async () => {
    const OUTRO = "Outro teste";
    await chamar("POST", `/disponibilidade/lote?experimento=${enc(OUTRO)}`, { professorId: ids.ana, itens: [
      { diaSemana: 4, horarioSlot: 1, turno: "matutino", disponivel: false, motivo: "Bloqueio (definido na tela)", horaAtividadeObrigatoria: false },
    ] });
    const antes = (await dispOficial()).length;
    expect((await chamar("DELETE", `/horarios/experimentais/${enc(OUTRO)}`)).status).toBe(204);
    expect((await chamar("GET", "/disponibilidade/experimentos")).body.experimentos).toEqual([]);
    expect((await dispOficial()).length).toBe(antes);
  });

  // ── [EXPERIMENTO-COMPLETO] experimento como area de trabalho ──
  const COPIA = "Cópia da manhã";

  it("cria experimento copiando a grade oficial do turno; nome repetido recusa; aparece no resumo", async () => {
    const r = await chamar("POST", "/horarios/experimentos", { nome: COPIA, copiarOficial: "matutino" });
    expect(r.status).toBe(201);
    expect(r.body.aulasCopiadas).toBe(1);
    expect((await chamar("POST", "/horarios/experimentos", { nome: COPIA })).status).toBe(409);
    const vazio = await chamar("POST", "/horarios/experimentos", { nome: "Vazio" });
    expect(vazio.body.aulasCopiadas).toBe(0);
    const resumo = await chamar("GET", "/horarios/experimentos-resumo");
    expect(resumo.body.experimentos.map((e: any) => [e.nome, e.aulas])).toEqual(expect.arrayContaining([[COPIA, 1], ["Vazio", 0]]));
  });

  it("atribuicao no experimento: troca o professor so nele, as aulas dele passam para o novo e voltar a oficial limpa", async () => {
    const r = await chamar("PUT", `/horarios/experimentais/${enc(COPIA)}/atribuicoes`, { turmaDisciplinaId: ids.td, professorId: ids.bia });
    expect(r.status).toBe(200);
    expect(r.body.aulasAtualizadas).toBe(1);
    const lista = await chamar("GET", `/horarios/experimentais/${enc(COPIA)}/atribuicoes`);
    expect(lista.body.find((l: any) => l.turmaDisciplinaId === ids.td)).toMatchObject({ professorOficialId: ids.ana, professorId: ids.bia, mudou: true });
    const [oficial] = await db.select().from(turmaDisciplinasTable).where(eq(turmaDisciplinasTable.id, ids.td));
    expect(oficial!.professorId).toBe(ids.ana); // a oficial nao mudou
    const ler = () => db.select().from(turmaDisciplinasTable).where(eq(turmaDisciplinasTable.id, ids.td)).then((x) => sobreporAtribuicao(x));
    expect((await comExperimento(E, COPIA, ler))[0]!.professorId).toBe(ids.bia); // o motor ve a Bia dentro do experimento
    expect((await ler())[0]!.professorId).toBe(ids.ana);
    const exp = await db.select().from(horariosExperimentaisTable).where(and(eq(horariosExperimentaisTable.escolaId, E), eq(horariosExperimentaisTable.nome, COPIA)));
    expect(exp.map((h) => h.professorId)).toEqual([ids.bia]);
    // professor de fora recusa
    expect((await chamar("PUT", `/horarios/experimentais/${enc(COPIA)}/atribuicoes`, { turmaDisciplinaId: ids.td, professorId: 999999999 })).status).toBe(400);
  });

  it("trocar aulas no experimento: vago sem aviso troca direto; com bloqueio avisa e so troca confirmando", async () => {
    const url = `/horarios/experimentais/${enc(COPIA)}/trocar-aulas`;
    let r = await chamar("POST", url, { turmaId: ids.turma, de: { diaSemana: 1, numeroAula: 1 }, para: { diaSemana: 1, numeroAula: 2 } });
    expect(r.body).toEqual({ aplicado: true, avisos: [] });
    await db.insert(disponibilidadeTable).values({ professorId: ids.bia, diaSemana: 2, horarioSlot: 1, turno: "matutino", disponivel: false, motivo: "Bloqueio (definido na tela)" });
    r = await chamar("POST", url, { turmaId: ids.turma, de: { diaSemana: 1, numeroAula: 2 }, para: { diaSemana: 2, numeroAula: 1 } });
    expect(r.body.aplicado).toBe(false);
    expect(r.body.avisos).toEqual(["Bia tem bloqueio na quarta, 1ª aula."]);
    r = await chamar("POST", url, { turmaId: ids.turma, de: { diaSemana: 1, numeroAula: 2 }, para: { diaSemana: 2, numeroAula: 1 }, confirmar: true });
    expect(r.body.aplicado).toBe(true);
    const exp = await db.select().from(horariosExperimentaisTable).where(and(eq(horariosExperimentaisTable.escolaId, E), eq(horariosExperimentaisTable.nome, COPIA)));
    expect(exp.map((h) => [h.diaSemana, h.numeroAula])).toEqual([[2, 1]]);
    // de volta para o vago sem bloqueio (para o promover nao cair em cima do bloqueio)
    await chamar("POST", url, { turmaId: ids.turma, de: { diaSemana: 2, numeroAula: 1 }, para: { diaSemana: 1, numeroAula: 2 }, confirmar: true });
  });

  it("promover aplica a atribuicao na oficial e a copia de seguranca volta o professor", async () => {
    const r = await chamar("POST", `/horarios/experimentais/${enc(COPIA)}/promover`);
    expect(r.status).toBe(200);
    expect(r.body.atribuicaoAplicada).toBe(1);
    const [td] = await db.select().from(turmaDisciplinasTable).where(eq(turmaDisciplinasTable.id, ids.td));
    expect(td!.professorId).toBe(ids.bia);
    const oficial = await db.select().from(horariosTable).where(eq(horariosTable.escolaId, E));
    expect(oficial.map((h) => h.professorId)).toEqual([ids.bia]); // a aula da Ana saiu (professora trocada)
    expect((await chamar("GET", "/horarios/experimentos-resumo")).body.experimentos.map((e: any) => e.nome)).not.toContain(COPIA);
    expect((await chamar("POST", `/horarios/backups/${r.body.backupId}/restaurar`)).status).toBe(200);
    const [volta] = await db.select().from(turmaDisciplinasTable).where(eq(turmaDisciplinasTable.id, ids.td));
    expect(volta!.professorId).toBe(ids.ana);
  });

  it("sem a migracao 0008: tudo segue com a oficial e so a edicao no experimento avisa (503)", async () => {
    await db.execute(sql`alter table disponibilidade_experimental rename to dexp_off`);
    try {
      expect((await chamar("GET", "/disponibilidade/experimentos")).body).toEqual({ semTabela: true, experimentos: [] });
      expect((await chamar("GET", `/disponibilidade?professorId=${ids.ana}`)).status).toBe(200);
      expect((await chamar("GET", `/disponibilidade?professorId=${ids.ana}&experimento=x`)).status).toBe(503);
      expect((await chamar("POST", `/disponibilidade/lote?experimento=x`, { professorId: ids.ana, itens: [{ diaSemana: 4, horarioSlot: 1, turno: "matutino", disponivel: false, horaAtividadeObrigatoria: false }] })).status).toBe(503);
      expect(await comExperimento(E, "x", async () => "ok")).toBe("ok");
    } finally {
      await db.execute(sql`alter table dexp_off rename to disponibilidade_experimental`);
    }
  });
});
