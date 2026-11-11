import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray, sql } from "drizzle-orm";
import {
  db, disciplinasTable, disponibilidadeTable, horariosExperimentaisTable, horariosTable, horarioSlotsTable,
  professoresTable, turmasTable,
} from "@workspace/db";
import { exigirAdminParaAlterar } from "../../lib/permissao";
import { middlewareDisponibilidadeExperimental } from "../../lib/disponibilidade-experimento";
import horariosRouter from "../horarios";

// [RESOLVER-CHOQUE] (11/11/2026) "Ver como resolver": a rota lista as trocas na mesma turma que tiram o choque (sem
// bloqueio, HA ou choque novo) e aplicar uma delas pela rota trocar-aulas deixa o experimento sem choque.
// So roda com TEST_DATABASE_URL.
const TEM_BANCO = !!process.env.TEST_DATABASE_URL;
const E = `rchq_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const N = "Plano choque";
const url = `/horarios/experimentais/${encodeURIComponent(N)}`;

let server: Server;
let porta = 0;
async function chamar(metodo: string, caminho: string, corpo?: unknown) {
  const r = await fetch(`http://127.0.0.1:${porta}${caminho}`, {
    method: metodo, headers: { "Content-Type": "application/json", "x-cargo": "direcao" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return { status: r.status, body: (await r.json()) as any };
}
const ids = { nicolas: 0, ione: 0, roberto: 0, me: 0, mf: 0, andre: 0 };

