/**
 * [SIMULACOES-0311] (03/11/2026) Varias escolas gerando a grade AO MESMO TEMPO no mesmo servidor (como na producao):
 * dispara POST /horarios/gerar-cpsat-async de todas juntas, acompanha cada job, simula a promocao e promove, e
 * confere se uma escola nao mexeu na outra (experimento e grade oficial de cada uma, e se o job de uma escola
 * pode ser lido por outra). Com --repetir, a primeira escola dispara a geracao duas vezes com o MESMO
 * nome de experimento (dois cliques em Gerar; a tela usa o nome padrao CPSAT-<turno>).
 * SO roda contra banco em localhost (recusa outro endereco).
 * Uso (na pasta artifacts/api-server):
 *   DATABASE_URL=postgresql://postgres@localhost:5432/nexgrade_multi DATABASE_SSL=disable \
 *   CPSAT_SERVICE_URL=http://127.0.0.1:8001 npx tsx scripts/simular-escolas-juntas.ts --escolas=id1,id2 [--turno=matutino] [--repetir]
 */
import express from "express";
import type { AddressInfo } from "node:net";

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const ESCOLAS = (arg("escolas") ?? "").split(",").filter(Boolean);
const TURNO = arg("turno") ?? "matutino";
const REPETIR = process.argv.includes("--repetir");

const host = (() => { try { return new URL(process.env.DATABASE_URL ?? "").hostname; } catch { return ""; } })();
if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
  console.error(`RECUSADO: DATABASE_URL tem que ser um banco em localhost (veio: "${host || "vazio"}")`);
  process.exit(1);
}

