/**
 * [CAPACIDADE-PROFESSOR] Pre-validacao ANTES de gerar grade.
 * Para cada professor: aulas (mesma carga que o payload do CP-SAT recebe) +
 * HA exigida (mesma formula do recalcular-ha) contra horarios livres
 * (mesma regra de bloqueio, ehBloqueioReal). Nao grava nada.
 * Limite: nao enxerga o limite de HA por dia (so aparece depois de gerar).
 * [CAPACIDADE-NAO-LETIVO] (05/10/2026) periodo nao letivo (noturno 18:00) nao
 * conta para aula, mas conta para HA (mesma regra do recalculo de HA).
 */
import { sobreporExperimento, sobreporAtribuicao } from "./disponibilidade-experimento"; // [DISP-EXPERIMENTAL] [EXPERIMENTO-COMPLETO]
import { horariosTable } from "@workspace/db"; // [COTA-INTEGRAL-TURNO-REAL]
import { mapaIntegralDosSlots, posicaoReal, TURNO_INTEGRAL } from "./turno-integral"; // [COTA-INTEGRAL-TURNO-REAL]
import { db, turmasTable, turmaDisciplinasTable, disciplinasTable, professoresTable, disponibilidadeTable, horarioSlotsTable, professorDisciplinasTable, itensMatrizTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { ehBloqueioReal, ehHaFixa, ehHaProbatorio } from "./bloqueio-real"; // [HA-FIXA] [HA-PROBATORIO-BLOQUEIA]
import { calcularHoraAtividadeTotalPorTurno, ehBloqueioPeriodoNaoLetivo } from "./recalcular-ha";
import { calcularHoraAtividadePorTurno, ehProfessorEstudio, haDevidaPorTurno } from "./hora-atividade"; // [HA-DEVIDA-UMA-CONTA]
import { montarMapaPrincipal, ehSecundario, principalDe } from "./professor-principal"; // [MESMA-PESSOA-HA]
import { ehHAMovel, ehHAManualDaTela, ehFORContaComoHA } from "./ha-contraturno"; // [COTA-COM-HA-CONTRATURNO] [FOR-CONTA-COMO-HA]

export interface ProblemaCapacidade {
  professorId: number;
  professor: string;
  nivel: "erro" | "aviso" | "ok"; // "ok" so com a opcao incluirOk
  mensagem: string;
  aulasPorTurno: Record<string, number>;
  aulasTotal: number;
  haExigida: number;
  livresPorTurno: Record<string, number>;
  // [CONTA-NA-HORA] com turnoFiltro: a conta desse turno
  turno?: string;
  livresComHA?: number;
}

export type OpcoesCapacidade = {
  professorId?: number; // so este professor
  incluirOk?: boolean; // com turnoFiltro, devolve tambem o turno em que cabe (nivel "ok"), com os numeros
  dados?: Awaited<ReturnType<typeof calcularCargaPorProfessor>>; // ja carregados (evita ler o banco de novo)
};

export interface CargaProfessor {
  professorId: number;
  professor: string;
  aulasPorTurno: Record<string, number>;
  // [CAPACIDADE-POR-NIVEL] turno -> nivel de ensino da turma ("__sem_nivel__" sem nivel) -> aulas
  aulasPorTurnoNivel?: Record<string, Record<string, number>>;
  // [PAEE-SEM-HA] aulas que contam na tabela de HA (sem as de PAEE / disciplina "sem turma")
  aulasPorTurnoHA?: Record<string, number>;
}

// [CARGA-PROFESSOR] Aulas de cada professor por turno, pela MESMA regra de
// carga do payload do CP-SAT (override -> matriz -> padrao da disciplina).
// Fonte unica usada pela validacao de capacidade e pela cota de HA do motor.
export async function calcularCargaPorProfessor(escolaId: string): Promise<{ cargas: CargaProfessor[]; slots: (typeof horarioSlotsTable.$inferSelect)[]; disp: (typeof disponibilidadeTable.$inferSelect)[]; principal: Map<number, number> }> {
  const turmas = await db.select().from(turmasTable).where(and(eq(turmasTable.escolaId, escolaId), eq(turmasTable.fantasma, false)));
  if (turmas.length === 0) return { cargas: [], slots: [], disp: [], principal: new Map() };
  const turmaIds = turmas.map((t) => t.id);
  const matrizIds = [...new Set(turmas.map((t) => t.matrizCurricularId).filter((id): id is number => id != null))];
  const [tds, disciplinas, professores, profDiscs, itensMatriz, slots] = await Promise.all([
    db.select().from(turmaDisciplinasTable).where(inArray(turmaDisciplinasTable.turmaId, turmaIds)).then((r) => sobreporAtribuicao(r)), // [EXPERIMENTO-COMPLETO]
    db.select().from(disciplinasTable).where(eq(disciplinasTable.escolaId, escolaId)),
    db.select().from(professoresTable).where(eq(professoresTable.escolaId, escolaId)),
    db.select().from(professorDisciplinasTable),
    matrizIds.length > 0 ? db.select().from(itensMatrizTable).where(inArray(itensMatrizTable.matrizCurricularId, matrizIds)) : Promise.resolve([]),
    db.select().from(horarioSlotsTable).where(eq(horarioSlotsTable.escolaId, escolaId)),
  ]);
  const profIds = professores.map((p) => p.id);
  const disp = profIds.length > 0
    ? await db.select().from(disponibilidadeTable).where(inArray(disponibilidadeTable.professorId, profIds))
      .then((r) => sobreporExperimento(r, (d) => profIds.includes(d.professorId))) // [DISP-EXPERIMENTAL]
    : [];

  const turmaMap = new Map(turmas.map((t) => [t.id, t]));
  const discMap = new Map(disciplinas.map((d) => [d.id, d]));
  const profMap = new Map(professores.map((p) => [p.id, p]));
  const itemMap = new Map(itensMatriz.map((im) => [`${im.matrizCurricularId}-${im.disciplinaId}`, im]));

  // mesma regra do resolverProfessor do payload do CP-SAT (horarios.ts)
  const resolverProfessor = (td: (typeof tds)[number], turma: (typeof turmas)[number]) => {
    if (td.professorId != null) return profMap.get(td.professorId) ?? null;
    const candidatos = profDiscs
      .filter((pd) => pd.disciplinaId === td.disciplinaId)
      .map((pd) => profMap.get(pd.professorId))
      .filter((p): p is NonNullable<typeof p> => p != null);
    return candidatos.find((p) => p.nome.includes(`(${turma.nome})`)) ?? null;
  };

  const aulas = new Map<number, Record<string, number>>();
  const aulasNivel = new Map<number, Record<string, Record<string, number>>>(); // [CAPACIDADE-POR-NIVEL]
  const aulasHA = new Map<number, Record<string, number>>(); // [PAEE-SEM-HA]
  for (const td of tds) {
    const turma = turmaMap.get(td.turmaId);
    if (!turma) continue;
    const prof = resolverProfessor(td, turma);
    if (!prof) continue;
    const disc = discMap.get(td.disciplinaId);
    const n = td.cargaHorariaSemanalOverride ?? itemMap.get(`${turma.matrizCurricularId}-${td.disciplinaId}`)?.cargaHorariaSemanal ?? disc?.cargaSemanal ?? 0;
    if (!n || n <= 0) continue;
    const r = aulas.get(prof.id) ?? {};
    r[turma.turno] = (r[turma.turno] ?? 0) + n;
    aulas.set(prof.id, r);
    const rh = aulasHA.get(prof.id) ?? {}; // [PAEE-SEM-HA] PAEE nao conta na tabela de HA (decisao da dona, 04/11/2026)
    rh[turma.turno] = (rh[turma.turno] ?? 0) + (disc?.semTurma ? 0 : n);
    aulasHA.set(prof.id, rh);
    const rn = aulasNivel.get(prof.id) ?? {};
    const nivel = turma.nivelEnsino ?? "__sem_nivel__";
    rn[turma.turno] = { ...rn[turma.turno], [nivel]: (rn[turma.turno]?.[nivel] ?? 0) + n };
    aulasNivel.set(prof.id, rn);
  }

  const cargas: CargaProfessor[] = [];
  for (const [pid, porTurno] of aulas) {
    const p = profMap.get(pid);
    if (p) cargas.push({ professorId: pid, professor: p.nome, aulasPorTurno: porTurno, aulasPorTurnoNivel: aulasNivel.get(pid), aulasPorTurnoHA: aulasHA.get(pid) });
  }
  return { cargas, slots, disp, principal: montarMapaPrincipal(professores) };
}

// [MESMA-PESSOA-HA] aulas por turno usadas para a HA: o principal soma as aulas
// dos cadastros ligados a ele; o secundario nao entra (nao recebe HA).
function aulasParaHA(cargas: CargaProfessor[], principal: Map<number, number>): Map<number, Record<string, number>> {
  const r = new Map<number, Record<string, number>>();
  for (const c of cargas) {
    const alvo = principalDe(principal, c.professorId);
    const acc = r.get(alvo) ?? {};
    for (const [t, n] of Object.entries(c.aulasPorTurnoHA ?? c.aulasPorTurno)) acc[t] = (acc[t] ?? 0) + n; // [PAEE-SEM-HA]
    r.set(alvo, acc);
  }
  return r;
}

// [COTA-INTEGRAL-TURNO-REAL] (04/11/2026) a turma integral entrava como um turno a parte ("integral") e a HA dela nao
// somava no turno real; o recalculo conta cada aula da integral no turno real (manha ou tarde). Ex.: Carlos Farias,
// 8 aulas de manha + 3 da integral de manha = 11 -> 4 HA; a cota dizia 2. Usa a posicao das aulas da integral na
// grade oficial (como o recalculo); sem grade oficial da integral, a parte dela fica de fora. Altera porTurnoHA.
async function projetarIntegralNaContaDeHA(escolaId: string, porTurnoHA: Map<number, Record<string, number>>, slots: (typeof horarioSlotsTable.$inferSelect)[], principal: Map<number, number>): Promise<void> {
  if (![...porTurnoHA.values()].some((r) => (r[TURNO_INTEGRAL] ?? 0) > 0)) return;
  const turmasEsc = await db.select({ id: turmasTable.id, turno: turmasTable.turno }).from(turmasTable).where(eq(turmasTable.escolaId, escolaId));
  const idsIntegral = turmasEsc.filter((t) => t.turno === TURNO_INTEGRAL).map((t) => t.id);
  const turnoDaTurma = new Map(turmasEsc.map((t) => [t.id, t.turno]));
  const mapa = mapaIntegralDosSlots(slots);
  const real = new Map<number, Record<string, number>>();
  if (idsIntegral.length) {
    const aulasInt = await db.select({ professorId: horariosTable.professorId, turmaId: horariosTable.turmaId, numeroAula: horariosTable.numeroAula, versao: horariosTable.versaoGrade, disciplinaId: horariosTable.disciplinaId })
      .from(horariosTable).where(inArray(horariosTable.turmaId, idsIntegral));
    const semHA = new Set((await db.select({ id: disciplinasTable.id }).from(disciplinasTable).where(and(eq(disciplinasTable.escolaId, escolaId), eq(disciplinasTable.semTurma, true)))).map((d) => d.id)); // [PAEE-SEM-HA]
    for (const a of aulasInt) {
      if (a.professorId == null || (a.versao ?? "oficial") !== "oficial") continue;
      if (semHA.has(a.disciplinaId)) continue; // [PAEE-SEM-HA]
      const pos = posicaoReal(a.turmaId, a.numeroAula, turnoDaTurma, mapa);
      if (!pos || pos.turno === TURNO_INTEGRAL) continue;
      const alvo = principalDe(principal, a.professorId);
      const r = real.get(alvo) ?? {};
      r[pos.turno] = (r[pos.turno] ?? 0) + 1;
      real.set(alvo, r);
    }
  }
  for (const [pid, r] of porTurnoHA) {
    if (!(r[TURNO_INTEGRAL] ?? 0)) continue;
    const novo: Record<string, number> = { ...r };
    delete novo[TURNO_INTEGRAL];
    for (const [t, n] of Object.entries(real.get(pid) ?? {})) novo[t] = (novo[t] ?? 0) + n;
    porTurnoHA.set(pid, novo);
  }
}

// [HA-DEVIDA-UMA-CONTA] HA que o recalculo preserva (nao movel, ou manual da tela): conta no total do professor
// [FOR-CONTA-COMO-HA] o FOR tambem conta como HA ja cumprida (fica no lugar)
function haPresasDe(disp: Array<{ professorId: number; turno: string | null; horaAtividadeObrigatoria: boolean; disponivel: boolean; motivo: string | null }>, profId: number) {
  return disp.filter((d) => d.professorId === profId && ((d.horaAtividadeObrigatoria && (!ehHAMovel(d.motivo) || ehHAManualDaTela(d.motivo))) || ehFORContaComoHA(d)));
}
function forNoTurno(disp: Array<{ professorId: number; turno: string | null; horaAtividadeObrigatoria: boolean; disponivel: boolean; motivo: string | null }>, profId: number, turno: string) {
  return disp.filter((d) => d.professorId === profId && d.turno === turno && ehFORContaComoHA(d)).length;
}

// [HA-NO-CPSAT] Cota de HA de cada professor NUM turno (nome -> HA), pela
// mesma divisao proporcional do recalculo. Vai no payload do CP-SAT.
export async function calcularCotaHaPorTurno(escolaId: string, turno: string): Promise<Record<string, number>> {
  const { cargas, disp, principal, slots } = await calcularCargaPorProfessor(escolaId);
  const porTurnoHA = aulasParaHA(cargas, principal); // [MESMA-PESSOA-HA]
  await projetarIntegralNaContaDeHA(escolaId, porTurnoHA, slots, principal); // [COTA-INTEGRAL-TURNO-REAL]
  // [HA-FIXA] HA fixa ja ocupa o horario (o motor a ve como bloqueio):
  // desconta da cota para o motor nao reservar espaco em dobro.
  const fixasPorProfessor = new Map<number, number>();
  for (const d of disp) if (d.turno === turno && (ehHaFixa(d) || ehHaProbatorio(d) || ehFORContaComoHA(d))) fixasPorProfessor.set(d.professorId, (fixasPorProfessor.get(d.professorId) ?? 0) + 1);
  // [COTA-COM-HA-CONTRATURNO] [HA-DEVIDA-UMA-CONTA] mesma conta do recalculo: HA presa em turno sem aula sai do turno com
  // mais HA (Alexandre Moreira, 04/11: tela 0 janela, simulacao 1)
  const r: Record<string, number> = {};
  for (const c of cargas) {
    if (ehSecundario(principal, c.professorId)) continue; // [MESMA-PESSOA-HA]
    if (ehProfessorEstudio(c.professor)) continue; // [ESTUDIO-SEM-HA]
    const aulasHA = porTurnoHA.get(c.professorId) ?? c.aulasPorTurnoHA ?? c.aulasPorTurno; // [PAEE-SEM-HA]
    const porTurno = haDevidaPorTurno(aulasHA, haPresasDe(disp, c.professorId)).porTurno;
    const cota = Math.max(0, (porTurno[turno] ?? 0) - (fixasPorProfessor.get(c.professorId) ?? 0));
    if (cota > 0) r[c.professor] = cota;
  }
  return r;
}

// [CAPACIDADE-POR-TURNO] (16/10/2026) com `turnoFiltro`, so os professores com aula nesse turno, e a conta
// (aulas + HA desse turno x horarios livres desse turno) so desse turno -- e o que a tela de gerar mostra.
export async function validarCapacidadeProfessores(escolaId: string, turnoFiltro?: string, opcoes: OpcoesCapacidade = {}): Promise<ProblemaCapacidade[]> {
  const { cargas, slots, disp, principal } = opcoes.dados ?? await calcularCargaPorProfessor(escolaId);
  const porTurnoHA = aulasParaHA(cargas, principal); // [MESMA-PESSOA-HA]
  await projetarIntegralNaContaDeHA(escolaId, porTurnoHA, slots, principal); // [COTA-INTEGRAL-TURNO-REAL] [HA-DEVIDA-UMA-CONTA]
  const haDevida = (pid: number, porTurnoAulas: Record<string, number>) => haDevidaPorTurno(porTurnoHA.get(pid) ?? porTurnoAulas, haPresasDe(disp, pid)); // [HA-DEVIDA-UMA-CONTA]
  const aulas = new Map(cargas.map((c) => [c.professorId, c.aulasPorTurno]));
  const profMap = new Map(cargas.map((c) => [c.professorId, { nome: c.professor }]));

  const maxAulaTurno = new Map<string, number>();
  for (const s of slots) {
    if (!s.letivo) continue;
    if (s.numeroAula > (maxAulaTurno.get(s.turno) ?? 0)) maxAulaTurno.set(s.turno, s.numeroAula);
  }
  const turnos = [...maxAulaTurno.keys()];
  // [CAPACIDADE-POR-NIVEL] (03/11/2026) ultima aula de cada nivel no turno (Fundamental vai ate a 5a no matutino),
  // mesma regra do ultimaAulaTurma do payload do motor. Antes a conta usava a ultima aula do turno para todos, e
  // o professor so do Fundamental com 16 aulas em 15 horarios aparecia como "cabe".
  const maxAulaNivel = new Map<string, number>();
  for (const s of slots) {
    if (!s.letivo) continue;
    const k = `${s.turno}|${s.nivelEnsino ?? "__sem_nivel__"}`;
    if (s.numeroAula > (maxAulaNivel.get(k) ?? 0)) maxAulaNivel.set(k, s.numeroAula);
  }
  const NOME_NIVEL: Record<string, string> = { fundamental: "do Fundamental", medio_tecnico: "do Médio/Técnico" };
  // [CAPACIDADE-NAO-LETIVO] periodos nao letivos de cada turno (ex.: noturno aula 1, 18:00)
  const naoLetivos = new Map<string, Set<number>>();
  for (const s of slots) {
    if (s.letivo !== false || !s.turno) continue;
    if (!naoLetivos.has(s.turno)) naoLetivos.set(s.turno, new Set());
    naoLetivos.get(s.turno)!.add(s.numeroAula);
  }

  const problemas: ProblemaCapacidade[] = [];
  for (const [pid, porTurno] of aulas) {
    const p = profMap.get(pid);
    if (!p) continue;
    if (opcoes.professorId != null && pid !== opcoes.professorId) continue; // [CONTA-NA-HORA]
    const bloqueados = new Map<string, Set<string>>();
    for (const d of disp) {
      if (d.professorId !== pid || !ehBloqueioReal(d)) continue;
      const alvos = d.turno == null ? turnos : [d.turno];
      for (const t of alvos) {
        if (!bloqueados.has(t)) bloqueados.set(t, new Set());
        bloqueados.get(t)!.add(`${d.diaSemana}-${d.horarioSlot}`);
      }
    }
    // [CAPACIDADE-NAO-LETIVO] bloqueio automatico do periodo nao letivo so impede aula
    const bloqueioSoDeAula = new Set<string>();
    for (const d of disp) if (d.professorId === pid && d.turno && ehBloqueioReal(d) && ehBloqueioPeriodoNaoLetivo(d.motivo)) bloqueioSoDeAula.add(`${d.turno}|${d.diaSemana}-${d.horarioSlot}`);
    const livres: Record<string, number> = {}; // horarios livres para AULA (so periodo letivo)
    const livresSoHA: Record<string, number> = {}; // periodo nao letivo livre: so HA, e so em dia com horario de aula livre
    for (const t of turnos) {
      const mx = maxAulaTurno.get(t) ?? 0;
      const nl = naoLetivos.get(t) ?? new Set<number>();
      let n = 0;
      let soHA = 0;
      for (let dia = 0; dia < 5; dia++) {
        let livresNoDia = 0;
        for (let a = 1; a <= mx; a++) if (!nl.has(a) && !bloqueados.get(t)?.has(`${dia}-${a}`)) livresNoDia++;
        n += livresNoDia;
        // [HA-1800-DIA-COM-AULA] so o periodo nao letivo ANTES da ultima aula (18:00) recebe HA, como no recalculo; o de
        // depois da ultima aula (7a da manha, so da assincrona) nunca recebe
        if (livresNoDia > 0) for (const a of nl) if (a <= mx && (!bloqueados.get(t)?.has(`${dia}-${a}`) || bloqueioSoDeAula.has(`${t}|${dia}-${a}`))) soHA++;
      }
      livres[t] = n;
      livresSoHA[t] = soHA;
    }
    // [CAPACIDADE-POR-NIVEL] as aulas das turmas que terminam antes cabem nos horarios livres ATE a ultima aula delas?
    const porNivel = cargas.find((c) => c.professorId === pid)?.aulasPorTurnoNivel ?? {};
    const faltaAteUltimaAula = (t: string): string | null => {
      const mx = maxAulaTurno.get(t) ?? 0;
      const nl = naoLetivos.get(t) ?? new Set<number>();
      const limiteDe = (nivel: string) => Math.min(mx, maxAulaNivel.get(`${t}|${nivel}`) ?? mx);
      const niveis = Object.keys(porNivel[t] ?? {});
      for (const limite of [...new Set(niveis.map(limiteDe))].sort((a, b) => a - b)) {
        if (limite >= mx) continue;
        const dosNiveis = niveis.filter((n) => limiteDe(n) <= limite);
        const aulasAte = dosNiveis.reduce((s, n) => s + (porNivel[t]![n] ?? 0), 0);
        let livresAte = 0;
        for (let dia = 0; dia < 5; dia++) for (let a = 1; a <= limite; a++) if (!nl.has(a) && !bloqueados.get(t)?.has(`${dia}-${a}`)) livresAte++;
        if (aulasAte > livresAte) {
          const nomeNivel = dosNiveis.map((n) => NOME_NIVEL[n] ?? "").filter(Boolean).join(" e ") || "das turmas que terminam antes";
          return `${aulasAte} aula(s) ${nomeNivel}, que vão até a ${limite}ª aula, mas só ${livresAte} horário(s) livre(s) até a ${limite}ª aula nesse turno: a grade não fecha. Libere ${aulasAte - livresAte} horário(s) ou reduza a carga.`;
        }
      }
      return null;
    };
    const aulasTotal = Object.values(porTurno).reduce((s, n) => s + n, 0);
    // [MESMA-PESSOA-HA] secundario nao tem HA; principal usa o total da pessoa
    const ha = (ehSecundario(principal, pid) || ehProfessorEstudio(p.nome)) ? 0 : (() => { const d = haDevida(pid, porTurno); return [...Object.values(d.porTurno), ...Object.values(d.contraturno)].reduce((x, y) => x + y, 0); })(); // [HA-POR-TURNO] [HA-DEVIDA-UMA-CONTA]
    const turnosEnsino = Object.keys(porTurno);
    const livresEnsino = turnosEnsino.reduce((s, t) => s + (livres[t] ?? 0) + (livresSoHA[t] ?? 0), 0); // [CAPACIDADE-NAO-LETIVO]
    const livresTotal = turnos.reduce((s, t) => s + (livres[t] ?? 0) + (livresSoHA[t] ?? 0), 0);
    const base = { professorId: pid, professor: p.nome, aulasPorTurno: porTurno, aulasTotal, haExigida: ha, livresPorTurno: livres };
    if (turnoFiltro) { // [CAPACIDADE-POR-TURNO]
      const aulasT = porTurno[turnoFiltro] ?? 0;
      if (aulasT === 0) continue;
      // [FOR-CONTA-COMO-HA] o FOR ja cumpre parte da HA e ja ocupa o horario (fica fora dos livres): sai do que falta encaixar
      const haT = (ehSecundario(principal, pid) || ehProfessorEstudio(p.nome)) ? 0 : Math.max(0, (haDevida(pid, porTurno).porTurno[turnoFiltro] ?? 0) - forNoTurno(disp, pid, turnoFiltro)); // [HA-DEVIDA-UMA-CONTA]
      const livresT = livres[turnoFiltro] ?? 0;
      const livresComHA = livresT + (livresSoHA[turnoFiltro] ?? 0);
      const nomeT = ({ matutino: "manhã", vespertino: "tarde", noturno: "noite" } as Record<string, string>)[turnoFiltro] ?? turnoFiltro;
      const baseT = { ...base, aulasTotal: aulasT, haExigida: haT, turno: turnoFiltro, livresComHA }; // [CONTA-NA-HORA]
      const faltaNivel = aulasT <= livresT ? faltaAteUltimaAula(turnoFiltro) : null; // [CAPACIDADE-POR-NIVEL]
      if (faltaNivel) {
        problemas.push({ ...baseT, nivel: "erro", mensagem: faltaNivel });
      } else if (aulasT <= livresT && aulasT + haT <= livresComHA) {
        // [CONTA-NA-HORA] cabe: so entra com incluirOk (tela de Disponibilidade mostra a conta mesmo quando esta certa)
        if (opcoes.incluirOk) problemas.push({ ...baseT, nivel: "ok", mensagem: `${aulasT} aula(s) + ${haT} HA na ${nomeT} e ${livresComHA} horário(s) livre(s): cabe, com ${livresComHA - aulasT - haT} de folga.` });
      } else if (aulasT > livresT) {
        problemas.push({ ...baseT, nivel: "erro", mensagem: `${aulasT} aula(s) na ${nomeT}, mas só ${livresT} horário(s) livre(s) nesse turno: a grade não fecha. Libere ${aulasT - livresT} horário(s) ou reduza a carga.` });
      } else if (aulasT + haT > livresComHA) {
        // [CAPACIDADE-HA-OUTRO-TURNO] o que nao cabe vai para outro turno como HA* -- se houver espaco la.
        // Diurno nunca vai para a noite (HA-NUNCA-NOITE); a noite pode ir para o diurno.
        const sobra = aulasT + haT - livresComHA;
        const haPorTurno = (ehSecundario(principal, pid) || ehProfessorEstudio(p.nome)) ? {} : haDevida(pid, porTurno).porTurno; // [HA-DEVIDA-UMA-CONTA]
        // ordem igual a do recalculo: primeiro outro turno em que ele da aula, depois o turno vizinho
        const VIZINHO: Record<string, string[]> = { matutino: ["vespertino"], vespertino: ["matutino"], noturno: ["vespertino", "matutino"] };
        const destinos = turnos
          .filter((t) => t !== turnoFiltro && (turnoFiltro === "noturno" || t !== "noturno"))
          .sort((a, b) => ((porTurno[b] ?? 0) > 0 ? 1 : 0) - ((porTurno[a] ?? 0) > 0 ? 1 : 0) || (VIZINHO[turnoFiltro]?.indexOf(a) ?? 9) - (VIZINHO[turnoFiltro]?.indexOf(b) ?? 9));
        let cabeFora = 0;
        const destinosUsados: string[] = [];
        for (const t of destinos) {
          const espaco = (livres[t] ?? 0) + (livresSoHA[t] ?? 0) - (porTurno[t] ?? 0) - (haPorTurno[t] ?? 0);
          if (espaco > 0 && cabeFora < sobra) { cabeFora += Math.min(espaco, sobra - cabeFora); destinosUsados.push(({ matutino: "manhã", vespertino: "tarde", noturno: "noite" } as Record<string, string>)[t] ?? t); }
        }
        const falta = sobra - cabeFora;
        const destinoTxt = destinosUsados.length ? destinosUsados.join(" e ") : "outro turno";
        const pl = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
        const vai = (n: number) => (n === 1 ? "vai" : "vão");
        const conta = `${pl(aulasT, "aula", "aulas")} + ${haT} HA na ${nomeT} e ${pl(livresComHA, "horário livre", "horários livres")}`;
        if (falta <= 0) {
          problemas.push({ ...baseT, nivel: "aviso", mensagem: `${conta}: ${sobra} HA ${vai(sobra)} para a ${destinoTxt} (HA*).` });
        } else {
          problemas.push({ ...baseT, nivel: "erro", mensagem: `Falta HA: ${conta}${cabeFora > 0 ? `; ${cabeFora} HA ${vai(cabeFora)} para a ${destinoTxt} (HA*)` : ""}; ${falta} HA ${falta === 1 ? "fica" : "ficam"} sem horário disponível em nenhum turno.` });
        }
      }
      continue;
    }
    for (const t of turnosEnsino) {
      const l = livres[t] ?? 0;
      if (porTurno[t]! > l) problemas.push({ ...base, nivel: "erro", mensagem: `${porTurno[t]} aula(s) no ${t}, mas so ${l} horario(s) livre(s) nesse turno: a grade nao fecha. Libere ${porTurno[t]! - l} horario(s) ou reduza a carga.` });
      else {
        const faltaNivel = faltaAteUltimaAula(t); // [CAPACIDADE-POR-NIVEL]
        if (faltaNivel) problemas.push({ ...base, nivel: "erro", mensagem: `No ${t}: ${faltaNivel}` });
      }
    }
    const precisa = aulasTotal + ha;
    if (precisa > livresTotal) {
      problemas.push({ ...base, nivel: "erro", mensagem: `Precisa de ${precisa} horarios (${aulasTotal} aulas + ${ha} HA), mas so tem ${livresTotal} livres em todos os turnos: faltam ${precisa - livresTotal}. A HA vai ficar incompleta.` });
    } else if (precisa > livresEnsino) {
      problemas.push({ ...base, nivel: "aviso", mensagem: `Cabe, mas so usando contraturno: cerca de ${precisa - livresEnsino} HA fora dos turnos de ensino.` });
    }
  }
  return problemas.sort((a, b) => (a.nivel === b.nivel ? a.professor.localeCompare(b.professor) : a.nivel === "erro" ? -1 : 1));
}

// [CONTA-NA-HORA] (01/11/2026) A conta de UM professor, turno a turno (so os turnos em que ele da aula), para a tela
// de Disponibilidade mostrar a cada bloqueio se ele ainda cabe. Mesma regra da tela de gerar; le o banco uma vez.
export async function capacidadeDoProfessor(escolaId: string, professorId: number): Promise<ProblemaCapacidade[]> {
  const dados = await calcularCargaPorProfessor(escolaId);
  const carga = dados.cargas.find((c) => c.professorId === professorId);
  if (!carga) return [];
  const ordem = ["matutino", "vespertino", "noturno"];
  const turnos = Object.entries(carga.aulasPorTurno).filter(([, n]) => n > 0).map(([t]) => t)
    .sort((a, b) => ordem.indexOf(a) - ordem.indexOf(b));
  const porTurno = await Promise.all(turnos.map((t) => validarCapacidadeProfessores(escolaId, t, { professorId, incluirOk: true, dados })));
  return porTurno.flat();
}
