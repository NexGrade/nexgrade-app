// [VIRADA-ANO] (24/10/2026) Virada do ano letivo (plano em claude/plano-virada-ano-letivo.md).
// Regras: as turmas continuam (sao a "vaga" na grade: serie, turno, disciplinas e cargas) e passam
// para o ano seguinte; a escola pode excluir turma que fechou e duplicar turma para abrir mais uma
// da mesma serie. Professores continuam, menos os que a escola marcar como "saiu" (ficam inativos,
// nao sao excluidos). Zeram: grade oficial, experimentos, disponibilidade (bloqueios e HA) e codigos
// SERE. Tudo o que muda ou e apagado vai para o backup em viradas_ano, e "desfazer" volta tudo
// enquanto nenhuma grade do ano novo tiver sido promovida.
// Liberada a partir do fim do 3o trimestre do ano corrente; antes, so se a Nexus Core liberar.
import {
  aulasFixasTable, db, disponibilidadeTable, horariosExperimentaisTable, horariosTable, limitesDiariosProfessorTable,
  professoresTable, trimestresLetivosTable, turmaDisciplinasTable, turmasTable, viradasAnoTable,
} from "@workspace/db";
import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { z } from "zod";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// ------------------------------------------------------------------ regras puras (testadas)

export const PlanoVirada = z.object({
  excluirTurmas: z.array(z.number().int().positive()).default([]),
  duplicarTurmas: z.array(z.object({ origemId: z.number().int().positive(), nome: z.string().trim().min(1).max(30) })).default([]),
  professoresQueSaem: z.array(z.number().int().positive()).default([]),
  confirmacao: z.string().default(""),
});
export type PlanoVirada = z.infer<typeof PlanoVirada>;

export const textoConfirmacao = (anoPara: number) => `VIRAR ${anoPara}`;

/** Erros do plano em portugues (vazio = ok). */
export function validarPlano(
  plano: PlanoVirada,
  turmas: ReadonlyArray<{ id: number; nome: string }>,
  professores: ReadonlyArray<{ id: number }>,
  anoPara: number,
): string[] {
  const erros: string[] = [];
  const idsTurma = new Set(turmas.map((t) => t.id));
  const idsProf = new Set(professores.map((p) => p.id));
  if (plano.confirmacao.trim().toUpperCase() !== textoConfirmacao(anoPara)) erros.push(`Para confirmar, digite ${textoConfirmacao(anoPara)}.`);
  for (const id of plano.excluirTurmas) if (!idsTurma.has(id)) erros.push(`Turma ${id} não é desta escola.`);
  for (const id of plano.professoresQueSaem) if (!idsProf.has(id)) erros.push(`Professor ${id} não é desta escola.`);
  const excluir = new Set(plano.excluirTurmas);
  if (excluir.size === turmas.length && turmas.length > 0 && plano.duplicarTurmas.length === 0) erros.push("A virada não pode excluir todas as turmas.");
  const nomesFinais = new Map<string, number>();
  for (const t of turmas) if (!excluir.has(t.id)) nomesFinais.set(t.nome.trim().toUpperCase(), (nomesFinais.get(t.nome.trim().toUpperCase()) ?? 0) + 1);
  for (const d of plano.duplicarTurmas) {
    if (!idsTurma.has(d.origemId)) { erros.push(`Turma ${d.origemId} (para duplicar) não é desta escola.`); continue; }
    if (excluir.has(d.origemId)) erros.push(`A turma ${turmas.find((t) => t.id === d.origemId)?.nome} está marcada para excluir e para duplicar.`);
    const k = d.nome.trim().toUpperCase();
    nomesFinais.set(k, (nomesFinais.get(k) ?? 0) + 1);
  }
  for (const [nome, n] of nomesFinais) if (n > 1) erros.push(`Haveria ${n} turmas com o nome ${nome}.`);
  return erros;
}

/** A virada pode ser feita hoje? (fim do 3o trimestre ja passou, ou a Nexus Core liberou) */
export function viradaLiberadaPorData(hojeISO: string, fimDoAno: string | null, anoDe: number): boolean {
  return hojeISO >= (fimDoAno ?? `${anoDe}-12-31`);
}

