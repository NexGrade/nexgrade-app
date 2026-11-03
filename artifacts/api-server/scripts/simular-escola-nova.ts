/**
 * [SIMULACOES-0311] (03/11/2026) Escola NOVA do zero, cadastrada pelas rotas REAIS da API (como a tela e o Painel
 * Master fazem), e a grade dos 3 turnos gerada, simulada e promovida. Testa o primeiro uso de uma escola cliente:
 * cadastro pelo Master, catalogo SEED-PR, esquema de aulas, turmas com matriz, professores e habilitacoes, vinculos,
 * disponibilidade, HA nascendo do zero.
 *  - Escola ficticia (nomes, CNPJ e e-mails inventados). SO roda contra banco em localhost.
 *  - Os ids sao descobertos lendo o banco (so leitura); tudo o que grava passa pelas rotas.
 * Perfil: manha 6o ao 9o (2 turmas cada), tarde 6o ao 9o (2 cada), noite Medio 1a a 3a (1 cada).
 * Uso (na pasta artifacts/api-server):
 *   DATABASE_URL=postgresql://postgres@localhost:5432/nexgrade_nova DATABASE_SSL=disable \
 *   CPSAT_SERVICE_URL=http://127.0.0.1:8001 npx tsx scripts/simular-escola-nova.ts
 */
import express from "express";
import type { AddressInfo } from "node:net";

const host = (() => { try { return new URL(process.env.DATABASE_URL ?? "").hostname; } catch { return ""; } })();
if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
  console.error(`RECUSADO: DATABASE_URL tem que ser um banco em localhost (veio: "${host || "vazio"}")`);
  process.exit(1);
}

const CURSO_FUND = "ensino fundamental - anos finais - tempo parcial diurno|";
const CURSO_MEDIO_NOITE = "ensino medio - tempo parcial noturno - itinerario linguagens e ciencias humanas|";
const INICIO: Record<string, [number, number]> = { matutino: [7, 30], vespertino: [13, 0], noturno: [19, 0] };
const NOMES = ["Ana", "Bruno", "Carla", "Daniel", "Elisa", "Fernando", "Gabriela", "Heitor", "Iara", "João", "Karen", "Lucas",
  "Marina", "Nelson", "Olívia", "Paulo", "Quitéria", "Rafael", "Sônia", "Tiago", "Úrsula", "Vinícius", "Wanda", "Xavier", "Yara", "Zeca"];
const SOBRENOMES = ["Simulada", "Teste", "Fictícia", "Exemplo", "Modelo"];
const MAX_AULAS_PROF = 20;

