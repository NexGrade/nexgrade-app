/**
 * [SIMULACOES] (01/11/2026) Roda UM cenario do fluxo da grade de ponta a ponta, com as rotas REAIS de horarios
 * (sessao simulada da escola, como nos testes de integracao): aplica uma mudanca (bloqueio, carga, aula fixa...),
 * gera a grade experimental pelo CP-SAT, consulta a simulacao da promocao e promove. Imprime o que o sistema
 * respondeu em cada etapa (status HTTP, mensagem e as listas que vierem), para achar travas e mensagens que
 * nao dizem o que esta errado.
 * SO roda contra banco em localhost (recusa outro endereco). Cada cenario deve comecar de um banco limpo: o
 * roteiro em lote recria o banco a partir de uma copia-modelo antes de cada um (ver docs/passagem-2026-11-01.md).
 * Uso (na pasta artifacts/api-server):
 *   DATABASE_URL=postgresql://postgres@localhost:5432/nexgrade_sim DATABASE_SSL=disable \
 *   CPSAT_SERVICE_URL=http://127.0.0.1:8001 npx tsx scripts/simular-fluxo-grade.ts --cenario=base [--turno=matutino]
 * Cenarios: base, bloqueio-2-dias, professor-todo-bloqueado, fixa-em-bloqueio, carga-estourada,
 *           vinculo-sem-professor, tempo-curto, promover-fora-do-periodo, heuristico-turma,
 *           conferir-promocao (compara a simulacao com a oficial depois de promover), melhorar [--tempo=300]
 */
import express from "express";
import type { AddressInfo } from "node:net";

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const CENARIO = arg("cenario") ?? "base";
const TURNO = arg("turno") ?? "matutino";
const ESCOLA = arg("escola") ?? "esc_1ce4d2d30c4146a99fb7ffa5";
const NOME = `Sim-${CENARIO}`;

const host = (() => { try { return new URL(process.env.DATABASE_URL ?? "").hostname; } catch { return ""; } })();
if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
  console.error(`RECUSADO: DATABASE_URL tem que ser um banco em localhost (veio: "${host || "vazio"}")`);
  process.exit(1);
}

/** Resumo do corpo de uma resposta: texto principal e o tamanho/amostra de cada lista que veio. */
function resumir(corpo: any) {
  if (!corpo || typeof corpo !== "object") return corpo;
  const r: Record<string, unknown> = {};
  for (const k of ["jobStatus", "httpStatusOriginal", "error", "mensagem", "detalhe", "dica", "status", "etapa", "totalAulas", "aulasGeradas", "veredito"]) {
    if (corpo[k] != null) r[k] = typeof corpo[k] === "string" ? corpo[k].slice(0, 400) : corpo[k];
  }
  for (const [k, v] of Object.entries(corpo)) {
    if (k === "diagnostico") r[k] = v; // [DIAGNOSTICO-GERACAO] inteiro: e o que a escola ve no quadro
    else if (Array.isArray(v) && !["etapas"].includes(k)) r[`${k}[${v.length}]`] = v.slice(0, 3);
    else if (v && typeof v === "object" && !["motor", "progresso"].includes(k) && !(k in r)) r[k] = JSON.stringify(v).slice(0, 300);
  }
  return r;
}