export function hojeEmBrasilia(agora = new Date()): string {
  return agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); // AAAA-MM-DD
}

// ------------------------------------------------------------------ leitura

const ehOficial = sql`COALESCE(${horariosTable.versaoGrade}, 'oficial') = 'oficial'`;

async function idsProfessores(escolaId: string, q: Tx | typeof db = db) {
  return (await q.select({ id: professoresTable.id }).from(professoresTable).where(eq(professoresTable.escolaId, escolaId))).map((p) => p.id);
}

export async function situacaoVirada(escolaId: string, hoje = hojeEmBrasilia()) {
  const turmas = await db.select({ ano: turmasTable.anoLetivo }).from(turmasTable).where(eq(turmasTable.escolaId, escolaId));
  const anoDe = turmas.length ? Math.max(...turmas.map((t) => t.ano)) : Number(hoje.slice(0, 4));
  const anoPara = anoDe + 1;
  const [tri3] = await db.select({ fim: trimestresLetivosTable.dataFim }).from(trimestresLetivosTable)
    .where(and(eq(trimestresLetivosTable.escolaId, escolaId), eq(trimestresLetivosTable.ano, anoDe), eq(trimestresLetivosTable.trimestre, 3)));
  const fimDoAno = tri3?.fim ? String(tri3.fim).slice(0, 10) : null;
  // liberacao antecipada pela Nexus Core (continua valendo mesmo depois de uma virada desfeita)
  const [liberacao] = await db.select({ id: viradasAnoTable.id }).from(viradasAnoTable)
    .where(and(eq(viradasAnoTable.escolaId, escolaId), eq(viradasAnoTable.anoPara, anoPara), eq(viradasAnoTable.status, "liberada"))).limit(1);
  // ja virou para o ano seguinte? (as turmas ja estao no ano novo: o registro e do ano anterior)
  const [jaFeita] = await db.select({ id: viradasAnoTable.id, anoDe: viradasAnoTable.anoDe, anoPara: viradasAnoTable.anoPara, feitaEm: viradasAnoTable.feitaEm, feitaPor: viradasAnoTable.feitaPor, resumo: viradasAnoTable.resumo })
    .from(viradasAnoTable).where(and(eq(viradasAnoTable.escolaId, escolaId), eq(viradasAnoTable.anoPara, anoDe), eq(viradasAnoTable.status, "feita")))
    .orderBy(desc(viradasAnoTable.id)).limit(1);
  const [{ n: aulasOficiais }] = await db.select({ n: sql<number>`count(*)::int` }).from(horariosTable).where(and(eq(horariosTable.escolaId, escolaId), ehOficial));
  const liberadaPeloMaster = !!liberacao;
  const liberada = viradaLiberadaPorData(hoje, fimDoAno, anoDe) || liberadaPeloMaster;
  return {
    anoDe, anoPara, hoje, fimDoAno, liberada, liberadaPeloMaster,
    confirmacao: textoConfirmacao(anoPara),
    // virada mais recente (para o ano em que as turmas estao agora)
    ultimaVirada: jaFeita ? { id: jaFeita.id, anoDe: jaFeita.anoDe, anoPara: jaFeita.anoPara, feitaEm: jaFeita.feitaEm, feitaPor: jaFeita.feitaPor, resumo: jaFeita.resumo } : null,
    podeDesfazer: !!jaFeita && aulasOficiais === 0,
    motivoNaoDesfaz: jaFeita && aulasOficiais > 0 ? `Já existe grade oficial de ${anoDe} (${aulasOficiais} aulas). Desfazer apagaria esse trabalho.` : null,
  };
}

