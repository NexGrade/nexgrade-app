import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import {
  db,
  pool,
  comunicadosTable,
  disciplinasTable,
  horariosTable,
  professoresTable,
  reservasRecursosTable,
  reservasTable,
  salasTable,
  turmasTable,
} from "@workspace/db";
import { exigirAdminParaAlterar } from "../../lib/permissao";
import bloqueiosRouter from "../bloqueios";
import recursosRouter from "../recursos";
import reservasGestorRouter from "../reservas-gestor";

// [BLINDAGEM] (17/10/2026) Testes de integracao das reservas com um Postgres de verdade (as rotas reais, o filtro de
// permissao real e as migracoes reais). Cobrem o que so tinha sido testado com scripts avulsos:
// tablets (limite e pedidos simultaneos), gestor, bloqueios e permissoes por cargo.
// So rodam com TEST_DATABASE_URL (o CI sobe um Postgres e aplica as migracoes); sem ela sao pulados.
const TEM_BANCO = !!process.env.TEST_DATABASE_URL;
const E = `teste_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; // escola isolada desta execucao

/** primeira segunda-feira pelo menos `dias` dias a frente (garante data futura e dia util) */
function segundaDaqui(dias: number): string {
  const d = new Date(Date.now() + dias * 86_400_000);
  d.setUTCDate(d.getUTCDate() + (((8 - d.getUTCDay()) % 7) || 7));
  return d.toISOString().slice(0, 10);
}
const somaDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

let server: Server;
let porta = 0;
async function chamar(metodo: string, caminho: string, corpo?: unknown, cabecalhos: Record<string, string> = {}) {
  const r = await fetch(`http://127.0.0.1:${porta}${caminho}`, {
    method: metodo,
    headers: { "Content-Type": "application/json", ...cabecalhos },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await r.text();
  let body: any = null;
  try { body = JSON.parse(texto); } catch { /* resposta sem JSON */ }
  return { status: r.status, body };
}

const ids = { prof: [] as number[], sala: 0, sala2: 0, recurso: 0 };
const D1 = segundaDaqui(60); // gestor e salas
const D2 = segundaDaqui(67); // tablets
const D3 = segundaDaqui(74); // bloqueios de sala
const D4 = segundaDaqui(81); // bloqueios de tablets
const D5 = segundaDaqui(88); // permissoes

const lote = (professorId: number, data: string, numerosAula: number[], salaId = ids.sala) =>
  chamar("POST", "/reservas/gestor/lote", { professorId, data, turno: "matutino", itens: [{ salaId, numerosAula }], titulo: "Aula pratica" });
const tablets = (professorId: number, data: string, itens: Array<{ numeroAula: number; quantidade: number }>) =>
  chamar("POST", "/reservas/gestor/recursos", { professorId, recursoId: ids.recurso, data, turno: "matutino", itens, titulo: "Pesquisa" });

