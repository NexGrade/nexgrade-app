import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, disciplinasTable, disponibilidadeTable, turmaDisciplinasTable, horariosTable, horarioSlotsTable, professoresTable, reservasTable, salasTable, turmasTable } from "@workspace/db";
import { exigirAdminParaAlterar } from "../../lib/permissao";
import pedagogiaRouter from "../pedagogia";

// [PRESENCA-PEDAGOGIA] (28/10/2026) Lista de presenca dos professores com Postgres de verdade (rotas reais,
// filtro de permissao real, migracao 0004). So roda com TEST_DATABASE_URL (o CI sobe um Postgres migrado).
const TEM_BANCO = !!process.env.TEST_DATABASE_URL;
const E = `pres_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function segundaDaqui(dias: number): string {
  const d = new Date(Date.now() + dias * 86_400_000);
  d.setUTCDate(d.getUTCDate() + (((8 - d.getUTCDay()) % 7) || 7));
  return d.toISOString().slice(0, 10);
}
const DIA = segundaDaqui(30);

let server: Server;
let porta = 0;
async function chamar(metodo: string, caminho: string, corpo?: unknown, cargo = "pedagogia") {
  const r = await fetch(`http://127.0.0.1:${porta}${caminho}`, {
    method: metodo,
    headers: { "Content-Type": "application/json", "x-cargo": cargo },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const tipo = r.headers.get("content-type") ?? "";
  const body: any = tipo.includes("json") ? await r.json() : await r.arrayBuffer();
  return { status: r.status, body, tipo };
}
const ids = { prof: [] as number[] };