export async function previaVirada(escolaId: string) {
  const situacao = await situacaoVirada(escolaId);
  const turmas = await db.select({ id: turmasTable.id, nome: turmasTable.nome, serie: turmasTable.serie, turno: turmasTable.turno, anoLetivo: turmasTable.anoLetivo, codigoSere: turmasTable.codigoSere })
    .from(turmasTable).where(eq(turmasTable.escolaId, escolaId));
  const ids = turmas.map((t) => t.id);
  const vinc = ids.length ? await db.select({ turmaId: turmaDisciplinasTable.turmaId, professorId: turmaDisciplinasTable.professorId })
    .from(turmaDisciplinasTable).where(inArray(turmaDisciplinasTable.turmaId, ids)) : [];
  const profs = await db.select({ id: professoresTable.id, nome: professoresTable.nome, ativo: professoresTable.ativo })
    .from(professoresTable).where(eq(professoresTable.escolaId, escolaId));
  const aulas = await db.select({ professorId: horariosTable.professorId, n: sql<number>`count(*)::int` }).from(horariosTable)
    .where(and(eq(horariosTable.escolaId, escolaId), ehOficial)).groupBy(horariosTable.professorId);
  const profIds = profs.map((p) => p.id);
  const [{ n: disponibilidade }] = profIds.length
    ? await db.select({ n: sql<number>`count(*)::int` }).from(disponibilidadeTable).where(inArray(disponibilidadeTable.professorId, profIds))
    : [{ n: 0 }];
  const [{ n: experimentos }] = await db.select({ n: sql<number>`count(*)::int` }).from(horariosExperimentaisTable).where(eq(horariosExperimentaisTable.escolaId, escolaId));
  const ordemTurno: Record<string, number> = { matutino: 0, vespertino: 1, noturno: 2 };
  return {
    situacao,
    turmas: turmas
      .map((t) => ({ ...t, disciplinas: vinc.filter((v) => v.turmaId === t.id).length, semProfessor: vinc.filter((v) => v.turmaId === t.id && v.professorId == null).length }))
      .sort((a, b) => (ordemTurno[a.turno] ?? 9) - (ordemTurno[b.turno] ?? 9) || a.serie.localeCompare(b.serie, "pt-BR") || a.nome.localeCompare(b.nome, "pt-BR", { numeric: true })),
    professores: profs
      .map((p) => ({ ...p, aulas: aulas.find((a) => a.professorId === p.id)?.n ?? 0 }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    zera: {
      aulasOficiais: aulas.reduce((s, a) => s + a.n, 0),
      experimentos,
      disponibilidade,
      codigosSere: turmas.filter((t) => t.codigoSere != null).length,
    },
  };
}

// ------------------------------------------------------------------ executar e desfazer

type Backup = {
  versao: 1;
  turmas: Array<Record<string, unknown>>;
  turmaDisciplinas: Array<Record<string, unknown>>;
  horarios: Array<Record<string, unknown>>;
  experimentos: Array<Record<string, unknown>>;
  disponibilidade: Array<Record<string, unknown>>;
  aulasFixas: Array<Record<string, unknown>>;
  limites: Array<Record<string, unknown>>;
  professoresAtivo: Array<{ id: number; ativo: boolean }>;
};

// jsonb devolve datas como texto: volta os campos de data/hora para Date antes de regravar
const CAMPOS_DATA = ["createdAt", "updatedAt"];
function comDatas<T extends Record<string, unknown>>(linhas: T[]): T[] {
  return linhas.map((l) => {
    const r: Record<string, unknown> = { ...l };
    for (const c of CAMPOS_DATA) if (typeof r[c] === "string") r[c] = new Date(r[c] as string);
    return r as T;
  });
}

async function lerBackup(tx: Tx, escolaId: string): Promise<Backup> {
  const turmas = await tx.select().from(turmasTable).where(eq(turmasTable.escolaId, escolaId));
  const ids = turmas.map((t) => t.id);
  const profIds = await idsProfessores(escolaId, tx);
  return {
    versao: 1,
    turmas,
    turmaDisciplinas: ids.length ? await tx.select().from(turmaDisciplinasTable).where(inArray(turmaDisciplinasTable.turmaId, ids)) : [],
    horarios: await tx.select().from(horariosTable).where(and(eq(horariosTable.escolaId, escolaId), ehOficial)),
    experimentos: await tx.select().from(horariosExperimentaisTable).where(eq(horariosExperimentaisTable.escolaId, escolaId)),
    disponibilidade: profIds.length ? await tx.select().from(disponibilidadeTable).where(inArray(disponibilidadeTable.professorId, profIds)) : [],
    aulasFixas: ids.length ? await tx.select().from(aulasFixasTable).where(inArray(aulasFixasTable.turmaId, ids)) : [],
    limites: ids.length ? await tx.select().from(limitesDiariosProfessorTable).where(inArray(limitesDiariosProfessorTable.turmaId, ids)) : [],
    professoresAtivo: (await tx.select({ id: professoresTable.id, ativo: professoresTable.ativo }).from(professoresTable).where(eq(professoresTable.escolaId, escolaId))),
  } as Backup;
}

export async function executarVirada(escolaId: string, planoBruto: unknown, usuarioNome: string | null) {
  const parsed = PlanoVirada.safeParse(planoBruto);
  if (!parsed.success) return { status: 400, body: { error: "Plano da virada incompleto." } } as const;
  const plano = parsed.data;
  const sit = await situacaoVirada(escolaId);
  if (!sit.liberada) return { status: 409, body: { error: `A virada só fica liberada depois do fim do ano letivo (${sit.fimDoAno ?? `31/12/${sit.anoDe}`}). Antes disso, peça à Nexus Core.` } } as const;

  return await db.transaction(async (tx) => {
    // trava a escola contra duas viradas ao mesmo tempo
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"virada-ano:" + escolaId}))`);
    const [jaFeita] = await tx.select({ id: viradasAnoTable.id }).from(viradasAnoTable)
      .where(and(eq(viradasAnoTable.escolaId, escolaId), eq(viradasAnoTable.anoPara, sit.anoPara), eq(viradasAnoTable.status, "feita")));
    if (jaFeita) return { status: 409, body: { error: `A escola já virou para ${sit.anoPara}.` } } as const;

    const turmas = await tx.select({ id: turmasTable.id, nome: turmasTable.nome }).from(turmasTable).where(eq(turmasTable.escolaId, escolaId));
    const profIds = await idsProfessores(escolaId, tx);
    const erros = validarPlano(plano, turmas, profIds.map((id) => ({ id })), sit.anoPara);
    if (erros.length) return { status: 400, body: { error: erros[0], erros } } as const;

    const backup = await lerBackup(tx, escolaId);
    const ids = turmas.map((t) => t.id);
    const ficam = ids.filter((id) => !plano.excluirTurmas.includes(id));

    // 1) grade oficial, experimentos e disponibilidade (bloqueios e HA)
    await tx.delete(horariosTable).where(and(eq(horariosTable.escolaId, escolaId), ehOficial));
    await tx.delete(horariosExperimentaisTable).where(eq(horariosExperimentaisTable.escolaId, escolaId));
    if (profIds.length) await tx.delete(disponibilidadeTable).where(inArray(disponibilidadeTable.professorId, profIds));
    // 2) professores que saem: inativos e fora das disciplinas
    if (plano.professoresQueSaem.length && ids.length) {
      await tx.update(professoresTable).set({ ativo: false }).where(and(eq(professoresTable.escolaId, escolaId), inArray(professoresTable.id, plano.professoresQueSaem)));
      await tx.update(turmaDisciplinasTable).set({ professorId: null }).where(and(inArray(turmaDisciplinasTable.turmaId, ids), inArray(turmaDisciplinasTable.professorId, plano.professoresQueSaem)));
      await tx.update(turmaDisciplinasTable).set({ professorApoioId: null }).where(and(inArray(turmaDisciplinasTable.turmaId, ids), inArray(turmaDisciplinasTable.professorApoioId, plano.professoresQueSaem)));
    }
    // 3) turmas que fecharam (vinculos, aulas fixas e limites vao junto, por cascade; tudo esta no backup)
    if (plano.excluirTurmas.length) await tx.delete(turmasTable).where(and(eq(turmasTable.escolaId, escolaId), inArray(turmasTable.id, plano.excluirTurmas)));
    // 4) turmas que continuam: ano novo, codigos SERE em branco
    if (ficam.length) await tx.update(turmasTable).set({ anoLetivo: sit.anoPara, codigoSere: null, codigoSereIf: null }).where(inArray(turmasTable.id, ficam));
    // 5) turmas novas, copiadas de uma que continua (mesmas disciplinas e cargas, sem professor)
    let criadas = 0;
    for (const d of plano.duplicarTurmas) {
      const origem = backup.turmas.find((t) => t.id === d.origemId) as typeof turmasTable.$inferSelect | undefined;
      if (!origem) continue;
      const [nova] = await tx.insert(turmasTable).values({
        escolaId, nome: d.nome.trim(), serie: origem.serie, turno: origem.turno, nivelEnsino: origem.nivelEnsino,
        anoLetivo: sit.anoPara, fantasma: origem.fantasma, matrizCurricularId: origem.matrizCurricularId,
      }).returning({ id: turmasTable.id });
      const vinc = (backup.turmaDisciplinas as Array<typeof turmaDisciplinasTable.$inferSelect>).filter((v) => v.turmaId === d.origemId);
      if (vinc.length) await tx.insert(turmaDisciplinasTable).values(vinc.map((v) => ({
        turmaId: nova!.id, disciplinaId: v.disciplinaId, professorId: null, professorApoioId: null,
        cargaHorariaSemanalOverride: v.cargaHorariaSemanalOverride, aulasAssincronas: v.aulasAssincronas,
        grupoTrio: v.grupoTrio, trioOrdem: v.trioOrdem, trioInicio: null, maxAulasConsecutivasDia: v.maxAulasConsecutivasDia,
        grupoCompartilhadoId: null, // aula compartilhada entre turmas nao e copiada
      })));
      criadas++;
    }

    const resumo = {
      anoDe: sit.anoDe, anoPara: sit.anoPara,
      turmasContinuam: ficam.length, turmasExcluidas: plano.excluirTurmas.length, turmasCriadas: criadas,
      professoresQueSairam: plano.professoresQueSaem.length,
      aulasApagadas: backup.horarios.length, experimentosApagados: backup.experimentos.length, disponibilidadeApagada: backup.disponibilidade.length,
    };
    await tx.insert(viradasAnoTable).values({
      escolaId, anoDe: sit.anoDe, anoPara: sit.anoPara, status: "feita", backup, resumo, feitaPor: usuarioNome, feitaEm: new Date(),
    });
    return { status: 201, body: { ok: true, resumo } } as const;
  });
}

export async function desfazerVirada(escolaId: string) {
  return await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"virada-ano:" + escolaId}))`);
    const [reg] = await tx.select().from(viradasAnoTable)
      .where(and(eq(viradasAnoTable.escolaId, escolaId), eq(viradasAnoTable.status, "feita")))
      .orderBy(desc(viradasAnoTable.id)).limit(1);
    if (!reg?.backup) return { status: 404, body: { error: "Não há virada para desfazer." } } as const;
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(horariosTable).where(and(eq(horariosTable.escolaId, escolaId), ehOficial));
    if (n > 0) return { status: 409, body: { error: `Já existe grade oficial de ${reg.anoPara} (${n} aulas). Desfazer apagaria esse trabalho.` } } as const;
    const b = reg.backup as Backup;
    const idsBackup = b.turmas.map((t) => Number(t.id));

    // turmas criadas depois da virada saem; as do backup voltam como estavam
    await tx.delete(turmasTable).where(idsBackup.length
      ? and(eq(turmasTable.escolaId, escolaId), notInArray(turmasTable.id, idsBackup))
      : eq(turmasTable.escolaId, escolaId));
    const atuais = new Set((await tx.select({ id: turmasTable.id }).from(turmasTable).where(eq(turmasTable.escolaId, escolaId))).map((t) => t.id));
    for (const t of comDatas(b.turmas) as Array<typeof turmasTable.$inferSelect>) {
      if (atuais.has(t.id)) {
        const { id, ...resto } = t;
        await tx.update(turmasTable).set(resto).where(eq(turmasTable.id, id));
      } else {
        await tx.insert(turmasTable).values(t);
      }
    }
    if (idsBackup.length) {
      await tx.delete(turmaDisciplinasTable).where(inArray(turmaDisciplinasTable.turmaId, idsBackup));
      await tx.delete(aulasFixasTable).where(inArray(aulasFixasTable.turmaId, idsBackup));
      await tx.delete(limitesDiariosProfessorTable).where(inArray(limitesDiariosProfessorTable.turmaId, idsBackup));
    }
    const profIds = await idsProfessores(escolaId, tx);
    if (profIds.length) await tx.delete(disponibilidadeTable).where(inArray(disponibilidadeTable.professorId, profIds));
    await tx.delete(horariosExperimentaisTable).where(eq(horariosExperimentaisTable.escolaId, escolaId));

    const inserir = async (tabela: Parameters<typeof tx.insert>[0], linhas: Array<Record<string, unknown>>) => {
      for (let i = 0; i < linhas.length; i += 500) await tx.insert(tabela).values(comDatas(linhas.slice(i, i + 500)) as never);
    };
    // professor excluido depois da virada: o vinculo volta sem ele; aula, aula fixa, limite e disponibilidade dele nao voltam
    const existe = new Set(profIds);
    const semProf = (id: unknown) => id == null || !existe.has(Number(id));
    await inserir(turmaDisciplinasTable, b.turmaDisciplinas.map((v) => ({
      ...v, professorId: semProf(v.professorId) ? null : v.professorId, professorApoioId: semProf(v.professorApoioId) ? null : v.professorApoioId,
    })));
    await inserir(aulasFixasTable, b.aulasFixas.filter((a) => !semProf(a.professorId)));
    await inserir(limitesDiariosProfessorTable, b.limites.filter((l) => !semProf(l.professorId)));
    await inserir(horariosTable, b.horarios.filter((h) => !semProf(h.professorId)));
    await inserir(horariosExperimentaisTable, b.experimentos);
    await inserir(disponibilidadeTable, b.disponibilidade.filter((d) => !semProf(d.professorId)));
    for (const p of b.professoresAtivo) await tx.update(professoresTable).set({ ativo: p.ativo }).where(and(eq(professoresTable.id, p.id), eq(professoresTable.escolaId, escolaId)));

    // os ids voltaram com o mesmo numero: acerta as sequencias para os proximos cadastros
    for (const tabela of ["turmas", "turma_disciplinas", "horarios", "horarios_experimentais", "disponibilidade_professores", "aulas_fixas", "limites_diarios_professor"]) {
      await tx.execute(sql.raw(`select setval(pg_get_serial_sequence('${tabela}', 'id'), greatest((select coalesce(max(id), 1) from ${tabela}), 1))`));
    }
    await tx.update(viradasAnoTable).set({ status: "desfeita", desfeitaEm: new Date() }).where(eq(viradasAnoTable.id, reg.id));
    return { status: 200, body: { ok: true, anoDe: reg.anoDe, turmas: b.turmas.length, aulas: b.horarios.length, disponibilidade: b.disponibilidade.length } } as const;
  });
}

/** A Nexus Core libera a virada antes do fim do ano letivo (teste ou caso especial). */
export async function liberarViradaAntes(escolaId: string, quem: string | null) {
  const sit = await situacaoVirada(escolaId);
  const [ja] = await db.select({ id: viradasAnoTable.id }).from(viradasAnoTable)
    .where(and(eq(viradasAnoTable.escolaId, escolaId), eq(viradasAnoTable.anoPara, sit.anoPara), inArray(viradasAnoTable.status, ["liberada", "feita"])));
  if (!ja) await db.insert(viradasAnoTable).values({ escolaId, anoDe: sit.anoDe, anoPara: sit.anoPara, status: "liberada", liberadaPor: quem });
  return { anoPara: sit.anoPara };
}
