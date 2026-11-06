// [BACKUP-GRADE] (21/10/2026) Cópia da grade OFICIAL (aulas + HA) antes de
// mudanças grandes (promover experimento, restaurar cópia), com volta em um
// clique. Regra: um teste promovido por engano sempre tem volta.
// Se a migração da tabela grade_backups ainda não rodou, nada quebra: a cópia
// não é feita e quem chamou recebe um aviso.
import { db, gradeBackupsTable, horariosTable, disponibilidadeTable, professoresTable } from "@workspace/db";
import { and, eq, desc, inArray, notInArray, sql } from "drizzle-orm";
import { voltarChaves, voltarAtribuicoes, type DispAntes, type AtribuicaoAntes } from "./disponibilidade-experimento"; // [DISP-EXPERIMENTAL] [EXPERIMENTO-COMPLETO]

const MANTER_POR_ESCOLA = 10;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface DadosBackup {
  horarios: Array<{
    turmaId: number; disciplinaId: number; professorId: number; diaSemana: number; numeroAula: number;
    sala: string | null; assincrona: boolean; fixa: boolean;
  }>;
  // disponivel=false + HA = HA fixa / probatório (o motor não move); cópias antigas não têm o campo (= true)
  ha: Array<{ professorId: number; turno: string | null; diaSemana: number; horarioSlot: number; motivo: string | null; disponivel?: boolean }>;
  // [DISP-EXPERIMENTAL] (06/11/2026) promocao de experimento com disponibilidade: como estavam as linhas que ele mudou
  disponibilidade?: DispAntes;
  // [EXPERIMENTO-COMPLETO] promocao com atribuicao: o professor que cada disciplina tinha antes
  atribuicao?: AtribuicaoAntes;
}

function tabelaAusente(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string }; message?: string };
  return e?.code === "42P01" || e?.cause?.code === "42P01" || /grade_backups.*does not exist|relation "grade_backups"/i.test(e?.message ?? "");
}

async function lerGradeOficial(escolaId: string): Promise<DadosBackup> {
  const aulas = await db.select().from(horariosTable)
    .where(and(eq(horariosTable.escolaId, escolaId), sql`COALESCE(${horariosTable.versaoGrade}, 'oficial') = 'oficial'`));
  const profIds = (await db.select({ id: professoresTable.id }).from(professoresTable).where(eq(professoresTable.escolaId, escolaId))).map((p) => p.id);
  const ha = profIds.length
    ? await db.select().from(disponibilidadeTable)
      .where(and(inArray(disponibilidadeTable.professorId, profIds), eq(disponibilidadeTable.horaAtividadeObrigatoria, true)))
    : [];
  return {
    horarios: aulas.map((h) => ({
      turmaId: h.turmaId, disciplinaId: h.disciplinaId, professorId: h.professorId, diaSemana: h.diaSemana, numeroAula: h.numeroAula,
      sala: h.sala ?? null, assincrona: !!h.assincrona, fixa: !!h.fixa,
    })),
    ha: ha.map((d) => ({ professorId: d.professorId, turno: d.turno ?? null, diaSemana: d.diaSemana, horarioSlot: d.horarioSlot, motivo: d.motivo ?? null, disponivel: d.disponivel })),
  };
}

/** Guarda a grade oficial atual. Devolve { ok: true, id } ou { ok: false, aviso }. */
export async function salvarBackupGrade(escolaId: string, motivo: string, usuarioNome?: string | null, disponibilidade?: DispAntes, atribuicao?: AtribuicaoAntes):
  Promise<{ ok: true; id: number } | { ok: false; aviso: string }> {
  const dados: DadosBackup = { ...(await lerGradeOficial(escolaId)), ...(disponibilidade ? { disponibilidade } : {}), ...(atribuicao?.length ? { atribuicao } : {}) };
  try {
    const [b] = await db.insert(gradeBackupsTable).values({
      escolaId, motivo, qtdAulas: dados.horarios.length, qtdHa: dados.ha.length, dados, usuarioNome: usuarioNome ?? null,
    }).returning({ id: gradeBackupsTable.id });
    // mantém só as últimas cópias da escola
    const manter = (await db.select({ id: gradeBackupsTable.id }).from(gradeBackupsTable)
      .where(eq(gradeBackupsTable.escolaId, escolaId)).orderBy(desc(gradeBackupsTable.createdAt), desc(gradeBackupsTable.id))
      .limit(MANTER_POR_ESCOLA)).map((r) => r.id);
    if (manter.length) {
      await db.delete(gradeBackupsTable).where(and(eq(gradeBackupsTable.escolaId, escolaId), notInArray(gradeBackupsTable.id, manter)));
    }
    return { ok: true, id: b!.id };
  } catch (err) {
    if (tabelaAusente(err)) return { ok: false, aviso: "Cópia de segurança da grade indisponível (falta rodar a migração grade_backups)." };
    throw err;
  }
}