async function main() {
  const { pool } = await import("@workspace/db");
  const { exigirAdminParaAlterar } = await import("../src/lib/permissao");
  const rotas: Array<[string, string]> = [
    ["/master", "../src/routes/master-nova-escola"], ["/matrizes-oficiais", "../src/routes/matrizes-oficiais"],
    ["/horario-slots", "../src/routes/horario-slots"], ["/turmas", "../src/routes/turmas"], ["/professores", "../src/routes/professores"],
    ["/disponibilidade", "../src/routes/disponibilidade"], ["/horarios", "../src/routes/horarios"],
  ];
  const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows as any[];

  let escola = "org_master"; // a "sessao" troca para a escola nova depois de criada
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.auth = Object.assign(() => ({ orgId: escola, userId: "u_simulacao", orgRole: "org:admin", tokenType: "session_token" }),
      { [Symbol.for("@clerk/express.auth")]: true });
    next();
  });
  app.use(exigirAdminParaAlterar);
  for (const [base, mod] of rotas) app.use(base, (await import(mod)).default);
  const server = app.listen(0);
  const porta = (server.address() as AddressInfo).port;
  const chamar = async (metodo: string, caminho: string, corpo?: unknown) => {
    const r = await fetch(`http://127.0.0.1:${porta}${caminho}`, { method: metodo, headers: { "Content-Type": "application/json" },
      body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    const texto = await r.text();
    let body: any = texto;
    try { body = JSON.parse(texto); } catch { /* sem JSON */ }
    return { status: r.status, body };
  };
  const exigir = (r: { status: number; body: any }, oQue: string) => {
    if (r.status >= 300) throw new Error(`${oQue}: HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 400)}`);
    return r.body;
  };
  const rel: Record<string, any> = { cadastro: {}, turnos: {} };

  try {
    // ---------- 1) escola, pelo Painel Master ----------
    const criada = exigir(await chamar("POST", "/master/escolas", {
      nomeFantasia: "Colégio Estadual Simulação Nova", cnpj: "11.222.333/0001-81", cidade: "Curitiba",
      turnosOfertados: ["matutino", "vespertino", "noturno"], direcaoNome: "Direção Simulação", direcaoEmail: "direcao@simulacao.test", incluirMe: false,
    }), "criar escola");
    escola = criada.escola.id;
    rel.cadastro.escola = { id: escola, mensagem: criada.mensagem };

    // ---------- 2) cursos do catalogo SEED-PR ----------
    for (const chave of [CURSO_FUND, CURSO_MEDIO_NOITE]) rel.cadastro[`ofertar ${chave.split(" - ")[0]}${chave.includes("noturno") ? " (noite)" : ""}`] = exigir(await chamar("POST", "/matrizes-oficiais/catalogo-cursos/ofertar", { chave }), `ofertar ${chave}`);
    const matrizes = await q(`select m.id, m.serie_ano, c.nome curso, c.nivel, (select coalesce(sum(i.carga_horaria_semanal), 0)::int from itens_matriz i where i.matriz_curricular_id=m.id) carga,
        (select count(*)::int from itens_matriz i where i.matriz_curricular_id=m.id) itens
      from matrizes_curriculares m join cursos c on c.id=m.curso_id where m.escola_id=$1 order by c.nome, m.serie_ano`, [escola]);
    rel.cadastro.matrizes = matrizes.map((m) => `${m.curso} · ${m.serie_ano}: ${m.itens} disciplinas, ${m.carga} aulas/semana`);
    const matrizDe = (serie: string, noite: boolean) => matrizes.find((m) => m.serie_ano === serie && /noturno/i.test(m.curso) === noite);

    // ---------- 3) turmas, com a matriz aplicada ----------
    const plano: Array<{ nome: string; serie: string; turno: string; noite: boolean }> = [];
    for (const turno of ["matutino", "vespertino"]) for (const [i, serie] of ["6º Ano", "7º Ano", "8º Ano", "9º Ano"].entries()) {
      for (const letra of turno === "matutino" ? ["A", "B"] : ["C", "D"]) plano.push({ nome: `${6 + i}${turno === "matutino" ? "M" : "T"}${letra}`, serie, turno, noite: false });
    }
    for (const [i, serie] of ["1ª Série", "2ª Série", "3ª Série"].entries()) plano.push({ nome: `${i + 1}NA`, serie, turno: "noturno", noite: true });
    const turmas: Array<{ id: number; nome: string; turno: string; carga: number }> = [];
    for (const t of plano) {
      const m = matrizDe(t.serie, t.noite);
      if (!m) throw new Error(`sem matriz para ${t.serie}${t.noite ? " (noite)" : ""}; matrizes: ${rel.cadastro.matrizes.join(" | ")}`);
      const nova = exigir(await chamar("POST", "/turmas", { nome: t.nome, serie: t.serie, turno: t.turno, anoLetivo: 2026 }), `turma ${t.nome}`);
      exigir(await chamar("POST", `/turmas/${nova.id}/aplicar-matriz`, { matrizCurricularId: m.id }), `matriz da ${t.nome}`);
      turmas.push({ id: nova.id, nome: t.nome, turno: t.turno, carga: m.carga });
    }
    const [{ semNivel }] = await q(`select count(*)::int "semNivel" from turmas where escola_id=$1 and nivel_ensino is null`, [escola]);
    rel.cadastro.turmas = `${turmas.length} turmas (${semNivel} sem nível de ensino: a tela de Turmas não pede o nível)`;

    // ---------- 4) esquema de aulas: aulas por dia pela carga da matriz ----------
    // a noite tem 5 aulas presenciais (19h as 22h35); o que passar disso a escola marca como assincrono (passo 9b)
    const aulasPorDia = (turno: string) => turno === "noturno" ? 5 : Math.ceil(Math.max(...turmas.filter((t) => t.turno === turno).map((t) => t.carga)) / 5);
    for (const turno of ["matutino", "vespertino", "noturno"]) {
      const carga = Math.max(...turmas.filter((t) => t.turno === turno).map((t) => t.carga));
      const porDia = aulasPorDia(turno);
      const [h0, m0] = INICIO[turno]!;
      const slots = Array.from({ length: porDia }, (_, i) => {
        const min = h0 * 60 + m0 + i * 50 + (i >= 3 ? 15 : 0); // intervalo de 15 min depois da 3a aula
        return { numeroAula: i + 1, horaInicio: `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`, duracaoMinutos: 50 };
      });
      exigir(await chamar("POST", "/horario-slots/lote", { turno, nivelEnsino: null, slots }), `esquema ${turno}`);
      rel.cadastro[`esquema ${turno}`] = `${porDia} aulas por dia (maior carga das turmas: ${carga}/semana), ${slots[0]!.horaInicio} a ${slots.at(-1)!.horaInicio}`;
    }

    // ---------- 5) professores: por disciplina, ate MAX_AULAS_PROF aulas cada, em turmas do mesmo turno ou vizinho ----------
    const linhas = await q(`select td.id, td.turma_id, td.disciplina_id, td.carga_horaria_semanal_override carga, d.nome disc, t.turno, t.nome turma
      from turma_disciplinas td join turmas t on t.id=td.turma_id join disciplinas d on d.id=td.disciplina_id where t.escola_id=$1
      order by d.nome, case t.turno when 'matutino' then 1 when 'vespertino' then 2 else 3 end, t.nome`, [escola]);
    const porDisc = new Map<number, any[]>();
    for (const l of linhas) { if (!porDisc.has(l.disciplina_id)) porDisc.set(l.disciplina_id, []); porDisc.get(l.disciplina_id)!.push(l); }
    let n = 0;
    const atribuicao = new Map<number, number>(); // linha -> professor
    const professores: Array<{ id: number; nome: string; aulas: number; turnos: Set<string> }> = [];
    for (const [disciplinaId, ls] of porDisc) {
      let atual: (typeof professores)[number] | null = null;
      for (const l of ls) {
        const c = l.carga ?? 0;
        if (!atual || atual.aulas + c > MAX_AULAS_PROF) {
          const nome = `${NOMES[n % NOMES.length]} ${SOBRENOMES[Math.floor(n / NOMES.length) % SOBRENOMES.length]} ${String(n + 1).padStart(2, "0")}`;
          const p = exigir(await chamar("POST", "/professores", { nome, email: `prof${n + 1}@simulacao.test`, disciplinaIds: [disciplinaId] }), `professor ${nome}`);
          n++;
          atual = { id: p.id, nome, aulas: 0, turnos: new Set() };
          professores.push(atual);
        }
        atual.aulas += c;
        atual.turnos.add(l.turno);
        atribuicao.set(l.id, atual.id);
      }
    }
    // ---------- 6) vinculos (professor de cada linha da turma) ----------
    for (const l of linhas) exigir(await chamar("PATCH", `/turmas/${l.turma_id}/disciplinas/linha/${l.id}`, { professorId: atribuicao.get(l.id) }), `vinculo ${l.turma}/${l.disc}`);
    const emDois = professores.filter((p) => p.turnos.size > 1);
    rel.cadastro.professores = `${professores.length} professores, ${linhas.length} vínculos; ${emDois.length} em mais de um turno; ` +
      `aulas por professor: ${Math.min(...professores.map((p) => p.aulas))} a ${Math.max(...professores.map((p) => p.aulas))}`;

    // ---------- 7) disponibilidade: 1 a cada 4 professores nao vem num dia (no turno em que da mais aula) ----------
    const bloqueios: string[] = [];
    for (const [i, p] of professores.entries()) {
      if (i % 4 !== 1) continue;
      const dia = i % 5;
      const itens = [...p.turnos].flatMap((turno) =>
        Array.from({ length: aulasPorDia(turno) }, (_, a) => ({ diaSemana: dia, horarioSlot: a + 1, disponivel: false, motivo: "Simulação: não vem neste dia", turno })));
      exigir(await chamar("POST", "/disponibilidade/lote", { professorId: p.id, itens }), `disponibilidade ${p.nome}`);
      bloqueios.push(`${p.nome} (${p.aulas} aulas): sem ${["segunda", "terça", "quarta", "quinta", "sexta"][dia]}`);
    }
    rel.cadastro.bloqueios = bloqueios;

    // ---------- 8) capacidade antes de gerar (o que a tela de gerar avisa) ----------
    rel.capacidade = (await chamar("GET", "/horarios/capacidade")).body;

    // ---------- 9) gerar, simular e promover cada turno ----------
    // a noite vai duas vezes: como a escola cadastrou (mais aulas que horarios) e depois de marcar o excedente como assincrono
    for (const [passo, turno] of ["matutino", "vespertino", "noturno", "noturno-assincronas"].entries()) {
      if (turno === "noturno-assincronas") {
        const ass: string[] = [];
        for (const t of turmas.filter((x) => x.turno === "noturno")) {
          let excesso = t.carga - 25;
          const ls = (await q(`select td.disciplina_id, td.carga_horaria_semanal_override carga, d.nome from turma_disciplinas td join disciplinas d on d.id=td.disciplina_id
            where td.turma_id=$1 order by td.carga_horaria_semanal_override desc, d.nome`, [t.id]));
          for (let i = 0; excesso > 0 && i < ls.length * 3; i++) { // 1 assincrona por disciplina, das maiores para as menores
            const l = ls[i % ls.length];
            if ((l._ass ?? 0) + 1 >= l.carga) continue;
            l._ass = (l._ass ?? 0) + 1;
            excesso--;
          }
          for (const l of ls.filter((x) => x._ass)) {
            exigir(await chamar("PATCH", `/turmas/${t.id}/disciplinas/${l.disciplina_id}/modalidade`, { aulasAssincronas: l._ass }), `assincrona ${t.nome}/${l.nome}`);
            ass.push(`${t.nome} ${l.nome}: ${l._ass}`);
          }
        }
        rel.cadastro.assincronasNoturno = ass;
      }
      const nome = `Nova-${turno}`;
      const turnoReal = turno.startsWith("noturno") ? "noturno" : turno;
      void passo;
      const inicio = Date.now();
      const r = await chamar("POST", "/horarios/gerar-cpsat-async", { turno: turnoReal, nomeExperimental: nome });
      let st: any = r.body;
      if (r.status === 202) {
        do {
          await new Promise((ok) => setTimeout(ok, 3000));
          st = (await chamar("GET", `/horarios/gerar-cpsat-status/${r.body.jobId}`)).body;
        } while (st.jobStatus === "running" && Date.now() - inicio < 15 * 60_000);
      }
      const t: Record<string, any> = { segundos: Math.round((Date.now() - inicio) / 1000), jobStatus: st?.jobStatus, status: st?.status, erro: st?.error,
        mensagem: typeof st?.mensagem === "string" ? st.mensagem.slice(0, 300) : undefined, diagnostico: st?.diagnostico };
      const [{ aulas }] = await q(`select count(*)::int aulas from horarios_experimentais where escola_id=$1 and nome=$2`, [escola, nome]);
      t.aulasNoExperimento = aulas;
      t.aulasEsperadas = turmas.filter((x) => x.turno === turnoReal).reduce((s, x) => s + x.carga, 0);
      if (aulas > 0) {
        const sim = await chamar("GET", `/horarios/experimentais/${nome}/simulacao`);
        t.simulacao = sim.status === 200 ? { turnos: sim.body.turnos, janelasHoje: sim.body.oficialHoje?.porTurno, janelasDepois: sim.body.experimento?.porTurno, veredito: sim.body.veredito,
          detalhe: sim.body.experimento?.detalhe?.map((d: any) => `${d.professorNome} ${d.dia} (${d.turno}): ${d.janelas} — ${d.dia_detalhe}`) } : { http: sim.status, erro: sim.body };
        const prom = await chamar("POST", `/horarios/experimentais/${nome}/promover`, {});
        t.promover = { http: prom.status, erro: prom.body?.error, avisoHA: prom.body?.avisoHA, haReposicionadas: prom.body?.haReposicionadas };
      }
      rel.turnos[turno] = t;
    }

    // ---------- 10) como a escola ficou ----------
    const { detectarConflitos } = await import("../src/routes/conflitos");
    const conflitos = await detectarConflitos(escola, {});
    const porTipo: Record<string, number> = {};
    for (const c of conflitos) porTipo[`${c.tipo} (${c.gravidade})`] = (porTipo[`${c.tipo} (${c.gravidade})`] ?? 0) + 1;
    rel.final = {
      conflitos: porTipo, exemplos: conflitos.slice(0, 12).map((c) => c.descricao),
      aulasPorTurno: await q(`select t.turno, count(*)::int aulas from horarios h join turmas t on t.id=h.turma_id where h.escola_id=$1 group by 1 order by 1`, [escola]),
      haPorTurno: await q(`select d.turno, count(*)::int ha, count(*) filter (where d.motivo like '%HA*%')::int "haOutroTurno" from disponibilidade_professores d join professores p on p.id=d.professor_id
        where p.escola_id=$1 and d.hora_atividade_obrigatoria group by 1 order by 1`, [escola]),
      haPorProfessor: await q(`select p.nome, (select count(*)::int from horarios h where h.professor_id=p.id) aulas,
          (select count(*)::int from disponibilidade_professores d where d.professor_id=p.id and d.hora_atividade_obrigatoria) ha
        from professores p where p.escola_id=$1 order by 2 desc limit 8`, [escola]),
    };
  } catch (e) {
    rel.ERRO_DO_ROTEIRO = e instanceof Error ? e.stack : String(e);
  } finally {
    console.log("\n@@RELATORIO@@\n" + JSON.stringify(rel, null, 1));
    server.close();
    await pool.end();
  }
}

main();
