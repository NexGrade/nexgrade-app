/**
 * [SIMULACOES-0311] (03/11/2026) Inicio de ano de uma escola que ja usa o sistema: Virada do ano letivo pelas rotas
 * REAIS (como a tela), os ajustes da escola e a grade dos 3 turnos gerada, simulada e promovida. SO localhost.
 *  - Virada: uma turma fecha, outra abre (copia de uma que continua), tres professores saem.
 *  - Escola: dois substitutos assumem as disciplinas vagas; a turma nova recebe os professores da de origem; as
 *    disciplinas do professor da noite ficam sem ninguem ("o professor ainda nao chegou").
 *  - Desfazer: depois de promover tem que ser recusado. Com --desfazer-logo, desfaz logo depois da virada e confere
 *    se tudo voltou como antes.
 * A liberacao antecipada (o que a Nexus Core faz pelo Painel Master) e chamada direto na lib.
 * Uso (na pasta artifacts/api-server):
 *   DATABASE_URL=postgresql://postgres@localhost:5432/nexgrade_virada DATABASE_SSL=disable \
 *   CPSAT_SERVICE_URL=http://127.0.0.1:8001 npx tsx scripts/simular-virada.ts [--desfazer-logo]
 */
import express from "express";
import type { AddressInfo } from "node:net";

const host = (() => { try { return new URL(process.env.DATABASE_URL ?? "").hostname; } catch { return ""; } })();
if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
  console.error(`RECUSADO: DATABASE_URL tem que ser um banco em localhost (veio: "${host || "vazio"}")`);
  process.exit(1);
}
const ESCOLA = "esc_1ce4d2d30c4146a99fb7ffa5";
const DESFAZER_LOGO = process.argv.includes("--desfazer-logo");