async function main() {
  const { pool } = await import("@workspace/db");
  const { default: horariosRouter } = await import("../src/routes/horarios");
  const { exigirAdminParaAlterar } = await import("../src/lib/permissao");
  const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows as any[];

  const app = express();
  app.use(express.json());
  // a escola da "sessao" vem do cabecalho x-escola (cada chamada e de uma coordenacao diferente)
  app.use((req: any, _res, next) => {
    const orgId = String(req.headers["x-escola"]);
    req.auth = Object.assign(() => ({ orgId, userId: `u_sim_${orgId}`, orgRole: "org:admin", tokenType: "session_token" }),
      { [Symbol.for("@clerk/express.auth")]: true });
    next();
  });
  app.use(exigirAdminParaAlterar);
  app.use("/horarios", horariosRouter);
  const server = app.listen(0);
  const porta = (server.address() as AddressInfo).port;
  const chamar = async (escola: string, metodo: string, caminho: string, corpo?: unknown) => {
    const r = await fetch(`http://127.0.0.1:${porta}${caminho}`, { method: metodo, headers: { "Content-Type": "application/json", "x-escola": escola },
      body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    const texto = await r.text();
    let body: any = texto;
    try { body = JSON.parse(texto); } catch { /* resposta sem JSON */ }
    return { status: r.status, body };
  };
  // retrato da grade oficial de uma escola, para ver depois se outra escola mexeu nela
  const retrato = async (escola: string) => (await q(`select count(*)::int n, coalesce(sum(hashtext(turma_id||'|'||disciplina_id||'|'||coalesce(professor_id,0)||'|'||dia_semana||'|'||numero_aula)::bigint), 0)::text h
    from horarios where escola_id=$1`, [escola]))[0];
  const nomeDe = async (escola: string) => (await q(`select nome_fantasia from escolas where id=$1`, [escola]))[0]?.nome_fantasia ?? escola;

  const relatorio: Record<string, any> = { turno: TURNO, escolas: {} };
  try {
    const antes = Object.fromEntries(await Promise.all(ESCOLAS.map(async (e) => [e, await retrato(e)])));
    const disparos = ESCOLAS.flatMap((e, i) => (REPETIR && i === 0 ? [e, e] : [e]).map((escola, k) => ({ escola, nome: "Sim-juntas", clique: k + 1 })));
    const inicio = Date.now();
    const jobs = await Promise.all(disparos.map(async (d) => {
      const r = await chamar(d.escola, "POST", "/horarios/gerar-cpsat-async", { turno: TURNO, nomeExperimental: d.nome });
      return { ...d, http: r.status, jobId: r.body?.jobId, resposta: r.status === 202 ? undefined : r.body };
    }));
    // o job de uma escola pode ser lido por outra?
    const [j0] = jobs.filter((j) => j.jobId);
    const outra = ESCOLAS.find((e) => e !== j0?.escola);
    if (j0 && outra) {
      const r = await chamar(outra, "GET", `/horarios/gerar-cpsat-status/${j0.jobId}`);
      relatorio.jobDeOutraEscola = { http: r.status, jobStatus: r.body?.jobStatus, vazouDadosDaOutra: r.status === 200 && r.body?.jobStatus != null };
    }
    const fins = await Promise.all(jobs.map(async (j) => {
      if (!j.jobId) return { ...j, segundos: 0 };
      let st: any;
      do {
        await new Promise((ok) => setTimeout(ok, 3000));
        st = (await chamar(j.escola, "GET", `/horarios/gerar-cpsat-status/${j.jobId}`)).body;
      } while (st?.jobStatus === "running" && Date.now() - inicio < 20 * 60_000);
      return { ...j, segundos: Math.round((Date.now() - inicio) / 1000), st };
    }));
    for (const f of fins) {
      const chave = `${await nomeDe(f.escola)} [clique ${f.clique}]`;
      const [{ n }] = await q(`select count(*)::int n from horarios_experimentais where escola_id=$1 and nome=$2`, [f.escola, f.nome]);
      const sim = n > 0 ? await chamar(f.escola, "GET", `/horarios/experimentais/${encodeURIComponent(f.nome)}/simulacao`) : undefined;
      relatorio.escolas[chave] = {
        disparo: f.http, resposta: f.resposta, segundos: f.segundos, jobStatus: f.st?.jobStatus, status: f.st?.status,
        erro: f.st?.error ?? f.st?.mensagem, diagnostico: f.st?.diagnostico, aulasNoExperimento: n,
        janelas: sim?.status === 200 ? { oficialHoje: sim.body.oficialHoje?.janelas, experimento: sim.body.experimento?.janelas } : sim?.status,
        mudancasHA: sim?.status === 200 ? (sim.body.mudancasHA ?? sim.body.haMudancas)?.length : undefined,
      };
    }
    // promove todas ao mesmo tempo (a primeira de cada escola)
    const aPromover = ESCOLAS.map((e) => fins.find((f) => f.escola === e)!);
    const prom = await Promise.all(aPromover.map(async (f) => {
      const [{ n }] = await q(`select count(*)::int n from horarios_experimentais where escola_id=$1 and nome=$2`, [f.escola, f.nome]);
      if (!n) return { escola: f.escola, pulou: "sem experimento" };
      const r = await chamar(f.escola, "POST", `/horarios/experimentais/${encodeURIComponent(f.nome)}/promover`, {});
      return { escola: f.escola, http: r.status, aulas: r.body?.totalAulas ?? r.body?.aulasPromovidas, avisoHA: r.body?.avisoHA, erro: r.body?.error };
    }));
    relatorio.promocao = prom;
    // isolamento: experimento so na propria escola; grade oficial so mudou onde promoveu
    relatorio.isolamento = await Promise.all(ESCOLAS.map(async (e) => {
      const depois = await retrato(e);
      const promoveu = prom.some((p: any) => p.escola === e && p.http === 200);
      const [{ alheios }] = await q(`select count(*)::int alheios from horarios_experimentais x join turmas t on t.id=x.turma_id where x.escola_id=$1 and t.escola_id<>$1`, [e]);
      const [{ alheiosOf }] = await q(`select count(*)::int "alheiosOf" from horarios h join turmas t on t.id=h.turma_id where h.escola_id=$1 and t.escola_id<>$1`, [e]);
      return { escola: await nomeDe(e), promoveu, oficialMudou: depois.h !== antes[e].h, aulasAntes: antes[e].n, aulasDepois: depois.n,
        experimentoComTurmaDeOutraEscola: alheios, oficialComTurmaDeOutraEscola: alheiosOf };
    }));
  } catch (e) {
    relatorio.ERRO_DO_ROTEIRO = e instanceof Error ? e.stack : String(e);
  } finally {
    console.log(JSON.stringify(relatorio, null, 1));
    server.close();
    await pool.end();
  }
}

main();
