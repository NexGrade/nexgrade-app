import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db, disciplinasTable, disponibilidadeTable, horariosExperimentaisTable, horariosTable, horarioSlotsTable, professoresTable, turmaDisciplinasTable, turmasTable } from "@workspace/db";
import { exigirAdminParaAlterar } from "../../lib/permissao";
import disponibilidadeRouter from "../disponibilidade";
import horariosRouter from "../horarios";

// [RESOLVER-BLOQUEIO] (12/11/2026) Caso do Nicolas (Romario, rascunho da manha) em miniatura: bloqueado quarta e quinta no
// rascunho com aula na quinta; turma cheia, sem troca de duas aulas que resolva; a saida e o ciclo de tres aulas.
// So roda com TEST_DATABASE_URL.
const TEM_BANCO = !!process.env.TEST_DATABASE_URL;
const E = `rbloq_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const NOME = "Plano N";
const URL_EXP = `/horarios/experimentais/${encodeURIComponent(NOME)}`;

let server: Server;
let porta = 0;
async function chamar(metodo: string, caminho: string, corpo?: unknown) {
  const r = await fetch(`http://127.0.0.1:${porta}${caminho}`, { method: metodo, headers: { "Content-Type": "application/json", "x-cargo": "direcao" }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  const tipo = r.headers.get("content-type") ?? "";
  return { status: r.status, body: (tipo.includes("json") ? await r.json() : await r.text()) as any };
}
const ids = { nic: 0, and: 0, tha: 0, fil: 0, t: 0, u: 0 };
const doRascunho = () => db.select().from(horariosExperimentaisTable).where(and(eq(horariosExperimentaisTable.escolaId, E), eq(horariosExperimentaisTable.nome, NOME)));
const lugarDe = async (prof: number, turmaId: number) => (await doRascunho()).filter((h) => h.professorId === prof && h.turmaId === turmaId).map((h) => `${h.diaSemana}-${h.numeroAula}`).sort();