async function main() {
  const { pool } = await import("@workspace/db");
  const { exigirAdminParaAlterar } = await import("../src/lib/permissao");
  const { liberarViradaAntes } = await import("../src/lib/virada-ano");
  const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows as any[];
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.auth = Object.assign(() => ({ orgId: ESCOLA, userId: "u_simulacao", orgRole: "org:admin", tokenType: "session_token" }),
      { [Symbol.for("@clerk/express.auth")]: true });
    next();
  });
  app.use(exigirAdminParaAlterar);
  for (const [base, mod] of [["/virada-ano", "../src/routes/virada-ano"], ["/turmas", "../src/routes/turmas"], ["/professores", "../src/routes/professores"], ["/horarios", "../src/routes/horarios"]] as const)
    app.use(base, (await import(mod)).default);
  const server = app.listen(0);
  const porta = (server.address() as AddressInfo).port;
  const chamar = async (metodo: string, caminho: string, corpo?: unknown) => {
    const r = await fetch(`http://127.0.0.1:${porta}${caminho}`, { method: metodo, headers: { "Content-Type": "application/json" }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    const texto = await r.text();
    let body: any = texto;
    try { body = JSON.parse(texto); } catch { /* sem JSON */ }
    return { status: r.status, body };
  };
  const exigir = (r: { status: number; body: any }, oQue: string) => {
    if (r.status >= 300) throw new Error(`${oQue}: HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 400)}`);
    return r.body;
  };
  const contagem = async () => (await q(`select
      (select count(*)::int from turmas where escola_id=$1) turmas,
      (select count(*)::int from turma_disciplinas td join turmas t on t.id=td.turma_id where t.escola_id=$1) vinculos,
      (select count(*)::int from turma_disciplinas td join turmas t on t.id=td.turma_id where t.escola_id=$1 and td.professor_id is null) "vinculosSemProfessor",
      (select count(*)::int from professores where escola_id=$1 and ativo) "professoresAtivos",
      (select count(*)::int from horarios where escola_id=$1) aulas,
      (select count(*)::int from disponibilidade_professores d join professores p on p.id=d.professor_id where p.escola_id=$1) disponibilidade,
      (select count(*)::int from disponibilidade_professores d join professores p on p.id=d.professor_id where p.escola_id=$1 and d.hora_atividade_obrigatoria) ha,
      (select count(*)::int from aulas_fixas where escola_id=$1) "aulasFixas",
      (select string_agg(distinct ano_letivo::text, ',') from turmas where escola_id=$1) ano`, [ESCOLA]))[0];
  const rel: Record<string, any> = {};

  try {
    rel.antes = await contagem();
    rel.previa = (({ situacao, zera }) => ({ situacao, zera }))(exigir(await chamar("GET", "/virada-ano/previa"), "previa"));
    // a Nexus Core libera antes do fim do ano (hoje e novembro)
    rel.liberar = await liberarViradaAntes(ESCOLA, "simulacao");

    // ---------- 1) a virada ----------
    const prof = async (nome: string) => (await q(`select id, nome from professores where escola_id=$1 and nome=$2`, [ESCOLA, nome]))[0];
    const turma = async (nome: string) => (await q(`select id, nome from turmas where escola_id=$1 and nome=$2`, [ESCOLA, nome]))[0];
    const [profNoite] = await q(`select p.id, p.nome, count(*)::int aulas from horarios h join turmas t on t.id=h.turma_id join professores p on p.id=h.professor_id
      where h.escola_id=$1 and t.turno='noturno' and not exists (select 1 from horarios h2 join turmas t2 on t2.id=h2.turma_id where h2.professor_id=p.id and t2.turno<>'noturno')
      group by 1,2 order by 3 desc limit 1`, [ESCOLA]);
    const saem = [await prof("Leandro Andrade"), await prof("Beatriz Araújo"), profNoite];
    const fecha = await turma("3MA EM"), origemNova = await turma("9MF");
    const vagas = await q(`select td.id, td.turma_id, t.nome turma, d.nome disc, td.professor_id from turma_disciplinas td join turmas t on t.id=td.turma_id join disciplinas d on d.id=td.disciplina_id
      where t.escola_id=$1 and td.professor_id = any($2) and t.id<>$3 order by td.professor_id, t.nome`, [ESCOLA, saem.map((p) => p.id), fecha.id]);
    const sit = exigir(await chamar("GET", "/virada-ano/situacao"), "situacao");
    const virada = await chamar("POST", "/virada-ano", {
      excluirTurmas: [fecha.id], duplicarTurmas: [{ origemId: origemNova.id, nome: "9MG" }], professoresQueSaem: saem.map((p) => p.id), confirmacao: sit.confirmacao,
    });
    rel.virada = { http: virada.status, ...virada.body, plano: { fecha: fecha.nome, abre: "9MG (cópia da 9MF)", saem: saem.map((p) => p.nome) } };
    if (virada.status !== 201) throw new Error(`virada recusada: ${JSON.stringify(virada.body)}`);
    rel.depoisDaVirada = await contagem();
    rel.aulaFixaDeQuemSaiu = await q(`select af.*, p.nome, p.ativo from aulas_fixas af join professores p on p.id=af.professor_id where af.escola_id=$1`, [ESCOLA]);

    if (DESFAZER_LOGO) {
      const d = await chamar("POST", "/virada-ano/desfazer");
      rel.desfazer = { http: d.status, ...d.body };
      rel.depoisDeDesfazer = await contagem();
      rel.voltouIgual = JSON.stringify(rel.depoisDeDesfazer) === JSON.stringify(rel.antes);
      return;
    }

    // ---------- 2) a escola ajusta: substitutos, turma nova, e a noite fica com disciplina vaga ----------
    const ajustes: string[] = [];
    for (const sai of saem.slice(0, 2)) {
      const habil = (await q(`select disciplina_id from professor_disciplinas where professor_id=$1`, [sai.id])).map((r) => r.disciplina_id);
      const novo = exigir(await chamar("POST", "/professores", { nome: `Substituto de ${sai.nome.split(" ")[0]} (simulação)`.replace(/[()]/g, ""), email: `subst.${sai.id}@simulacao.test`, disciplinaIds: habil }), "substituto");
      for (const v of vagas.filter((x) => x.professor_id === sai.id)) {
        exigir(await chamar("PATCH", `/turmas/${v.turma_id}/disciplinas/linha/${v.id}`, { professorId: novo.id }), `vinculo ${v.turma}/${v.disc}`);
      }
      ajustes.push(`${novo.nome} assumiu ${vagas.filter((x) => x.professor_id === sai.id).length} vínculos de ${sai.nome}`);
    }
    const nova = await turma("9MG");
    const daOrigem = await q(`select disciplina_id, professor_id, professor_apoio_id from turma_disciplinas where turma_id=$1`, [origemNova.id]);
    for (const l of await q(`select id, disciplina_id from turma_disciplinas where turma_id=$1`, [nova.id])) {
      const o = daOrigem.find((x) => x.disciplina_id === l.disciplina_id && x.professor_id != null);
      if (o) exigir(await chamar("PATCH", `/turmas/${nova.id}/disciplinas/linha/${l.id}`, { professorId: o.professor_id }), "vinculo 9MG");
    }
    ajustes.push(`9MG recebeu os professores da 9MF`);
    ajustes.push(`${vagas.filter((x) => x.professor_id === profNoite.id).length} vínculos de ${profNoite.nome} ficaram sem professor (noite)`);
    rel.ajustes = ajustes;
    rel.depoisDosAjustes = await contagem();

    // ---------- 3) gerar, simular e promover os 3 turnos ----------
    rel.turnos = {};
    for (const turno of ["matutino", "vespertino", "noturno"]) {
      const nome = `Virada-${turno}`;
      const inicio = Date.now();
      const r = await chamar("POST", "/horarios/gerar-cpsat-async", { turno, nomeExperimental: nome });
      let st: any = r.body;
      if (r.status === 202) {
        do { await new Promise((ok) => setTimeout(ok, 3000)); st = (await chamar("GET", `/horarios/gerar-cpsat-status/${r.body.jobId}`)).body; }
        while (st.jobStatus === "running" && Date.now() - inicio < 15 * 60_000);
      }
      const t: Record<string, any> = { segundos: Math.round((Date.now() - inicio) / 1000), jobStatus: st?.jobStatus, status: st?.status, erro: st?.error,
        diagnostico: st?.diagnostico && { titulo: st.diagnostico.titulo, problemas: st.diagnostico.problemas?.map((p: any) => p.oQue), avisos: st.diagnostico.avisos?.map((p: any) => p.oQue) } };
      const [{ n }] = await q(`select count(*)::int n from horarios_experimentais where escola_id=$1 and nome=$2`, [ESCOLA, nome]);
      t.aulasNoExperimento = n;
      if (n > 0) {
        const sim = await chamar("GET", `/horarios/experimentais/${nome}/simulacao`);
        t.simulacao = sim.status === 200 ? { veredito: sim.body.veredito, turnos: sim.body.turnos, janelas: sim.body.experimento?.porTurno } : { http: sim.status, erro: sim.body?.error };
        const prom = await chamar("POST", `/horarios/experimentais/${nome}/promover`, {});
        t.promover = { http: prom.status, erro: prom.body?.error, avisoHA: prom.body?.avisoHA };
      }
      rel.turnos[turno] = t;
    }

    // ---------- 4) desfazer depois de promover: tem que ser recusado ----------
    const d = await chamar("POST", "/virada-ano/desfazer");
    rel.desfazerDepoisDePromover = { http: d.status, ...d.body };

    const { detectarConflitos } = await import("../src/routes/conflitos");
    const cs = await detectarConflitos(ESCOLA, {});
    const porTipo: Record<string, number> = {};
    for (const c of cs) porTipo[`${c.tipo} (${c.gravidade})`] = (porTipo[`${c.tipo} (${c.gravidade})`] ?? 0) + 1;
    rel.final = { ...(await contagem()), conflitos: porTipo, exemplos: cs.filter((c) => c.gravidade === "critico" || c.gravidade === "alto").slice(0, 10).map((c) => c.descricao),
      aulasDosQueSairam: (await q(`select count(*)::int n from horarios where professor_id = any($1)`, [saem.map((p) => p.id)]))[0].n };
  } catch (e) {
    rel.ERRO_DO_ROTEIRO = e instanceof Error ? e.stack : String(e);
  } finally {
    console.log("\n@@RELATORIO@@\n" + JSON.stringify(rel, null, 1));
    server.close();
    await pool.end();
  }
}

main();