export async function listarBackupsGrade(escolaId: string) {
  try {
    return await db.select({
      id: gradeBackupsTable.id, motivo: gradeBackupsTable.motivo, qtdAulas: gradeBackupsTable.qtdAulas,
      qtdHa: gradeBackupsTable.qtdHa, usuarioNome: gradeBackupsTable.usuarioNome, createdAt: gradeBackupsTable.createdAt,
    }).from(gradeBackupsTable).where(eq(gradeBackupsTable.escolaId, escolaId)).orderBy(desc(gradeBackupsTable.createdAt), desc(gradeBackupsTable.id));
  } catch (err) {
    if (tabelaAusente(err)) return [];
    throw err;
  }
}

/**
 * Volta a grade oficial (aulas + HA) para a cópia `id`. Antes, guarda a grade
 * atual como nova cópia, para a volta também ter volta.
 */
export async function restaurarBackupGrade(
  escolaId: string, id: number, travar: (tx: Tx) => Promise<void>, usuarioNome?: string | null,
): Promise<{ aulas: number; ha: number; copiaAntesId: number | null } | null> {
  const [b] = await db.select().from(gradeBackupsTable).where(and(eq(gradeBackupsTable.id, id), eq(gradeBackupsTable.escolaId, escolaId)));
  if (!b) return null;
  const dados = b.dados as DadosBackup;
  const quando = b.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const antes = await salvarBackupGrade(escolaId, `Antes de voltar à cópia de ${quando} (${b.motivo})`, usuarioNome);

  const profIds = (await db.select({ id: professoresTable.id }).from(professoresTable).where(eq(professoresTable.escolaId, escolaId))).map((p) => p.id);
  await db.transaction(async (tx) => {
    await travar(tx);
    await tx.delete(horariosTable)
      .where(and(eq(horariosTable.escolaId, escolaId), sql`COALESCE(${horariosTable.versaoGrade}, 'oficial') = 'oficial'`));
    // [DISP-EXPERIMENTAL] antes da HA: a disponibilidade que o experimento promovido mudou volta ao que era
    // (a HA da copia vem depois e tem a palavra final no mesmo horario)
    if (dados.disponibilidade) await voltarChaves(tx, dados.disponibilidade, new Set(profIds));
    if (dados.atribuicao) await voltarAtribuicoes(tx, dados.atribuicao); // [EXPERIMENTO-COMPLETO]
    for (let i = 0; i < dados.horarios.length; i += 500) {
      const lote = dados.horarios.slice(i, i + 500).map((h) => ({ escolaId, ...h, versaoGrade: "oficial" }));
      if (lote.length) await tx.insert(horariosTable).values(lote);
    }
    if (profIds.length) {
      await tx.delete(disponibilidadeTable)
        .where(and(inArray(disponibilidadeTable.professorId, profIds), eq(disponibilidadeTable.horaAtividadeObrigatoria, true)));
    }
    const haValidas = dados.ha.filter((x) => profIds.includes(x.professorId));
    for (let i = 0; i < haValidas.length; i += 500) {
      const lote = haValidas.slice(i, i + 500).map((x) => ({
        professorId: x.professorId, turno: x.turno, diaSemana: x.diaSemana, horarioSlot: x.horarioSlot,
        disponivel: x.disponivel ?? true, horaAtividadeObrigatoria: true, motivo: x.motivo,
      }));
      if (lote.length) {
        // o que existir hoje no mesmo horário (livre/bloqueio criado depois da cópia) dá lugar à HA da cópia
        await tx.delete(disponibilidadeTable).where(sql`(${disponibilidadeTable.professorId}, ${disponibilidadeTable.diaSemana}, ${disponibilidadeTable.horarioSlot}, COALESCE(${disponibilidadeTable.turno}, '')) IN (${sql.join(
          lote.map((x) => sql`(${x.professorId}, ${x.diaSemana}, ${x.horarioSlot}, ${x.turno ?? ""})`), sql`, `)})`);
        await tx.insert(disponibilidadeTable).values(lote);
      }
    }
  });
  return { aulas: dados.horarios.length, ha: dados.ha.length, copiaAntesId: antes.ok ? antes.id : null };
}