describe.skipIf(!TEM_BANCO)("resolver choque do experimento", () => {
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
    app.use("/horarios", middlewareDisponibilidadeExperimental, horariosRouter);
    server = app.listen(0);
    porta = (server.address() as AddressInfo).port;

    for (const [n, h] of [[1, "07:30"], [2, "08:20"], [3, "09:10"], [4, "10:20"]] as const)
      await db.insert(horarioSlotsTable).values({ escolaId: E, turno: "matutino", nivelEnsino: "fundamental", numeroAula: n, horaInicio: h, duracaoMinutos: 50, letivo: true } as any);
    const [mat] = await db.insert(disciplinasTable).values({ escolaId: E, nome: "Matemática", sigla: "MAT" } as any).returning();
    const [cie] = await db.insert(disciplinasTable).values({ escolaId: E, nome: "Ciências", sigla: "CIE" } as any).returning();
    const [his] = await db.insert(disciplinasTable).values({ escolaId: E, nome: "História", sigla: "HIS" } as any).returning();
    const [me] = await db.insert(turmasTable).values({ escolaId: E, nome: "9ME", serie: "9", anoLetivo: 2026, turno: "matutino", nivelEnsino: "fundamental" } as any).returning();
    const [mf] = await db.insert(turmasTable).values({ escolaId: E, nome: "9MF", serie: "9", anoLetivo: 2026, turno: "matutino", nivelEnsino: "fundamental" } as any).returning();
    const p: Record<string, number> = {};
    for (const nome of ["Nicolas", "Ione", "Roberto"]) {
      const [x] = await db.insert(professoresTable).values({ escolaId: E, nome, email: `${nome}.${E}@escola.test` }).returning();
      p[nome] = x!.id;
    }
    // Ione bloqueada na terca 3a (oficial)
    await db.insert(disponibilidadeTable).values({ professorId: p.Ione!, diaSemana: 1, horarioSlot: 3, turno: "matutino", disponivel: false, motivo: "Bloqueio" } as any);
    // oficial (sem choque): 9ME terca 3a Matematica (Nicolas); 9MF terca 2a Ciencias (Ione), 3a Matematica (Roberto), 4a Historia (Roberto)
    const aula = (turmaId: number, disciplinaId: number, professorId: number, diaSemana: number, numeroAula: number) => ({ escolaId: E, turmaId, disciplinaId, professorId, diaSemana, numeroAula } as any);
    await db.insert(horariosTable).values([aula(me!.id, mat!.id, p.Nicolas!, 1, 3), aula(mf!.id, cie!.id, p.Ione!, 1, 2), aula(mf!.id, mat!.id, p.Roberto!, 1, 3), aula(mf!.id, his!.id, p.Roberto!, 1, 4)]);
    // experimento da 9MF: a Matematica da terca 3a passou para o Nicolas (choque com a 9ME)
    await db.insert(horariosExperimentaisTable).values([
      { escolaId: E, nome: N, turmaId: mf!.id, disciplinaId: cie!.id, professorId: p.Ione!, diaSemana: 1, numeroAula: 2 },
      { escolaId: E, nome: N, turmaId: mf!.id, disciplinaId: mat!.id, professorId: p.Nicolas!, diaSemana: 1, numeroAula: 3 },
      { escolaId: E, nome: N, turmaId: mf!.id, disciplinaId: his!.id, professorId: p.Roberto!, diaSemana: 1, numeroAula: 4 },
    ]);
    Object.assign(ids, { nicolas: p.Nicolas, ione: p.Ione, roberto: p.Roberto, me: me!.id, mf: mf!.id });
  });

  afterAll(async () => {
    await new Promise<void>((ok) => (server ? server.close(() => ok()) : ok()));
    if (ids.ione) await db.delete(disponibilidadeTable).where(inArray(disponibilidadeTable.professorId, [ids.nicolas, ids.ione, ids.roberto, ids.andre].filter(Boolean)));
    for (const t of ["configuracoes", "experimentos", "disponibilidade_experimental", "horarios_experimentais", "horarios", "horario_slots", "turmas", "disciplinas", "professores"]) {
      await db.execute(sql.raw(`delete from ${t} where escola_id = '${E}'`));
    }
  });

  it("lista as trocas que resolvem e aplicar uma tira o choque", async () => {
    expect((await chamar("GET", `${url}/choques`)).body.choques).toEqual(["Nicolas: terça, 3ª aula na 9ME e 3ª aula na 9MF"]);
    const r = await chamar("GET", `${url}/resolver-choques`);
    expect(r.status).toBe(200);
    expect(r.body.choques).toHaveLength(1);
    const opcoes = r.body.choques[0].opcoes as Array<{ turmaId: number; de: any; para: any; texto: string }>;
    const textos = opcoes.map((o) => o.texto);
    // trocar com a Historia da 4a: Roberto livre na 3a
    expect(textos).toContain("9MF: trocar Matemática (Nicolas) da terça 3ª com História (Roberto) da terça 4ª");
    // com a Ciencias da 2a nao: a Ione esta bloqueada na 3a
    expect(textos.some((t) => t.includes("Ciências (Ione)"))).toBe(false);
    // a 9ME esta fora do experimento: nao entra
    expect(opcoes.every((o) => o.turmaId === ids.mf)).toBe(true);

    const escolhida = opcoes.find((o) => o.texto.includes("História (Roberto) da terça 4ª"))!;
    const t = await chamar("POST", `${url}/trocar-aulas`, { turmaId: escolhida.turmaId, de: escolhida.de, para: escolhida.para });
    expect(t.body).toMatchObject({ aplicado: true, avisos: [] });
    expect((await chamar("GET", `${url}/choques`)).body.choques).toEqual([]);
    expect((await chamar("GET", `${url}/resolver-choques`)).body.choques).toEqual([]);
  });

  it("[RESOLVER-CHOQUE-HA] aplica a troca que muda a HA de lugar, so no rascunho, e recusa opcao que nao vale", async () => {
    const N2 = "Plano HA";
    const url2 = `/horarios/experimentais/${encodeURIComponent(N2)}`;
    const [andre] = await db.insert(professoresTable).values({ escolaId: E, nome: "André", email: `andre.${E}@escola.test` }).returning();
    const [ef] = await db.insert(disciplinasTable).values({ escolaId: E, nome: "Educação Física", sigla: "EF" } as any).returning();
    const MOTIVO = "Hora-atividade institucional (recalculada automaticamente)";
    await db.insert(disponibilidadeTable).values({ professorId: andre!.id, diaSemana: 1, horarioSlot: 3, turno: "matutino", disponivel: true, horaAtividadeObrigatoria: true, motivo: MOTIVO } as any);
    // como no Romario, sem troca simples: o Nicolas so esta livre na segunda 3a (e na terca 3a, do choque)
    for (let d = 0; d < 5; d++) for (let s = 1; s <= 4; s++) {
      if ((d === 0 && s === 3) || (d === 1 && s === 3)) continue;
      await db.insert(disponibilidadeTable).values({ professorId: ids.nicolas, diaSemana: d, horarioSlot: s, turno: "matutino", disponivel: false, motivo: "Bloqueio" } as any);
    }
    const [mat] = await db.select().from(disciplinasTable).where(sql`escola_id = ${E} and nome = 'Matemática'`);
    // 9ME: Nicolas terca 3a, Andre segunda 3a; 9MF: Nicolas terca 3a (fixa) = choque
    await db.insert(horariosExperimentaisTable).values([
      { escolaId: E, nome: N2, turmaId: ids.me, disciplinaId: mat!.id, professorId: ids.nicolas, diaSemana: 1, numeroAula: 3 },
      { escolaId: E, nome: N2, turmaId: ids.me, disciplinaId: ef!.id, professorId: andre!.id, diaSemana: 0, numeroAula: 3 },
      // o Andre continua vindo na segunda (a HA prefere dia em que o professor ja vem)
      { escolaId: E, nome: N2, turmaId: ids.me, disciplinaId: ef!.id, professorId: andre!.id, diaSemana: 0, numeroAula: 4 },
      { escolaId: E, nome: N2, turmaId: ids.mf, disciplinaId: mat!.id, professorId: ids.nicolas, diaSemana: 1, numeroAula: 3, fixa: true },
    ]);
    const r = await chamar("GET", `${url2}/resolver-choques`);
    const opcoes = r.body.choques[0].opcoes as any[];
    const comHa = opcoes.find((o) => o.moverHa?.length);
    expect(comHa).toMatchObject({ turmaId: ids.me, de: { diaSemana: 1, numeroAula: 3 }, para: { diaSemana: 0, numeroAula: 3 } });
    expect(comHa.texto).toContain("e a HA de André vai da terça 3ª para a segunda 3ª");

    // opcao inventada (HA para outro lugar) e recusada sem mexer em nada
    const falsa = { ...comHa, moverHa: [{ ...comHa.moverHa[0], para: { diaSemana: 4, numeroAula: 1 } }] };
    expect((await chamar("POST", `${url2}/resolver-choques/aplicar`, falsa)).status).toBe(409);

    const a = await chamar("POST", `${url2}/resolver-choques/aplicar`, comHa);
    expect(a.status).toBe(200);
    expect((await chamar("GET", `${url2}/choques`)).body.choques).toEqual([]);
    // a HA mudou so no rascunho: a oficial continua com a HA na terca 3a
    const dispExp = await db.execute(sql`select dia_semana, horario_slot, hora_atividade_obrigatoria, motivo from disponibilidade_experimental where escola_id = ${E} and nome = ${N2} order by dia_semana`);
    expect((dispExp as any).rows.map((x: any) => [x.dia_semana, x.horario_slot, x.hora_atividade_obrigatoria, x.motivo])).toEqual([[0, 3, true, MOTIVO], [1, 3, false, null]]);
    const oficialAndre = await db.select().from(disponibilidadeTable).where(inArray(disponibilidadeTable.professorId, [andre!.id]));
    expect(oficialAndre.map((x) => [x.diaSemana, x.horarioSlot, x.horaAtividadeObrigatoria])).toEqual([[1, 3, true]]);
    ids.andre = andre!.id;
  });
});