describe.skipIf(!TEM_BANCO)("presenca dos professores: integracao com banco real", () => {
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
    app.use("/pedagogia", pedagogiaRouter);
    server = app.listen(0);
    porta = (server.address() as AddressInfo).port;

    const [disc] = await db.insert(disciplinasTable).values({ escolaId: E, nome: "Matemática", sigla: "MAT" } as any).returning();
    const [turma] = await db.insert(turmasTable).values({ escolaId: E, nome: "1ºA", serie: "1", anoLetivo: 2026, turno: "matutino", nivelEnsino: "medio_tecnico" } as any).returning();
    for (const [n, h] of [[1, "07:30"], [2, "08:20"]] as const)
      await db.insert(horarioSlotsTable).values({ escolaId: E, turno: "matutino", nivelEnsino: "medio_tecnico", numeroAula: n, horaInicio: h, duracaoMinutos: 50, letivo: true } as any);
    for (const nome of ["Bruna", "Ana"]) {
      const [p] = await db.insert(professoresTable).values({ escolaId: E, nome, email: `${nome}.${E}@escola.test` }).returning();
      ids.prof.push(p!.id);
    }
    await db.insert(horariosTable).values({ escolaId: E, turmaId: turma!.id, disciplinaId: disc!.id, professorId: ids.prof[0]!, diaSemana: 0, numeroAula: 1, sala: "Sala 3" } as any);
    await db.insert(horariosTable).values({ escolaId: E, turmaId: turma!.id, disciplinaId: disc!.id, professorId: ids.prof[1]!, diaSemana: 0, numeroAula: 2 } as any);
    // [PRESENCA-ASS-HA] assincrona da Bruna na 2a aula e HA da Ana na 3a
    await db.insert(horariosTable).values({ escolaId: E, turmaId: turma!.id, disciplinaId: disc!.id, professorId: ids.prof[0]!, diaSemana: 0, numeroAula: 2, assincrona: true } as any);
    // [PRESENCA-HIBRIDA] trio comecando na semana do DIA: ordem 1 (Ana) presencial, ordem 2 (Bruna) suporte
    for (const [prof, ordem] of [[ids.prof[1]!, 1], [ids.prof[0]!, 2]] as const)
      await db.insert(turmaDisciplinasTable).values({ turmaId: turma!.id, disciplinaId: disc!.id, professorId: prof, grupoTrio: "T1", trioOrdem: ordem, trioInicio: DIA } as any);
    await db.insert(disponibilidadeTable).values({ professorId: ids.prof[1]!, diaSemana: 0, horarioSlot: 3, turno: "matutino", disponivel: false, horaAtividadeObrigatoria: true, motivo: "HA manual (definida na tela)" });
    const [lab] = await db.insert(salasTable).values({ escolaId: E, nome: "Laboratório", tipo: "laboratorio" }).returning();
    await db.insert(reservasTable).values({ escolaId: E, salaId: lab!.id, professorId: ids.prof[1]!, data: DIA, diaSemana: 0, numeroAula: 2, turno: "matutino", titulo: "Aula prática" } as any);
  });

  afterAll(async () => {
    try { await db.execute(sql`alter table if exists presencas_off rename to presencas_professores`); } catch { /* ja esta com o nome certo */ }
    try { await db.execute(sql`alter table if exists observacoes_off rename to presencas_observacoes`); } catch { /* ja esta com o nome certo */ }
    await new Promise<void>((ok) => (server ? server.close(() => ok()) : ok()));
    for (const t of ["presencas_observacoes", "presencas_professores", "reservas", "horarios", "horario_slots", "turmas", "disciplinas", "salas", "professores"]) {
      await db.execute(sql.raw(`delete from ${t} where escola_id = '${E}'`));
    }
  });

  it("a lista do dia traz as aulas da grade com hora e sala (reserva vale mais que a sala da grade)", async () => {
    const r = await chamar("GET", `/pedagogia/presenca?data=${DIA}&turno=matutino`);
    expect(r.status).toBe(200);
    expect(r.body.semTabela).toBe(false);
    expect(r.body.professores.map((p: any) => [p.nome, p.aulas[0].hora, p.aulas[0].sala])).toEqual([["Ana", "08:20", "Laboratório"], ["Bruna", "07:30", "Sala 3"]]);
  });

  it("[PRESENCA-ASS-HA] traz a assincrona e a HA do professor", async () => {
    const r = await chamar("GET", `/pedagogia/presenca?data=${DIA}&turno=matutino`);
    const porNome = Object.fromEntries(r.body.professores.map((p: any) => [p.nome, p.aulas.map((a: any) => [a.numeroAula, a.tipo, a.disciplinas])]));
    expect(porNome.Ana).toEqual([[2, "aula", "MAT"], [3, "ha", "HA"]]);
    expect(porNome.Bruna).toEqual([[1, "aula", "MAT"], [2, "assincrona", "Matemática"]]); // [PRESENCA-ASS-DISCIPLINA] nome inteiro
    for (const q of ["", "&assincronas=0"]) {
      const pdf = await chamar("GET", `/pedagogia/presenca/pdf?data=${DIA}&turno=matutino${q}`);
      expect(Buffer.from(pdf.body).subarray(0, 4).toString()).toBe("%PDF");
    }
  });

  it("[PRESENCA-HIBRIDA] aula de trio vem com presencial ou suporte na semana da data", async () => {
    const r = await chamar("GET", `/pedagogia/presenca?data=${DIA}&turno=matutino`);
    const porNome = Object.fromEntries(r.body.professores.map((p: any) => [p.nome, p.aulas.map((a: any) => [a.numeroAula, a.trio])]));
    expect(porNome.Ana).toEqual([[2, "presencial"], [3, null]]);
    expect(porNome.Bruna).toEqual([[1, "suporte"], [2, null]]); // a assincrona nao entra no revezamento
    const semanaSeguinte = new Date(Date.parse(`${DIA}T12:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);
    const r2 = await chamar("GET", `/pedagogia/presenca?data=${semanaSeguinte}&turno=matutino`);
    const ana = r2.body.professores.find((p: any) => p.nome === "Ana");
    expect(ana.aulas[0].trio).toBe("suporte");
  });

  it("[AGENDA-ASSINCRONAS] agenda das assincronas: na Hibrida, a da semana e do professor presencial", async () => {
    const proxima = new Date(Date.parse(`${DIA}T12:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);
    const r = await chamar("GET", `/pedagogia/presenca/periodo?de=${DIA}&ate=${proxima}&tipo=assincronas`);
    expect(r.status).toBe(200);
    const linhas = r.body.linhas.filter((l: any) => !l.grupo).map((l: any) => [l.celulas[1], l.celulas[3], l.celulas[4]]);
    expect(linhas).toEqual([["2ª 08:20", "Matemática (Híbrida)", "Ana"], ["2ª 08:20", "Matemática (Híbrida)", "Bruna"]]);
    const so = await chamar("GET", `/pedagogia/presenca/periodo?de=${DIA}&ate=${proxima}&tipo=assincronas&professorId=${ids.prof[0]}`);
    expect(so.body.linhas.filter((l: any) => !l.grupo).map((l: any) => l.celulas[4])).toEqual(["Bruna"]);
    const pdf = await chamar("GET", `/pedagogia/presenca/periodo?de=${DIA}&ate=${proxima}&tipo=assincronas&formato=pdf`);
    expect(Buffer.from(pdf.body).subarray(0, 4).toString()).toBe("%PDF");
  });

  it("[PRESENCA-OBS-GERAL] grava, mostra e apaga a observacao geral do professor", async () => {
    const [bruna] = ids.prof as [number, number];
    let r = await chamar("PUT", "/pedagogia/presenca", { data: DIA, turno: "matutino", marcas: [], observacoes: [{ professorId: bruna, observacao: " saiu mais cedo " }] });
    expect(r.status).toBe(200);
    r = await chamar("GET", `/pedagogia/presenca?data=${DIA}&turno=matutino`);
    expect(r.body.semTabelaObservacoes).toBe(false);
    expect(r.body.professores.find((p: any) => p.nome === "Bruna").observacao).toBe("saiu mais cedo");
    const fora = await chamar("PUT", "/pedagogia/presenca", { data: DIA, turno: "matutino", marcas: [], observacoes: [{ professorId: 999999999, observacao: "x" }] });
    expect(fora.status).toBe(400);
    await chamar("PUT", "/pedagogia/presenca", { data: DIA, turno: "matutino", marcas: [], observacoes: [{ professorId: bruna, observacao: "" }] });
    r = await chamar("GET", `/pedagogia/presenca?data=${DIA}&turno=matutino`);
    expect(r.body.professores.find((p: any) => p.nome === "Bruna").observacao).toBeNull();
  });

  it("[PRESENCA-OBS-GERAL] sem a migracao 0007 a lista abre e avisa", async () => {
    await db.execute(sql`alter table presencas_observacoes rename to observacoes_off`);
    try {
      const r = await chamar("GET", `/pedagogia/presenca?data=${DIA}&turno=matutino`);
      expect(r.status).toBe(200);
      expect(r.body.semTabelaObservacoes).toBe(true);
      expect((await chamar("GET", `/pedagogia/presenca/mes?mes=${Number(DIA.slice(5, 7))}&ano=${DIA.slice(0, 4)}`)).status).toBe(200);
      const s = await chamar("PUT", "/pedagogia/presenca", { data: DIA, turno: "matutino", marcas: [], observacoes: [{ professorId: ids.prof[0]!, observacao: "x" }] });
      expect(s.status).toBe(503);
    } finally {
      await db.execute(sql`alter table observacoes_off rename to presencas_observacoes`);
    }
  });

  it("salva, atualiza e desmarca", async () => {
    const [bruna, ana] = ids.prof as [number, number];
    let r = await chamar("PUT", "/pedagogia/presenca", { data: DIA, turno: "matutino", marcas: [
      { professorId: bruna, numeroAula: 1, status: "substituido", substitutoId: ana, observacao: "consulta médica" },
      { professorId: ana, numeroAula: 2, status: "presente" },
    ] });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ gravadas: 2 });
    r = await chamar("PUT", "/pedagogia/presenca", { data: DIA, turno: "matutino", marcas: [{ professorId: ana, numeroAula: 2, status: "atraso" }] });
    expect(r.status).toBe(200);
    r = await chamar("GET", `/pedagogia/presenca?data=${DIA}&turno=matutino`);
    const porNome = Object.fromEntries(r.body.professores.map((p: any) => [p.nome, p.aulas[0].marca]));
    expect(porNome.Ana).toMatchObject({ status: "atraso" });
    expect(porNome.Bruna).toMatchObject({ status: "substituido", substitutoId: ana, observacao: "consulta médica" });
    r = await chamar("PUT", "/pedagogia/presenca", { data: DIA, turno: "matutino", marcas: [{ professorId: ana, numeroAula: 2, status: null }] });
    expect(r.body).toMatchObject({ apagadas: 1 });
  });

  it("faltas do mes (JSON e PDF) e presenca do dia em PDF", async () => {
    const [ano, mes] = DIA.split("-").map(Number);
    const r = await chamar("GET", `/pedagogia/presenca/mes?mes=${mes}&ano=${ano}`);
    expect(r.status).toBe(200);
    expect(r.body.resumo).toEqual([
      expect.objectContaining({ professor: "Ana", substituiu: 1 }),
      expect.objectContaining({ professor: "Bruna", substituido: 1 }),
    ]);
    const pdf = await chamar("GET", `/pedagogia/presenca/mes?mes=${mes}&ano=${ano}&formato=pdf`);
    expect(pdf.tipo).toContain("application/pdf");
    const dia = await chamar("GET", `/pedagogia/presenca/pdf?data=${DIA}&turno=matutino`);
    expect(dia.status).toBe(200);
    expect(Buffer.from(dia.body).subarray(0, 4).toString()).toBe("%PDF");
  });

  it("[PRESENCA-PERIODO] relatorio por periodo: geral, individual e total (JSON e PDF) e periodo invalido", async () => {
    const [bruna, ana] = ids.prof as [number, number];
    await chamar("PUT", "/pedagogia/presenca", { data: DIA, turno: "matutino", marcas: [{ professorId: bruna, numeroAula: 1, status: "falta" }], observacoes: [{ professorId: bruna, observacao: "atestado" }] });
    const g = await chamar("GET", `/pedagogia/presenca/periodo?de=${DIA}&ate=${DIA}&tipo=geral`);
    expect(g.status).toBe(200);
    expect(g.body.linhas.find((l: any) => l.celulas[0] === "Bruna").celulas.slice(1, 3)).toEqual(["0", "1"]);
    const i = await chamar("GET", `/pedagogia/presenca/periodo?de=${DIA}&ate=${DIA}&tipo=individual&professorId=${bruna}`);
    expect(i.body.linhas[1].celulas.slice(3)).toEqual(["Falta", "", "atestado"]);
    const so = await chamar("GET", `/pedagogia/presenca/periodo?de=${DIA}&ate=${DIA}&tipo=individual&professorId=${ana}`);
    expect(so.body.linhas.every((l: any) => !String(l.celulas[0]).startsWith("Bruna"))).toBe(true);
    const t = await chamar("GET", `/pedagogia/presenca/periodo?de=${DIA}&ate=${DIA}&tipo=total`);
    expect(t.body.linhas.find((l: any) => l.celulas[0] === "Falta").celulas[1]).toBe("1");
    for (const tipo of ["geral", "individual", "total"]) {
      const pdf = await chamar("GET", `/pedagogia/presenca/periodo?de=${DIA}&ate=${DIA}&tipo=${tipo}&formato=pdf`);
      expect(Buffer.from(pdf.body).subarray(0, 4).toString()).toBe("%PDF");
    }
    expect((await chamar("GET", `/pedagogia/presenca/periodo?de=${DIA}&ate=2020-01-01&tipo=geral`)).status).toBe(400);
    expect((await chamar("GET", `/pedagogia/presenca/periodo?de=2020-01-01&ate=${DIA}&tipo=geral`)).status).toBe(400);
    expect((await chamar("GET", `/pedagogia/presenca/periodo?de=${DIA}&ate=${DIA}&tipo=individual&professorId=999999999`)).status).toBe(400);
    expect((await chamar("GET", `/pedagogia/presenca/periodo?de=${DIA}&ate=${DIA}&tipo=geral`, undefined, "professor")).status).toBe(403);
  });

  it("professor e gestor de reservas nao leem nem gravam a presenca", async () => {
    for (const cargo of ["professor", "reservas"]) {
      expect((await chamar("GET", `/pedagogia/presenca?data=${DIA}&turno=matutino`, undefined, cargo)).status).toBe(403);
      expect((await chamar("PUT", "/pedagogia/presenca", { data: DIA, turno: "matutino", marcas: [] }, cargo)).status).toBe(403);
    }
  });

  it("sem a migracao (tabela ainda nao existe): a lista abre sem marcacoes e o Salvar avisa (503)", async () => {
    await db.execute(sql`alter table presencas_professores rename to presencas_off`);
    try {
      const r = await chamar("GET", `/pedagogia/presenca?data=${DIA}&turno=matutino`);
      expect(r.status).toBe(200);
      expect(r.body.semTabela).toBe(true);
      expect(r.body.professores).toHaveLength(2);
      const s = await chamar("PUT", "/pedagogia/presenca", { data: DIA, turno: "matutino", marcas: [{ professorId: ids.prof[0]!, numeroAula: 1, status: "falta" }] });
      expect(s.status).toBe(503);
    } finally {
      await db.execute(sql`alter table presencas_off rename to presencas_professores`);
    }
  });

  it("professor de outra escola nao entra na lista", async () => {
    const r = await chamar("PUT", "/pedagogia/presenca", { data: DIA, turno: "matutino", marcas: [{ professorId: 999999999, numeroAula: 1, status: "falta" }] });
    expect(r.status).toBe(400);
  });
});