async function main() {
  const { pool } = await import("@workspace/db");
  const { default: horariosRouter } = await import("../src/routes/horarios");
  const { exigirAdminParaAlterar } = await import("../src/lib/permissao");
  const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows as any[];

  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.auth = Object.assign(() => ({ orgId: ESCOLA, userId: "u_simulacao", orgRole: "org:admin", tokenType: "session_token" }),
      { [Symbol.for("@clerk/express.auth")]: true });
    next();
  });
  app.use(exigirAdminParaAlterar);
  app.use("/horarios", horariosRouter);
  const server = app.listen(0);
  const porta = (server.address() as AddressInfo).port;
  const chamar = async (metodo: string, caminho: string, corpo?: unknown) => {
    const r = await fetch(`http://127.0.0.1:${porta}${caminho}`, { method: metodo, headers: { "Content-Type": "application/json" },
      body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    const texto = await r.text();
    let body: any = texto;
    try { body = JSON.parse(texto); } catch { /* resposta sem JSON */ }
    return { status: r.status, body };
  };
  const relatorio: Record<string, unknown> = { cenario: CENARIO, turno: TURNO };
  const etapa = (nome: string, valor: unknown) => { relatorio[nome] = valor; };

  try {
    // ---------- dados de apoio (do proprio banco) ----------
    const [prof] = await q(`select p.id, p.nome, count(*)::int aulas from horarios h join turmas t on t.id=h.turma_id
      join professores p on p.id=h.professor_id where h.escola_id=$1 and t.turno=$2 group by 1, 2 order by 3 desc limit 1`, [ESCOLA, TURNO]);
    const slots = (await q(`select distinct numero_aula from horario_slots where escola_id=$1 and turno=$2 and coalesce(letivo, true) order by 1`, [ESCOLA, TURNO])).map((s) => s.numero_aula as number);
    const bloquear = async (dias: number[], aulas: number[]) => {
      for (const d of dias) for (const a of aulas) {
        await q(`delete from disponibilidade_professores where professor_id=$1 and dia_semana=$2 and horario_slot=$3 and turno=$4`, [prof.id, d, a, TURNO]);
        await q(`insert into disponibilidade_professores (professor_id, dia_semana, horario_slot, disponivel, motivo, turno)
          values ($1, $2, $3, false, 'Simulacao: indisponivel', $4)`, [prof.id, d, a, TURNO]);
      }
    };

    // ---------- 1) a mudanca do cenario ----------
    let tempoLimiteS: number | undefined;
    switch (CENARIO) {
      case "base": case "promover-fora-do-periodo": case "heuristico-turma": case "conferir-promocao": case "melhorar": break;
      case "bloqueio-2-dias": await bloquear([0, 1], slots); etapa("mudanca", `${prof.nome} (#${prof.id}, ${prof.aulas} aulas) indisponivel seg e ter`); break;
      case "professor-todo-bloqueado": await bloquear([0, 1, 2, 3, 4], slots); etapa("mudanca", `${prof.nome} (#${prof.id}, ${prof.aulas} aulas) indisponivel a semana toda`); break;
      case "fixa-em-bloqueio": {
        const [h] = await q(`select h.* from horarios h join turmas t on t.id=h.turma_id where h.professor_id=$1 and t.turno=$2 order by h.id limit 1`, [prof.id, TURNO]);
        await q(`insert into aulas_fixas (escola_id, turma_id, disciplina_id, professor_id, dia_semana, numero_aula, ano_letivo)
          values ($1, $2, $3, $4, $5, $6, 2026)`, [ESCOLA, h.turma_id, h.disciplina_id, h.professor_id, h.dia_semana, h.numero_aula]);
        await bloquear([h.dia_semana], [h.numero_aula]);
        etapa("mudanca", `aula fixa de ${prof.nome} na turma #${h.turma_id}, dia ${h.dia_semana} aula ${h.numero_aula}, e o mesmo horario bloqueado`);
        break;
      }
      case "carga-estourada": {
        const [td] = await q(`select td.id, td.carga_horaria_semanal_override c, t.nome turma, d.nome disc from turma_disciplinas td
          join turmas t on t.id=td.turma_id join disciplinas d on d.id=td.disciplina_id
          where t.escola_id=$1 and t.turno=$2 and td.professor_id is not null order by td.id limit 1`, [ESCOLA, TURNO]);
        await q(`update turma_disciplinas set carga_horaria_semanal_override=coalesce(carga_horaria_semanal_override, 2)+8 where id=$1`, [td.id]);
        etapa("mudanca", `${td.turma}: ${td.disc} de ${td.c ?? "(padrao)"} para +8 aulas`);
        break;
      }
      case "vinculo-sem-professor": {
        const [td] = await q(`select td.id, t.nome turma, d.nome disc from turma_disciplinas td join turmas t on t.id=td.turma_id
          join disciplinas d on d.id=td.disciplina_id where t.escola_id=$1 and t.turno=$2 and td.professor_id is not null order by td.id limit 1`, [ESCOLA, TURNO]);
        await q(`update turma_disciplinas set professor_id=null where id=$1`, [td.id]);
        etapa("mudanca", `${td.turma}: ${td.disc} ficou sem professor`);
        break;
      }
      case "tempo-curto": tempoLimiteS = 2; etapa("mudanca", "motor com 2 segundos"); break;
      default: throw new Error(`cenario desconhecido: ${CENARIO}`);
    }

    // ---------- 2) gerar ----------
    if (CENARIO === "heuristico-turma") {
      const [t] = await q(`select id, nome from turmas where escola_id=$1 and turno=$2 and not fantasma order by id limit 1`, [ESCOLA, TURNO]);
      // substituir: true e o padrao da tela (gerarForm em pages/horario/index.tsx)
      const r = await chamar("POST", "/horarios/gerar", { turmaId: t.id, experimental: true, nomeExperimental: NOME, aulaspordia: slots.length, substituir: true });
      etapa("gerar", { rota: `POST /horarios/gerar (heuristico, turma ${t.nome})`, http: r.status, ...resumir(r.body) });
    } else {
      const inicio = Date.now();
      // melhorar: parte da grade OFICIAL e so troca aulas de lugar (POST /melhorar-grade-async), mesmo acompanhamento
      const r = CENARIO === "melhorar"
        ? await chamar("POST", "/horarios/melhorar-grade-async", { turno: TURNO, nomeExperimental: NOME, tempoLimiteS: Number(arg("tempo") ?? 300) })
        : await chamar("POST", "/horarios/gerar-cpsat-async", { turno: TURNO, nomeExperimental: NOME, ...(tempoLimiteS ? { tempoLimiteS } : {}) });
      if (r.status !== 202) etapa("gerar", { http: r.status, ...resumir(r.body) });
      else {
        let st: any;
        do {
          await new Promise((ok) => setTimeout(ok, 2000));
          st = (await chamar("GET", `/horarios/gerar-cpsat-status/${r.body.jobId}`)).body;
        } while (st.jobStatus === "running" && Date.now() - inicio < 15 * 60_000);
        etapa("gerar", { segundos: Math.round((Date.now() - inicio) / 1000), ...resumir(st) });
      }
    }

    // ---------- 3) simular a promocao e promover ----------
    const [{ n }] = await q(`select count(*)::int n from horarios_experimentais where escola_id=$1 and nome=$2`, [ESCOLA, NOME]);
    etapa("aulasNoExperimento", n);
    if (n > 0) {
      if (CENARIO === "promover-fora-do-periodo") {
        const [x] = await q(`select * from horarios_experimentais where escola_id=$1 and nome=$2 limit 1`, [ESCOLA, NOME]);
        await q(`update horarios_experimentais set numero_aula=9 where id=$1`, [x.id]);
        etapa("mudanca", `uma aula do experimento movida para a 9a aula (fora do esquema)`);
      }
      const sim = await chamar("GET", `/horarios/experimentais/${encodeURIComponent(NOME)}/simulacao`);
      etapa("simulacao", { http: sim.status, ...resumir(sim.body) });
      const prom = await chamar("POST", `/horarios/experimentais/${encodeURIComponent(NOME)}/promover`, {});
      etapa("promover", { http: prom.status, ...resumir(prom.body) });
      // conferir-promocao: o que a simulacao previu (janelas com a HA no lugar) bate com a oficial DEPOIS de promover?
      // Um experimento "neutro" (1 aula identica a oficial) faz a simulacao contar a oficial de hoje com a HA gravada.
      if ((CENARIO === "conferir-promocao" || CENARIO === "melhorar") && prom.status === 200 && sim.status === 200) {
        const [h] = await q(`select h.* from horarios h join turmas t on t.id=h.turma_id where h.escola_id=$1 and t.turno=$2 order by h.id limit 1`, [ESCOLA, TURNO]);
        await q(`insert into horarios_experimentais (escola_id, nome, turma_id, disciplina_id, professor_id, dia_semana, numero_aula)
          values ($1, 'Sim-neutro', $2, $3, $4, $5, $6)`, [ESCOLA, h.turma_id, h.disciplina_id, h.professor_id, h.dia_semana, h.numero_aula]);
        const real = (await chamar("GET", `/horarios/experimentais/Sim-neutro/simulacao`)).body;
        const previsto = sim.body.experimento, depois = real.oficialHoje;
        const porProf = (d: any[]) => new Map(d.map((x) => [`${x.professorNome}|${x.dia}`, x.janelas]));
        const a = porProf(previsto.detalhe), b = porProf(depois.detalhe);
        const diferentes = [...new Set([...a.keys(), ...b.keys()])].filter((k) => (a.get(k) ?? 0) !== (b.get(k) ?? 0))
          .map((k) => `${k}: previsto ${a.get(k) ?? 0}, real ${b.get(k) ?? 0}`);
        const [{ ha }] = await q(`select count(*)::int ha from disponibilidade_professores d join professores p on p.id=d.professor_id
          where p.escola_id=$1 and d.hora_atividade_obrigatoria and d.turno=$2`, [ESCOLA, TURNO]);
        etapa("conferencia", {
          janelasPrevistasNaSimulacao: previsto.janelas, janelasReaisDepoisDePromover: depois.janelas,
          diasComJanelaPrevisto: previsto.diasComConflito, diasComJanelaReal: depois.diasComConflito,
          professorDiaDiferentes: diferentes.length, amostra: diferentes.slice(0, 15), haNoTurnoDepois: ha,
        });
      }
    }
  } catch (e) {
    etapa("ERRO_DO_ROTEIRO", e instanceof Error ? e.stack : String(e));
  } finally {
    console.log(JSON.stringify(relatorio, null, 1));
    server.close();
    await pool.end();
  }
}

main();
