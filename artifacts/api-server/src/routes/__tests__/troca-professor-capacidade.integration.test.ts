import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  db, disciplinasTable, disponibilidadeTable, horariosTable, horarioSlotsTable,
  professoresTable, turmaDisciplinasTable, turmasTable,
} from "@workspace/db";
import { exigirAdminParaAlterar } from "../../lib/permissao";
import horariosRouter from "../horarios";
import turmasRouter from "../turmas";

// [TROCA-CONTA-CAPACIDADE] (11/11/2026) Achado no video tutorial (Escola Demonstracao, 1MA EM, Educacao Fisica,
// Patricia -> Diego): com choque, as aulas da grade ficavam com a Patricia, o vinculo ia para o Diego e a geracao
// seguinte da manha nao fechava (Diego: 5 aulas, 3 horarios livres) sem que a tela de Turmas dissesse nada.
// Decisao da dona: a troca continua possivel, mas a pergunta antes de gravar diz que a proxima geracao usa o novo e
// mostra a conta de capacidade dele. So roda com TEST_DATABASE_URL.
const TEM_BANCO = !!process.env.TEST_DATABASE_URL;
const E = `trcap_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

let server: Server;
let porta = 0;
async function chamar(metodo: string, caminho: string, corpo?: unknown) {
  const r = await fetch(`http://127.0.0.1:${porta}${caminho}`, {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const tipo = r.headers.get("content-type") ?? "";
  const body: any = tipo.includes("json") ? await r.json() : await r.text();
  return { status: r.status, body };
}
const ids = { patricia: 0, diego: 0, carla: 0, edf: 0, mat: 0, tA: 0, tB: 0, tdEdf: 0 };
const vinculo = async () => (await db.select().from(turmaDisciplinasTable).where(eq(turmaDisciplinasTable.id, ids.tdEdf)))[0]!.professorId;
const donosDasAulasEdf = async () => (await db.select().from(horariosTable)
  .where(and(eq(horariosTable.escolaId, E), eq(horariosTable.turmaId, ids.tA), eq(horariosTable.disciplinaId, ids.edf))))
  .map((h) => h.professorId);