describe.skipIf(!TEM_BANCO)("reservas: integracao com banco real", () => {
  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      // simula a sessao: Clerk (papel em x-org-role) ou, com ACESSOS_PELO_BANCO=1, o cargo em x-cargo
      const papel = (req.headers["x-org-role"] as string | undefined) ?? "org:admin";
      req.auth = Object.assign(() => ({ orgId: E, userId: "u_teste", orgRole: papel, tokenType: "session_token" }), { [Symbol.for("@clerk/express.auth")]: true });
      const cargo = req.headers["x-cargo"] as string | undefined;
      if (cargo) req.acesso = { userId: "u_teste", email: "teste@escola.test", escolas: [], escolaId: E, nomeEscola: "Teste", cargo };
      next();
    });
    app.use(exigirAdminParaAlterar); // o mesmo filtro de permissao que routes/index.ts usa
    app.use("/reservas/gestor", reservasGestorRouter);
    app.use("/reservas/bloqueios", bloqueiosRouter);
    app.use("/recursos", recursosRouter);
    server = app.listen(0);
    porta = (server.address() as AddressInfo).port;

    // 4 professores com 3 aulas na segunda-feira de manha, 2 salas
    const [disc] = await db.insert(disciplinasTable).values({ escolaId: E, nome: "Banco de Dados" } as any).returning();
    const [turma] = await db.insert(turmasTable).values({ escolaId: E, nome: "1MB DES", serie: "1", anoLetivo: 2026, turno: "matutino" } as any).returning();
    for (let i = 1; i <= 4; i++) {
      const [p] = await db.insert(professoresTable).values({ escolaId: E, nome: `Prof ${i}`, email: `p${i}.${E}@escola.test` }).returning();
      ids.prof.push(p!.id);
      for (const n of [1, 2, 3]) await db.insert(horariosTable).values({ escolaId: E, turmaId: turma!.id, disciplinaId: disc!.id, professorId: p!.id, diaSemana: 0, numeroAula: n } as any);
    }
    const [lab] = await db.insert(salasTable).values({ escolaId: E, nome: "Laboratório de Informática - 01 Bloco 1", tipo: "laboratorio" }).returning();
    const [lab2] = await db.insert(salasTable).values({ escolaId: E, nome: "Laboratório de Informática - 02 Bloco 1", tipo: "laboratorio" }).returning();
    ids.sala = lab!.id;
    ids.sala2 = lab2!.id;
    // o equipamento padrao (Tablets, 30) nasce na primeira consulta, como em producao
    const r = await chamar("GET", `/reservas/gestor/recursos/ocupacao?data=${D2}`);
    ids.recurso = r.body.recursos[0].id;
  });

  afterAll(async () => {
    try { await db.execute(sql`alter table if exists bloqueios_off rename to bloqueios`); } catch { /* ja esta com o nome certo */ }
    await new Promise<void>((ok) => (server ? server.close(() => ok()) : ok()));
    for (const t of ["bloqueios", "reservas_recursos", "recursos", "reservas", "comunicados", "horarios", "turmas", "disciplinas", "salas", "professores"]) {
      await db.execute(sql.raw(`delete from ${t} where escola_id = '${E}'`));
    }
  });

  describe("gestor agenda para o professor", () => {
    it("a reserva do gestor nasce confirmada (sem fila) e o professor recebe aviso", async () => {
      const r = await lote(ids.prof[0]!, D1, [1, 2]);
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ criadas: 2, confirmadas: 2, pendentes: 0 });
      const linhas = await db.select({ s: reservasTable.status }).from(reservasTable).where(eq(reservasTable.escolaId, E));
      expect(linhas.map((l) => l.s)).toEqual(["confirmada", "confirmada"]);
      const avisos = await db.select().from(comunicadosTable).where(and(eq(comunicadosTable.escolaId, E), eq(comunicadosTable.professorId, ids.prof[0]!)));
      expect(avisos.some((a) => a.titulo.includes("coordenação"))).toBe(true);
    });
    it("o mesmo espaço na mesma aula e recusado (409)", async () => {
      const r = await lote(ids.prof[1]!, D1, [1]);
      expect(r.status).toBe(409);
    });
    it("o professor so reserva a aula que tem na grade", async () => {
      const r = await lote(ids.prof[1]!, D1, [5], ids.sala2); // a 5a aula nao existe na grade dele
      expect(r.status).toBe(409);
    });
    it("a semana traz o que foi reservado (sem canceladas)", async () => {
      const r = await chamar("GET", `/reservas/gestor/semana?data=${D1}`);
      expect(r.status).toBe(200);
      expect(r.body.espacos).toHaveLength(2);
    });
  });

  describe("tablets por quantidade (30 por aula)", () => {
    it("o equipamento padrao tem 30 unidades", async () => {
      const r = await chamar("GET", `/reservas/gestor/recursos/ocupacao?data=${D2}`);
      expect(r.body.recursos[0]).toMatchObject({ nome: "Tablets", total: 30 });
    });
    it("aceita ate o total, recusa o excesso e aceita o saldo exato", async () => {
      expect((await tablets(ids.prof[0]!, D2, [{ numeroAula: 1, quantidade: 20 }])).status).toBe(201);
      const excesso = await tablets(ids.prof[1]!, D2, [{ numeroAula: 1, quantidade: 20 }]);
      expect(excesso.status).toBe(409);
      expect(excesso.body.error).toMatch(/restam 10 de 30/);
      expect((await tablets(ids.prof[1]!, D2, [{ numeroAula: 1, quantidade: 10 }])).status).toBe(201);
      const oc = (await chamar("GET", `/reservas/gestor/recursos/ocupacao?data=${D2}`)).body.recursos[0].ocupacao.find((o: any) => o.numeroAula === 1);
      expect(oc.reservadas).toBe(30);
    });
    it("pedidos SIMULTANEOS nunca passam de 30 (trava do recurso)", async () => {
      // 4 professores pedindo 10 ao mesmo tempo na mesma aula: so 3 cabem
      const respostas = await Promise.all(ids.prof.map((p) => tablets(p, D2, [{ numeroAula: 3, quantidade: 10 }])));
      expect(respostas.filter((r) => r.status === 201)).toHaveLength(3);
      expect(respostas.filter((r) => r.status === 409)).toHaveLength(1);
      const [soma] = await db.select({ t: sql<number>`sum(quantidade)::int` }).from(reservasRecursosTable).where(and(eq(reservasRecursosTable.escolaId, E), eq(reservasRecursosTable.numeroAula, 3), eq(reservasRecursosTable.data, D2)));
      expect(soma!.t).toBe(30);
    });
    it("a reserva ESPERA a trava do equipamento (e o que impede vender mais do que existe)", async () => {
      // Determinista: segura a trava da linha do equipamento no banco e confere que o pedido fica parado ate soltar.
      // Sem o SELECT ... FOR UPDATE no codigo, o pedido passaria direto e este teste falharia.
      const segura = await pool.connect();
      try {
        await segura.query("begin");
        await segura.query("select id from recursos where id = $1 for update", [ids.recurso]);
        const pedido = tablets(ids.prof[3]!, somaDias(D2, 7), [{ numeroAula: 2, quantidade: 5 }]);
        const quem = await Promise.race([pedido.then(() => "terminou"), new Promise<string>((ok) => setTimeout(() => ok("esperando"), 700))]);
        expect(quem).toBe("esperando");
        await segura.query("commit");
        expect((await pedido).status).toBe(201);
      } finally {
        await segura.query("rollback").catch(() => {});
        segura.release();
      }
    });
    it("recusa professor sem aula nesse periodo e pedido duplicado na mesma aula", async () => {
      const semAula = await chamar("POST", "/reservas/gestor/recursos", { professorId: ids.prof[2]!, recursoId: ids.recurso, data: D2, turno: "noturno", itens: [{ numeroAula: 1, quantidade: 1 }], titulo: "x" });
      expect(semAula.status).toBe(409);
      const duplicado = await tablets(ids.prof[0]!, D2, [{ numeroAula: 1, quantidade: 1 }]);
      expect(duplicado.status).toBe(409);
    });
    it("cancelar devolve as unidades ao saldo", async () => {
      await db.update(reservasRecursosTable).set({ status: "cancelada" }).where(and(eq(reservasRecursosTable.escolaId, E), eq(reservasRecursosTable.numeroAula, 1), eq(reservasRecursosTable.professorId, ids.prof[0]!), eq(reservasRecursosTable.data, D2)));
      const oc = (await chamar("GET", `/reservas/gestor/recursos/ocupacao?data=${D2}`)).body.recursos[0].ocupacao.find((o: any) => o.numeroAula === 1);
      expect(oc.reservadas).toBe(10);
    });
    it("o total so diminui se nenhuma reserva futura passar do novo valor", async () => {
      const recusa = await chamar("PATCH", `/recursos/${ids.recurso}`, { quantidadeTotal: 20 }); // a 3a aula tem 30 reservados
      expect(recusa.status).toBe(409);
      expect((await chamar("PATCH", `/recursos/${ids.recurso}`, { quantidadeTotal: 40 })).status).toBe(200);
      expect((await chamar("PATCH", `/recursos/${ids.recurso}`, { quantidadeTotal: 30 })).status).toBe(200);
      expect((await chamar("PATCH", `/recursos/${ids.recurso}`, { quantidadeTotal: 0 })).status).toBe(400);
    });
  });

  describe("bloqueio de sala", () => {
    const corpo = () => ({ alvoTipo: "sala", alvoId: ids.sala, dataInicio: D3, dataFim: D3, turno: "matutino", numerosAula: [1, 2], motivo: "manutencao" });
    let idBloqueio = 0;
    it("valida o corpo: motivo 'outro' pede descricao, datas em ordem, sala existente", async () => {
      expect((await chamar("POST", "/reservas/bloqueios", { ...corpo(), motivo: "outro" })).status).toBe(400);
      expect((await chamar("POST", "/reservas/bloqueios", { ...corpo(), dataInicio: somaDias(D3, 1) })).status).toBe(400);
      expect((await chamar("POST", "/reservas/bloqueios", { ...corpo(), alvoId: 999_999_999 })).status).toBe(404);
    });
    it("confere o impacto sem gravar e, ao confirmar, deixa a reserva existente pendente e avisa o professor", async () => {
      expect((await lote(ids.prof[0]!, D3, [1])).status).toBe(201);
      const previa = await chamar("POST", "/reservas/bloqueios", { ...corpo(), somenteConferir: true });
      expect(previa.body.reservasAfetadas).toBe(1);
      expect((await chamar("GET", `/reservas/bloqueios?data=${D3}`)).body).toHaveLength(0);
      const criado = await chamar("POST", "/reservas/bloqueios", corpo());
      expect(criado.status).toBe(201);
      idBloqueio = criado.body.id;
      const [res] = await db.select().from(reservasTable).where(and(eq(reservasTable.escolaId, E), eq(reservasTable.data, D3)));
      expect(res!.status).toBe("pendente");
      const avisos = await db.select().from(comunicadosTable).where(and(eq(comunicadosTable.escolaId, E), eq(comunicadosTable.professorId, ids.prof[0]!)));
      expect(avisos.some((a) => a.titulo.includes("bloqueado") && /Manutenção/.test(a.mensagem))).toBe(true);
    });
    it("recusa reserva na aula bloqueada e aceita fora do bloqueio", async () => {
      const dentro = await lote(ids.prof[1]!, D3, [2]);
      expect(dentro.status).toBe(409);
      expect(dentro.body.error).toMatch(/bloqueado/i);
      expect((await lote(ids.prof[1]!, D3, [3])).status).toBe(201);
    });
    it("a ocupacao do dia e do mes mostram o bloqueio", async () => {
      const dia = (await chamar("GET", `/reservas/gestor/ocupacao?data=${D3}`)).body.ocupacao.filter((o: any) => o.status === "bloqueada");
      expect(dia).toHaveLength(2);
      expect(dia.every((o: any) => o.motivo === "Manutenção" && o.turno === "matutino")).toBe(true);
      const mes = await chamar("GET", `/reservas/gestor/ocupacao-mes?salaId=${ids.sala}&mes=${D3.slice(0, 7)}`);
      expect(mes.body.dias[D3].confirmadas).toBeGreaterThanOrEqual(2);
    });
    it("confirmar a reserva dentro do bloqueio e recusado, mas liberar o bloqueio volta a aceitar reservas", async () => {
      expect((await chamar("DELETE", `/reservas/bloqueios/${idBloqueio}`)).status).toBe(200);
      expect((await chamar("DELETE", `/reservas/bloqueios/${idBloqueio}`)).status).toBe(404);
      expect((await lote(ids.prof[1]!, D3, [2])).status).toBe(201);
    });
    it("dia inteiro em varios dias vira uma aula bloqueada por periodo (5 aulas x 3 periodos)", async () => {
      const r = await chamar("POST", "/reservas/bloqueios", { alvoTipo: "sala", alvoId: ids.sala2, dataInicio: somaDias(D3, 1), dataFim: somaDias(D3, 2), motivo: "limpeza" });
      expect(r.status).toBe(201);
      const dia = (await chamar("GET", `/reservas/gestor/ocupacao?data=${somaDias(D3, 2)}`)).body.ocupacao.filter((o: any) => o.status === "bloqueada");
      expect(dia).toHaveLength(15);
    });
  });

  describe("bloqueio de equipamento (tablets)", () => {
    const base = () => ({ alvoTipo: "recurso", alvoId: ids.recurso, dataInicio: D4, dataFim: D4, turno: "matutino", numerosAula: [1], motivo: "manutencao" });
    it("recusa bloquear mais do que sobra e diz quanto da", async () => {
      expect((await tablets(ids.prof[0]!, D4, [{ numeroAula: 1, quantidade: 20 }])).status).toBe(201);
      const r = await chamar("POST", "/reservas/bloqueios", { ...base(), quantidade: 15 });
      expect(r.status).toBe(409);
      expect(r.body.error).toMatch(/só dá para bloquear 10/);
    });
    it("bloqueia o que cabe e as unidades bloqueadas saem do saldo", async () => {
      const b = await chamar("POST", "/reservas/bloqueios", { ...base(), quantidade: 10 });
      expect(b.status).toBe(201);
      const r = await tablets(ids.prof[1]!, D4, [{ numeroAula: 1, quantidade: 1 }]);
      expect(r.status).toBe(409);
      expect(r.body.error).toMatch(/restam 0 de 30 \(10 bloqueados\)/);
      const oc = (await chamar("GET", `/reservas/gestor/recursos/ocupacao?data=${D4}`)).body.recursos[0].ocupacao.find((o: any) => o.numeroAula === 1 && o.turno === "matutino");
      expect(oc).toMatchObject({ reservadas: 20, bloqueadas: 10 });
      await chamar("DELETE", `/reservas/bloqueios/${b.body.id}`);
      expect((await tablets(ids.prof[1]!, D4, [{ numeroAula: 1, quantidade: 10 }])).status).toBe(201);
    });
    it("criar bloqueio de tablets tambem ESPERA a mesma trava (nao corre contra as reservas)", async () => {
      const segura = await pool.connect();
      try {
        await segura.query("begin");
        await segura.query("select id from recursos where id = $1 for update", [ids.recurso]);
        const dia = somaDias(D4, 14);
        const pedido = chamar("POST", "/reservas/bloqueios", { alvoTipo: "recurso", alvoId: ids.recurso, dataInicio: dia, dataFim: dia, motivo: "limpeza", quantidade: 3 });
        const quem = await Promise.race([pedido.then(() => "terminou"), new Promise<string>((ok) => setTimeout(() => ok("esperando"), 700))]);
        expect(quem).toBe("esperando");
        await segura.query("commit");
        expect((await pedido).status).toBe(201);
      } finally {
        await segura.query("rollback").catch(() => {});
        segura.release();
      }
    });
    it("bloqueio sem quantidade bloqueia todas as unidades", async () => {
      const dia = somaDias(D4, 7);
      expect((await chamar("POST", "/reservas/bloqueios", { alvoTipo: "recurso", alvoId: ids.recurso, dataInicio: dia, dataFim: dia, motivo: "limpeza" })).status).toBe(201);
      const oc = (await chamar("GET", `/reservas/gestor/recursos/ocupacao?data=${dia}`)).body.recursos[0].ocupacao.find((o: any) => o.numeroAula === 1 && o.turno === "noturno");
      expect(oc.bloqueadas).toBe(30);
    });
  });

  describe("permissoes nas rotas reais (por cargo)", () => {
    const como = (cargo: string) => ({ "x-cargo": cargo });
    beforeAll(() => { process.env.ACESSOS_PELO_BANCO = "1"; });
    afterAll(() => { delete process.env.ACESSOS_PELO_BANCO; });

    it("professor nao le a equipe nem grava reservas de outros", async () => {
      expect((await chamar("GET", `/reservas/gestor/semana?data=${D5}`, undefined, como("professor"))).status).toBe(403);
      expect((await chamar("GET", "/reservas/bloqueios", undefined, como("professor"))).status).toBe(403);
      expect((await chamar("POST", "/reservas/bloqueios", { alvoTipo: "sala", alvoId: ids.sala, dataInicio: D5, dataFim: D5, motivo: "limpeza" }, como("professor"))).status).toBe(403);
      expect((await chamar("POST", "/reservas/gestor/lote", { professorId: ids.prof[0]!, data: D5, turno: "matutino", itens: [{ salaId: ids.sala, numerosAula: [1] }], titulo: "x" }, como("professor"))).status).toBe(403);
      expect((await chamar("PATCH", `/recursos/${ids.recurso}`, { quantidadeTotal: 30 }, como("professor"))).status).toBe(403);
    });
    it("gestor de reservas consulta e bloqueia, mas nao muda o total de tablets", async () => {
      expect((await chamar("GET", `/reservas/gestor/semana?data=${D5}`, undefined, como("reservas"))).status).toBe(200);
      expect((await chamar("GET", "/reservas/bloqueios", undefined, como("reservas"))).status).toBe(200);
      const b = await chamar("POST", "/reservas/bloqueios", { alvoTipo: "sala", alvoId: ids.sala2, dataInicio: D5, dataFim: D5, motivo: "limpeza" }, como("reservas"));
      expect(b.status).toBe(201);
      expect((await chamar("DELETE", `/reservas/bloqueios/${b.body.id}`, undefined, como("reservas"))).status).toBe(200);
      expect((await chamar("PATCH", `/recursos/${ids.recurso}`, { quantidadeTotal: 30 }, como("reservas"))).status).toBe(403);
    });
    it("coordenacao muda o total de tablets e faz tudo que o gestor faz", async () => {
      expect((await chamar("PATCH", `/recursos/${ids.recurso}`, { quantidadeTotal: 30 }, como("coordenacao"))).status).toBe(200);
      expect((await chamar("GET", `/reservas/gestor/semana?data=${D5}`, undefined, como("coordenacao"))).status).toBe(200);
    });
  });

  describe("rollout seguro: deploy antes da migracao", () => {
    it("sem a tabela de bloqueios, reservar e consultar nao quebram e criar bloqueio avisa (503)", async () => {
      await db.execute(sql`alter table bloqueios rename to bloqueios_off`);
      try {
        const dia = segundaDaqui(95);
        expect((await lote(ids.prof[3]!, dia, [1])).status).toBe(201);
        expect((await chamar("GET", `/reservas/gestor/ocupacao?data=${dia}`)).status).toBe(200);
        const r = await chamar("POST", "/reservas/bloqueios", { alvoTipo: "sala", alvoId: ids.sala, dataInicio: dia, dataFim: dia, motivo: "limpeza" });
        expect(r.status).toBe(503);
      } finally {
        await db.execute(sql`alter table bloqueios_off rename to bloqueios`);
      }
    });
  });
});

// garante que o arquivo nao fique "vazio" para o vitest quando o banco de teste nao esta configurado
describe("reservas: integracao (configuracao)", () => {
  it(TEM_BANCO ? "banco de teste configurado: os testes de integracao rodam" : "sem TEST_DATABASE_URL: os testes de integracao sao pulados", () => {
    expect(typeof TEM_BANCO).toBe("boolean");
  });
});
