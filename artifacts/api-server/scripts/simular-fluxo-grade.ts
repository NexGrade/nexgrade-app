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
 *           [SIMULACOES-0311] troca-professor, substituto, dia-bloqueado, matriz-troca, aula-a-mais, turma-nova,
 *           fixa-valida, combinado (substituto + dia-bloqueado + fixa-valida) e combinado-inviavel
 *           (troca-professor + dia-bloqueado + matriz-troca + fixa-valida)
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

    const profPorNome = async (nome: string) => {
      const [p] = await q(`select id, nome from professores where escola_id=$1 and nome=$2`, [ESCOLA, nome]);
      if (!p) throw new Error(`professor nao encontrado: ${nome}`);
      return p;
    };
    const vinculo = async (turma: string, disc: string) => {
      const [td] = await q(`select td.*, t.nome turma, d.nome disc from turma_disciplinas td join turmas t on t.id=td.turma_id
        join disciplinas d on d.id=td.disciplina_id where t.escola_id=$1 and t.nome=$2 and d.nome=$3`, [ESCOLA, turma, disc]);
      if (!td) throw new Error(`vinculo nao encontrado: ${turma} / ${disc}`);
      return td;
    };
    const mudarCarga = async (turma: string, disc: string, delta: number) => {
      const td = await vinculo(turma, disc);
      const [{ n }] = await q(`select count(*)::int n from horarios where turma_id=$1 and disciplina_id=$2`, [td.turma_id, td.disciplina_id]);
      const nova = (td.carga_horaria_semanal_override ?? n) + delta;
      await q(`update turma_disciplinas set carga_horaria_semanal_override=$2 where id=$1`, [td.id, nova]);
      return `${turma}: ${disc} ${nova - delta} -> ${nova}`;
    };
    const alteracaoDoDia = async (nome: string): Promise<string> => {
      switch (nome) {
        case "troca-professor": {
          const de = await profPorNome("Patrícia Fernandes"), para = await profPorNome("Flávia Machado");
          for (const t of ["1MA EM", "1MB DES"]) await q(`update turma_disciplinas set professor_id=$2 where id=$1`, [(await vinculo(t, "Educação Física")).id, para.id]);
          return `Educação Física da 1MA EM e da 1MB DES: ${de.nome} -> ${para.nome}`;
        }
        case "substituto": {
          const sai = await profPorNome("Leandro Andrade");
          const [novo] = await q(`insert into professores (escola_id, nome, email, carga_horaria_total) values ($1, 'Substituto Simulação', 'substituto.sim@exemplo.test', 20) returning id`, [ESCOLA]);
          await q(`insert into professor_disciplinas (professor_id, disciplina_id) select $2, disciplina_id from professor_disciplinas where professor_id=$1`, [sai.id, novo.id]);
          const v = await q(`update turma_disciplinas set professor_id=$2 where professor_id=$1 returning id`, [sai.id, novo.id]);
          return `${sai.nome} de licença: ${v.length} vínculos para "Substituto Simulação" (#${novo.id}, sem disponibilidade nem HA)`;
        }
        case "dia-bloqueado": {
          const p = await profPorNome("Diego Cardoso");
          for (const a of slots) {
            await q(`delete from disponibilidade_professores where professor_id=$1 and dia_semana=4 and horario_slot=$2 and turno=$3`, [p.id, a, TURNO]);
            await q(`insert into disponibilidade_professores (professor_id, dia_semana, horario_slot, disponivel, motivo, turno) values ($1, 4, $2, false, 'Simulacao: nao vem na sexta', $3)`, [p.id, a, TURNO]);
          }
          return `${p.nome} indisponível a sexta toda`;
        }
        case "matriz-troca": return `${await mudarCarga("9MA", "Matemática", 1)}; ${await mudarCarga("9MA", "Arte", -1)}`;
        case "aula-a-mais": return await mudarCarga("9MA", "Matemática", 1);
        case "turma-nova": {
          const [t] = await q(`insert into turmas (escola_id, nome, serie, turno, nivel_ensino, ano_letivo, matriz_curricular_id)
            select escola_id, '9MG', serie, turno, nivel_ensino, ano_letivo, matriz_curricular_id from turmas where escola_id=$1 and nome='9MF' returning id`, [ESCOLA]);
          const v = await q(`insert into turma_disciplinas (turma_id, disciplina_id, professor_id, professor_apoio_id, carga_horaria_semanal_override, aulas_assincronas, max_aulas_consecutivas_dia)
            select $2, disciplina_id, professor_id, professor_apoio_id, carga_horaria_semanal_override, aulas_assincronas, max_aulas_consecutivas_dia
            from turma_disciplinas where turma_id=(select id from turmas where escola_id=$1 and nome='9MF') returning id`, [ESCOLA, t.id]);
          return `turma nova 9MG (#${t.id}), cópia da 9MF: ${v.length} vínculos, mesmos professores`;
        }
        case "fixa-valida": {
          const td = await vinculo("8MA", "Educação Física");
          await q(`insert into aulas_fixas (escola_id, turma_id, disciplina_id, professor_id, dia_semana, numero_aula, ano_letivo) values ($1, $2, $3, $4, 2, 1, 2026)`,
            [ESCOLA, td.turma_id, td.disciplina_id, td.professor_id]);
          return `aula fixa: 8MA Educação Física (prof #${td.professor_id}) na quarta, 1ª aula`;
        }
        default: throw new Error(`cenario desconhecido: ${nome}`);
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
      default: {
        // [SIMULACOES-0311] alteracoes do dia a dia da escola (Escola Demonstracao, matutino); "combinado" junta varias
        const partes = CENARIO === "combinado" ? ["substituto", "dia-bloqueado", "fixa-valida"]
          : CENARIO === "combinado-inviavel" ? ["troca-professor", "dia-bloqueado", "matriz-troca", "fixa-valida"] : [CENARIO];
        const mudancas: string[] = [];
        for (const p of partes) mudancas.push(await alteracaoDoDia(p));
        etapa("mudanca", mudancas.length > 1 ? mudancas : mudancas[0]);
      }
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
      // [SIMULACOES-0311] conflitos da tela Conflitos (os aceitos nao entram), antes e depois de promover
      const { detectarConflitos } = await import("../src/routes/conflitos");
      const contarConflitos = async () => {
        const porTipo: Record<string, number> = {};
        const lista = await detectarConflitos(ESCOLA, {});
        for (const c of lista) porTipo[`${c.tipo} (${c.gravidade})`] = (porTipo[`${c.tipo} (${c.gravidade})`] ?? 0) + 1;
        return { total: lista.length, porTipo, exemplos: lista.slice(0, 4).map((c) => c.descricao) };
      };
      const conflitosAntes = await contarConflitos();
      const prom = await chamar("POST", `/horarios/experimentais/${encodeURIComponent(NOME)}/promover`, {});
      etapa("promover", { http: prom.status, ...resumir(prom.body) });
      if (prom.status === 200) etapa("conflitos", { antesDePromover: conflitosAntes, depoisDePromover: await contarConflitos() });
      // HA e aulas, depois de promover, dos professores que os cenarios mexem (e de quem ficou sem aula no turno)
      if (prom.status === 200) etapa("haDepois", await q(`select p.nome, (select count(*)::int from horarios h join turmas t on t.id=h.turma_id where h.professor_id=p.id and t.turno=$2) aulas,
          (select count(*)::int from disponibilidade_professores d where d.professor_id=p.id and d.turno=$2 and d.hora_atividade_obrigatoria) ha
        from professores p where p.escola_id=$1 and (p.nome in ('Leandro Andrade', 'Substituto Simulação', 'Patrícia Fernandes', 'Flávia Machado', 'Diego Cardoso', 'Thiago Nascimento', 'Fábio Monteiro', 'Bruno Soares')
          or (exists (select 1 from disponibilidade_professores d where d.professor_id=p.id and d.turno=$2 and d.hora_atividade_obrigatoria)
              and not exists (select 1 from horarios h join turmas t on t.id=h.turma_id where h.professor_id=p.id and t.turno=$2))) order by 1`, [ESCOLA, TURNO]));
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