describe.skipIf(!TEM_BANCO)("trocar professor em Turmas: choque e capacidade do novo", () => {
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
    app.use("/horarios", horariosRouter);
    app.use("/turmas", turmasRouter);
    server = app.listen(0);
    porta = (server.address() as AddressInfo).port;

    // manha com 3 aulas por dia, 5 dias = 15 horarios
    for (const [n, h] of [[1, "07:30"], [2, "08:20"], [3, "09:10"]] as const) {
      await db.insert(horarioSlotsTable).values({ escolaId: E, turno: "matutino", numeroAula: n, horaInicio: h, duracaoMinutos: 50, letivo: true } as any);
    }
    const [edf] = await db.insert(disciplinasTable).values({ escolaId: E, nome: "Educação Física", sigla: "EDF", cargaSemanal: 2 } as any).returning();
    const [mat] = await db.insert(disciplinasTable).values({ escolaId: E, nome: "Matemática", sigla: "MAT", cargaSemanal: 3 } as any).returning();
    const [tA] = await db.insert(turmasTable).values({ escolaId: E, nome: "1MA EM", serie: "1", anoLetivo: 2026, turno: "matutino" } as any).returning();
    const [tB] = await db.insert(turmasTable).values({ escolaId: E, nome: "1MB EM", serie: "1", anoLetivo: 2026, turno: "matutino" } as any).returning();
    const [patricia] = await db.insert(professoresTable).values({ escolaId: E, nome: "Patrícia Fernandes", email: `patricia.${E}@escola.test` }).returning();
    const [diego] = await db.insert(professoresTable).values({ escolaId: E, nome: "Diego Ferreira", email: `diego.${E}@escola.test` }).returning();
    const [carla] = await db.insert(professoresTable).values({ escolaId: E, nome: "Carla Souza", email: `carla.${E}@escola.test` }).returning();
    const [tdEdf] = await db.insert(turmaDisciplinasTable).values({ turmaId: tA!.id, disciplinaId: edf!.id, professorId: patricia!.id } as any).returning();
    await db.insert(turmaDisciplinasTable).values({ turmaId: tB!.id, disciplinaId: mat!.id, professorId: diego!.id } as any);
    // Diego so tem 3 horarios livres na manha (seg 1a, ter 2a, qua 3a), todos com aula de Matematica na 1MB
    const livresDiego = new Set(["0-1", "1-2", "2-3"]);
    const bloqueios = [];
    for (let dia = 0; dia < 5; dia++) for (let a = 1; a <= 3; a++) {
      if (!livresDiego.has(`${dia}-${a}`)) bloqueios.push({ professorId: diego!.id, diaSemana: dia, horarioSlot: a, turno: "matutino", disponivel: false, motivo: "Outra escola" });
    }
    await db.insert(disponibilidadeTable).values(bloqueios as any);
    const aula = (turmaId: number, disciplinaId: number, professorId: number, diaSemana: number, numeroAula: number) => ({ escolaId: E, turmaId, disciplinaId, professorId, diaSemana, numeroAula } as any);
    await db.insert(horariosTable).values([
      aula(tB!.id, mat!.id, diego!.id, 0, 1), aula(tB!.id, mat!.id, diego!.id, 1, 2), aula(tB!.id, mat!.id, diego!.id, 2, 3),
      // Educacao Fisica da 1MA com a Patricia: seg 1a (choque com o Diego na 1MB) e qui 1a
      aula(tA!.id, edf!.id, patricia!.id, 0, 1), aula(tA!.id, edf!.id, patricia!.id, 3, 1),
    ]);
    Object.assign(ids, { patricia: patricia!.id, diego: diego!.id, carla: carla!.id, edf: edf!.id, mat: mat!.id, tA: tA!.id, tB: tB!.id, tdEdf: tdEdf!.id });
  });

  afterAll(async () => {
    await new Promise<void>((ok) => (server ? server.close(() => ok()) : ok()));
    if (ids.diego) await db.delete(disponibilidadeTable).where(inArray(disponibilidadeTable.professorId, [ids.patricia, ids.diego, ids.carla]));
    for (const t of ["configuracoes", "grade_backups", "horarios", "horario_slots", "turmas", "disciplinas", "professores"]) {
      await db.execute(sql.raw(`delete from ${t} where escola_id = '${E}'`));
    }
  });

  it("sem confirmar: avisa o choque e que o Diego nao cabe na manha, e nada muda", async () => {
    const r = await chamar("PATCH", `/turmas/${ids.tA}/disciplinas/linha/${ids.tdEdf}`, { professorId: ids.diego });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ aplicado: false, aulasNaGrade: 2 });
    expect(r.body.choques).toHaveLength(1);
    expect(r.body.capacidade).toHaveLength(1);
    expect(r.body.capacidade[0]).toContain("Diego Ferreira: 5 aula(s) na manhã, mas só 3 horário(s) livre(s)");
    expect(await vinculo()).toBe(ids.patricia);
    expect(await donosDasAulasEdf()).toEqual([ids.patricia, ids.patricia]);
  });

  it("confirmando: o vinculo vai para o Diego, as aulas ficam com a Patricia e o aviso explica a proxima geracao", async () => {
    const r = await chamar("PATCH", `/turmas/${ids.tA}/disciplinas/linha/${ids.tdEdf}`, { professorId: ids.diego, confirmar: true });
    expect(r.body).toMatchObject({ aplicado: true, aulasPassadas: 0 });
    expect(r.body.aviso).toContain("continuam com o anterior");
    expect(r.body.aviso).toContain("A próxima geração do turno já usa o professor novo");
    expect(r.body.aviso).toContain("Atenção: Diego Ferreira: 5 aula(s) na manhã");
    expect(await vinculo()).toBe(ids.diego);
    expect(await donosDasAulasEdf()).toEqual([ids.patricia, ids.patricia]);
  });

  it("o painel de capacidade da tela de gerar tambem acusa o Diego antes de gerar a manha", async () => {
    const r = await chamar("GET", "/horarios/capacidade?turno=matutino");
    expect(r.status).toBe(200);
    const diego = r.body.problemas.find((p: any) => p.professorId === ids.diego);
    expect(diego).toMatchObject({ nivel: "erro" });
    expect(diego.mensagem).toContain("a grade não fecha");
  });

  it("troca para quem cabe e nao tem choque: grava direto, sem perguntar", async () => {
    // volta para a Patricia (as aulas ja sao dela; ela cabe): direto
    let r = await chamar("PATCH", `/turmas/${ids.tA}/disciplinas/linha/${ids.tdEdf}`, { professorId: ids.patricia });
    expect(r.body).toMatchObject({ aplicado: true });
    expect(r.body.capacidade).toBeUndefined();
    // Patricia -> Carla (livre a semana toda): as 2 aulas passam junto, sem aviso de capacidade
    r = await chamar("PATCH", `/turmas/${ids.tA}/disciplinas/linha/${ids.tdEdf}`, { professorId: ids.carla });
    expect(r.body).toMatchObject({ aplicado: true, aulasPassadas: 2 });
    expect(r.body.aviso ?? "").not.toContain("Atenção");
    expect(await vinculo()).toBe(ids.carla);
    expect(await donosDasAulasEdf()).toEqual([ids.carla, ids.carla]);
  });
});
