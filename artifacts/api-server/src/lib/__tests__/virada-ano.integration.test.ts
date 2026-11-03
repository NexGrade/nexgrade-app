import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  db, pool, aulasFixasTable, disciplinasTable, disponibilidadeTable, horariosExperimentaisTable, horariosTable, professoresTable,
  trimestresLetivosTable, turmaDisciplinasTable, turmasTable, viradasAnoTable,
} from "@workspace/db";
import { desfazerVirada, executarVirada, liberarViradaAntes, previaVirada, situacaoVirada } from "../virada-ano";

// [VIRADA-ANO] (24/10/2026) virar o ano e desfazer, com um Postgres de verdade (so com TEST_DATABASE_URL).
const TEM_BANCO = !!process.env.TEST_DATABASE_URL;
const E = `virada_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

describe.skipIf(!TEM_BANCO)("virada do ano letivo (integração)", () => {
  const ids = { t6a: 0, t6b: 0, t9a: 0, pAna: 0, pBeto: 0, disc: 0 };

  beforeAll(async () => {
    const [d] = await db.insert(disciplinasTable).values({ escolaId: E, nome: "Matemática" }).returning();
    ids.disc = d!.id;
    const [ana, beto] = await db.insert(professoresTable).values([
      { escolaId: E, nome: "Ana", email: `ana.${E}@t.br` },
      { escolaId: E, nome: "Beto", email: `beto.${E}@t.br` },
    ]).returning();
    ids.pAna = ana!.id; ids.pBeto = beto!.id;
    const [t6a, t6b, t9a] = await db.insert(turmasTable).values([
      { escolaId: E, nome: "6A", serie: "6º Ano", turno: "vespertino", anoLetivo: 2026, codigoSere: 111 },
      { escolaId: E, nome: "6B", serie: "6º Ano", turno: "vespertino", anoLetivo: 2026, codigoSere: 112 },
      { escolaId: E, nome: "9A", serie: "9º Ano", turno: "matutino", anoLetivo: 2026, codigoSere: 113 },
    ]).returning();
    ids.t6a = t6a!.id; ids.t6b = t6b!.id; ids.t9a = t9a!.id;
    await db.insert(turmaDisciplinasTable).values([
      { turmaId: ids.t6a, disciplinaId: ids.disc, professorId: ids.pAna, cargaHorariaSemanalOverride: 5, aulasAssincronas: 1 },
      { turmaId: ids.t6b, disciplinaId: ids.disc, professorId: ids.pBeto, cargaHorariaSemanalOverride: 5 },
      { turmaId: ids.t9a, disciplinaId: ids.disc, professorId: ids.pAna, cargaHorariaSemanalOverride: 4 },
    ]);
    await db.insert(horariosTable).values([
      { escolaId: E, turmaId: ids.t6a, disciplinaId: ids.disc, professorId: ids.pAna, diaSemana: 0, numeroAula: 1 },
      { escolaId: E, turmaId: ids.t6b, disciplinaId: ids.disc, professorId: ids.pBeto, diaSemana: 0, numeroAula: 1 },
      { escolaId: E, turmaId: ids.t9a, disciplinaId: ids.disc, professorId: ids.pAna, diaSemana: 1, numeroAula: 2, fixa: true },
    ]);
    await db.insert(horariosExperimentaisTable).values({ escolaId: E, nome: "exp", turmaId: ids.t6a, disciplinaId: ids.disc, professorId: ids.pAna, diaSemana: 2, numeroAula: 3 });
    await db.insert(disponibilidadeTable).values([
      { professorId: ids.pAna, diaSemana: 4, horarioSlot: 5, disponivel: false, turno: "vespertino", horaAtividadeObrigatoria: true, motivo: "HA" },
      { professorId: ids.pBeto, diaSemana: 3, horarioSlot: 1, disponivel: false, turno: "vespertino", motivo: "outro vínculo" },
    ]);
    await db.insert(aulasFixasTable).values({ escolaId: E, turmaId: ids.t9a, disciplinaId: ids.disc, professorId: ids.pAna, diaSemana: 1, numeroAula: 2, anoLetivo: 2026 } as never);
    // fim do ano letivo bem no futuro: a virada so anda se a Nexus Core liberar
    await db.insert(trimestresLetivosTable).values({ escolaId: E, ano: 2026, trimestre: 3, dataInicio: "2026-09-08", dataFim: "2099-12-18", diasLetivos: 70 });
  });

  afterAll(async () => {
    await db.delete(viradasAnoTable).where(eq(viradasAnoTable.escolaId, E));
    await db.delete(trimestresLetivosTable).where(eq(trimestresLetivosTable.escolaId, E));
    await db.delete(horariosExperimentaisTable).where(eq(horariosExperimentaisTable.escolaId, E));
    await db.delete(turmasTable).where(eq(turmasTable.escolaId, E));
    await db.delete(professoresTable).where(eq(professoresTable.escolaId, E));
    await db.delete(disciplinasTable).where(eq(disciplinasTable.escolaId, E));
    await pool.end();
  });

  const plano = () => ({ excluirTurmas: [ids.t9a], duplicarTurmas: [{ origemId: ids.t6a, nome: "6C" }], professoresQueSaem: [ids.pBeto], confirmacao: "virar 2027" });

  it("fica bloqueada antes do fim do ano letivo, até a Nexus Core liberar", async () => {
    expect((await situacaoVirada(E, "2026-10-24")).liberada).toBe(false);
    expect((await executarVirada(E, plano(), "teste")).status).toBe(409);
    await liberarViradaAntes(E, "master@teste");
    expect((await situacaoVirada(E)).liberada).toBe(true);
  });

  it("mostra a prévia sem gravar nada", async () => {
    const p = await previaVirada(E);
    expect(p.turmas).toHaveLength(3);
    expect(p.zera).toEqual({ aulasOficiais: 3, experimentos: 1, disponibilidade: 2, codigosSere: 3, aulasFixas: 1 }); // [VIRADA-ZERA-FIXAS]
    expect((await db.select().from(horariosTable).where(eq(horariosTable.escolaId, E)))).toHaveLength(3);
  });

  it("recusa sem a confirmação", async () => {
    const r = await executarVirada(E, { ...plano(), confirmacao: "sim" }, "teste");
    expect(r.status).toBe(400);
  });

  it("vira o ano conforme o plano", async () => {
    const r = await executarVirada(E, plano(), "teste");
    expect(r.status).toBe(201);
    const turmas = await db.select().from(turmasTable).where(eq(turmasTable.escolaId, E));
    expect(turmas.map((t) => t.nome).sort()).toEqual(["6A", "6B", "6C"]);
    expect(turmas.every((t) => t.anoLetivo === 2027 && t.codigoSere === null)).toBe(true);
    const ids2 = turmas.map((t) => t.id);
    const vinc = await db.select().from(turmaDisciplinasTable).where(inArray(turmaDisciplinasTable.turmaId, ids2));
    const de = (nome: string) => vinc.find((v) => v.turmaId === turmas.find((t) => t.nome === nome)!.id)!;
    expect(de("6A").professorId).toBe(ids.pAna); // continua com o mesmo professor
    expect(de("6B").professorId).toBeNull(); // Beto saiu
    expect(de("6C")).toMatchObject({ professorId: null, cargaHorariaSemanalOverride: 5, aulasAssincronas: 1 }); // copia da 6A
    expect((await db.select().from(professoresTable).where(eq(professoresTable.id, ids.pBeto)))[0]!.ativo).toBe(false);
    expect(await db.select().from(horariosTable).where(eq(horariosTable.escolaId, E))).toHaveLength(0);
    expect(await db.select().from(horariosExperimentaisTable).where(eq(horariosExperimentaisTable.escolaId, E))).toHaveLength(0);
    expect(await db.select().from(disponibilidadeTable).where(inArray(disponibilidadeTable.professorId, [ids.pAna, ids.pBeto]))).toHaveLength(0);
    expect(await db.select().from(aulasFixasTable).where(eq(aulasFixasTable.escolaId, E))).toHaveLength(0); // [VIRADA-ZERA-FIXAS] todas zeram
    expect((r.body as any).resumo.aulasFixasApagadas).toBe(1);
    const s = await situacaoVirada(E);
    expect(s.anoDe).toBe(2027);
    expect(s.podeDesfazer).toBe(true);
  });

  it("não deixa virar duas vezes para o mesmo ano", async () => {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(viradasAnoTable)
      .where(and(eq(viradasAnoTable.escolaId, E), eq(viradasAnoTable.anoPara, 2027), eq(viradasAnoTable.status, "feita")));
    expect(n).toBe(1);
  });

  it("desfaz e volta tudo como estava", async () => {
    // uma turma criada depois da virada sai ao desfazer
    await db.insert(turmasTable).values({ escolaId: E, nome: "7Z", serie: "7º Ano", turno: "vespertino", anoLetivo: 2027 });
    const r = await desfazerVirada(E);
    expect(r.status).toBe(200);
    const turmas = await db.select().from(turmasTable).where(eq(turmasTable.escolaId, E));
    expect(turmas.map((t) => t.nome).sort()).toEqual(["6A", "6B", "9A"]);
    expect(turmas.find((t) => t.id === ids.t9a)).toMatchObject({ anoLetivo: 2026, codigoSere: 113 });
    expect(turmas.find((t) => t.id === ids.t6a)).toMatchObject({ anoLetivo: 2026, codigoSere: 111 });
    const vinc = await db.select().from(turmaDisciplinasTable).where(inArray(turmaDisciplinasTable.turmaId, [ids.t6a, ids.t6b, ids.t9a]));
    expect(vinc.find((v) => v.turmaId === ids.t6b)!.professorId).toBe(ids.pBeto);
    expect(vinc).toHaveLength(3);
    const aulas = await db.select().from(horariosTable).where(eq(horariosTable.escolaId, E));
    expect(aulas).toHaveLength(3);
    expect(aulas.find((a) => a.turmaId === ids.t9a)!.fixa).toBe(true);
    expect(await db.select().from(horariosExperimentaisTable).where(eq(horariosExperimentaisTable.escolaId, E))).toHaveLength(1);
    expect(await db.select().from(disponibilidadeTable).where(inArray(disponibilidadeTable.professorId, [ids.pAna, ids.pBeto]))).toHaveLength(2);
    expect(await db.select().from(aulasFixasTable).where(eq(aulasFixasTable.turmaId, ids.t9a))).toHaveLength(1);
    expect((await db.select().from(professoresTable).where(eq(professoresTable.id, ids.pBeto)))[0]!.ativo).toBe(true);
    // a sequencia de ids continua valida depois de regravar com os ids antigos
    const [nova] = await db.insert(turmasTable).values({ escolaId: E, nome: "8X", serie: "8º Ano", turno: "vespertino", anoLetivo: 2026 }).returning();
    expect(nova!.id).toBeGreaterThan(Math.max(ids.t6a, ids.t6b, ids.t9a));
    await db.delete(turmasTable).where(eq(turmasTable.id, nova!.id));
    expect((await situacaoVirada(E)).anoDe).toBe(2026);
  });

  it("não desfaz se já houver grade oficial do ano novo", async () => {
    expect((await executarVirada(E, plano(), "teste")).status).toBe(201); // a liberacao da Nexus Core continua valendo
    const [t] = await db.select().from(turmasTable).where(and(eq(turmasTable.escolaId, E), eq(turmasTable.nome, "6A")));
    await db.insert(horariosTable).values({ escolaId: E, turmaId: t!.id, disciplinaId: ids.disc, professorId: ids.pAna, diaSemana: 0, numeroAula: 1 });
    const r = await desfazerVirada(E);
    expect(r.status).toBe(409);
  });
});