describe.skipIf(!TEM_BANCO)("ver como resolver: aula em horario bloqueado (caso do Nicolas)", () => {
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
    server = app.listen(0);
    porta = (server.address() as AddressInfo).port;

    // manha com 2 aulas por dia: a turma 9MF fica cheia (10 aulas), sem horario vago
    for (const [n, h] of [[1, "07:30"], [2, "08:20"]] as const)
      await db.insert(horarioSlotsTable).values({ escolaId: E, turno: "matutino", nivelEnsino: "fundamental", numeroAula: n, horaInicio: h, duracaoMinutos: 50, letivo: true } as any);
    const disc: Record<string, number> = {};
    for (const nome of ["Matemática", "Inglês", "Português", "Ciências"]) {
      const [d] = await db.insert(disciplinasTable).values({ escolaId: E, nome, sigla: nome.slice(0, 3).toUpperCase() } as any).returning();
      disc[nome] = d!.id;
    }
    const [t] = await db.insert(turmasTable).values({ escolaId: E, nome: "9MF", serie: "9", anoLetivo: 2026, turno: "matutino", nivelEnsino: "fundamental" } as any).returning();
    const [u] = await db.insert(turmasTable).values({ escolaId: E, nome: "9ME", serie: "9", anoLetivo: 2026, turno: "matutino", nivelEnsino: "fundamental" } as any).returning();
    const p: Record<string, number> = {};
    for (const nome of ["Nicolas", "Andrew", "Thayná", "Ione"]) {
      const [x] = await db.insert(professoresTable).values({ escolaId: E, nome, email: `${nome}.${E}@escola.test` }).returning();
      p[nome] = x!.id;
    }
    Object.assign(ids, { nic: p.Nicolas, and: p.Andrew, tha: p["Thayná"], fil: p.Ione, t: t!.id, u: u!.id });
    for (const [turmaId, d, prof] of [[t!.id, "Matemática", p.Nicolas], [t!.id, "Inglês", p.Andrew], [t!.id, "Português", p["Thayná"]], [t!.id, "Ciências", p.Ione], [u!.id, "Matemática", p.Nicolas]] as const)
      await db.insert(turmaDisciplinasTable).values({ turmaId, disciplinaId: disc[d]!, professorId: prof } as any);
    const aula = (turmaId: number, d: string, professorId: number, diaSemana: number, numeroAula: number) => ({ escolaId: E, turmaId, disciplinaId: disc[d]!, professorId, diaSemana, numeroAula } as any);
    await db.insert(horariosTable).values([
      // 9MF: Nicolas qui 2a, Andrew sex 2a, Thayna qui 1a; Ione no resto
      aula(t!.id, "Matemática", p.Nicolas!, 3, 2), aula(t!.id, "Inglês", p.Andrew!, 4, 2), aula(t!.id, "Português", p["Thayná"]!, 3, 1),
      ...[[0, 1], [0, 2], [1, 1], [1, 2], [2, 1], [2, 2], [4, 1]].map(([d, a]) => aula(t!.id, "Ciências", p.Ione!, d!, a!)),
      // 9ME: Nicolas seg, ter e sex 1a (fica livre na 9MF so na sexta 2a)
      ...[[0, 1], [0, 2], [1, 1], [1, 2], [4, 1]].map(([d, a]) => aula(u!.id, "Matemática", p.Nicolas!, d!, a!)),
    ]);
    // bloqueios oficiais: Andrew e Ione na quinta 2a (a troca simples com eles nao serve)
    for (const prof of [p.Andrew!, p.Ione!])
      await db.insert(disponibilidadeTable).values({ professorId: prof, diaSemana: 3, horarioSlot: 2, turno: "matutino", disponivel: false, motivo: "Importado do sistema anterior (indisponível)", horaAtividadeObrigatoria: false } as any);
  });

  afterAll(async () => {
    await new Promise<void>((ok) => (server ? server.close(() => ok()) : ok()));
    await db.execute(sql.raw(`delete from disponibilidade_professores where professor_id in (select id from professores where escola_id = '${E}')`));
    for (const tb of ["configuracoes", "atribuicao_experimental", "experimentos", "disponibilidade_experimental", "horarios_experimentais", "grade_backups", "horarios", "horario_slots", "turmas", "disciplinas", "professores"])
      await db.execute(sql.raw(`delete from ${tb} where escola_id = '${E}'`));
  });

  it("sugere o ciclo de tres aulas, aplica so no rascunho e o promover deixa de recusar", async () => {
    expect((await chamar("POST", "/horarios/rascunho/atual", { nome: NOME, alcance: "matutino" })).status).toBe(201);
    // Nicolas bloqueado quarta e quinta no rascunho (pede confirmacao: ha aula dele na quinta 2a)
    const itens = [2, 3].flatMap((d) => [1, 2].map((a) => ({ diaSemana: d, horarioSlot: a, turno: "matutino", disponivel: false, motivo: "Bloqueio (definido na tela)", horaAtividadeObrigatoria: false })));
    expect((await chamar("POST", `/disponibilidade/lote?experimento=${encodeURIComponent(NOME)}`, { professorId: ids.nic, itens })).status).toBe(409);
    expect((await chamar("POST", `/disponibilidade/lote?experimento=${encodeURIComponent(NOME)}`, { professorId: ids.nic, itens, confirmar: true })).status).toBe(201);
    expect((await chamar("GET", `${URL_EXP}/choques`)).body.bloqueios).toEqual(["Nicolas tem bloqueio na quinta, 2ª aula (manhã), onde está a aula da 9MF."]);

    const r = await chamar("GET", `${URL_EXP}/resolver-bloqueios`);
    expect(r.status).toBe(200);
    expect(r.body.bloqueios).toHaveLength(1);
    const [item] = r.body.bloqueios;
    expect(item.texto).toBe("Nicolas tem bloqueio na quinta 2ª aula, onde está a aula da 9MF");
    // nenhuma troca de duas aulas resolve; a unica saida e o ciclo
    expect(item.opcoes.map((o: any) => o.ciclo.length)).toEqual([3]);
    const op = item.opcoes[0];
    expect(op.ciclo).toEqual([{ diaSemana: 3, numeroAula: 2 }, { diaSemana: 4, numeroAula: 2 }, { diaSemana: 3, numeroAula: 1 }]);
    expect(op.texto).toBe("9MF: Matemática (Nicolas) da quinta 2ª vai para a sexta 2ª; Inglês (Andrew) da sexta 2ª vai para a quinta 1ª; Português (Thayná) da quinta 1ª vai para a quinta 2ª");

    const oficialAntes = (await db.select().from(horariosTable).where(eq(horariosTable.escolaId, E))).map((h) => `${h.professorId}|${h.diaSemana}-${h.numeroAula}`).sort();
    const a = await chamar("POST", `${URL_EXP}/resolver-bloqueios/aplicar`, { turmaId: op.turmaId, ciclo: op.ciclo });
    expect(a.status).toBe(200);
    expect(await lugarDe(ids.nic, ids.t)).toEqual(["4-2"]);
    expect(await lugarDe(ids.and, ids.t)).toEqual(["3-1"]);
    expect(await lugarDe(ids.tha, ids.t)).toEqual(["3-2"]);
    // a escola nao mudou; o rascunho ficou sem choque e sem aula em bloqueio
    expect((await db.select().from(horariosTable).where(eq(horariosTable.escolaId, E))).map((h) => `${h.professorId}|${h.diaSemana}-${h.numeroAula}`).sort()).toEqual(oficialAntes);
    expect((await chamar("GET", `${URL_EXP}/choques`)).body).toEqual({ choques: [], bloqueios: [] });
    expect((await chamar("GET", `${URL_EXP}/resolver-bloqueios`)).body).toEqual({ bloqueios: [] });
    const sim = await chamar("GET", `${URL_EXP}/simulacao`);
    expect(sim.status).toBe(200);
    expect(sim.body.bloqueios).toEqual([]);
    // a mesma opcao de novo ja nao vale (o rascunho mudou)
    expect((await chamar("POST", `${URL_EXP}/resolver-bloqueios/aplicar`, { turmaId: op.turmaId, ciclo: op.ciclo })).status).toBe(409);
    // opcao inventada (nao sugerida) e recusada
    expect((await chamar("POST", `${URL_EXP}/resolver-bloqueios/aplicar`, { turmaId: op.turmaId, ciclo: [{ diaSemana: 0, numeroAula: 1 }, { diaSemana: 0, numeroAula: 2 }] })).status).toBe(409);
    // e o promover passa
    expect((await chamar("POST", `${URL_EXP}/promover`)).status).toBe(200);
  });
});
