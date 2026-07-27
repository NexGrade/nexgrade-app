// Diagnóstico de Hora-Atividade: usa a MESMA fórmula oficial já
// validada no sistema (artifacts/api-server/src/lib/hora-atividade.ts,
// tabela SEED-PR exata) pra calcular quanto HA cada professor precisa,
// baseado nas aulas REAIS que ele tem agora (grade já sincronizada com
// o PDF 27/07-31/07). Compara com o que está marcado no banco.
//
// Só LÊ o banco -- não grava nada.
//
// Como rodar:
//   npx tsx scripts/diagnostico-ha.ts

import { db } from "@workspace/db";
import {
  professoresTable,
  turmasTable,
  horariosTable,
  disponibilidadeTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

// ── mesma tabela oficial SEED-PR, copiada de hora-atividade.ts ──
const TABELA_OFICIAL_HA: readonly number[] = [
  0,
  0, 0, 1, 1, 2, 2, 2, 2, 3, 3,
  4, 4, 4, 4, 5, 5, 5, 6, 6, 6,
  7, 7, 7, 8, 8, 8, 9, 9, 10, 10,
];

function calcularHoraAtividadeInstitucional(aulasNoTurno: number): number {
  if (!aulasNoTurno || aulasNoTurno <= 0) return 0;
  if (aulasNoTurno <= 30) return TABELA_OFICIAL_HA[Math.round(aulasNoTurno)]!;
  return Math.ceil(aulasNoTurno / 3);
}

function calcularHoraAtividadePorTurno(aulasPorTurno: Record<string, number>): Record<string, number> {
  const turnos = Object.keys(aulasPorTurno);
  const totalAulas = turnos.reduce((soma, t) => soma + (aulasPorTurno[t] || 0), 0);
  if (totalAulas <= 0) {
    const zeros: Record<string, number> = {};
    turnos.forEach((t) => (zeros[t] = 0));
    return zeros;
  }
  const exigidoTotal = calcularHoraAtividadeInstitucional(totalAulas);
  const partes = turnos.map((turno) => {
    const aulas = aulasPorTurno[turno] || 0;
    const proporcional = (aulas / totalAulas) * exigidoTotal;
    return { turno, base: Math.floor(proporcional), resto: proporcional - Math.floor(proporcional) };
  });
  let alocado = partes.reduce((soma, p) => soma + p.base, 0);
  let faltam = exigidoTotal - alocado;
  const ordenadoPorResto = [...partes].sort((a, b) => b.resto - a.resto);
  for (let i = 0; i < ordenadoPorResto.length && faltam > 0; i++) {
    ordenadoPorResto[i]!.base += 1;
    faltam--;
  }
  const resultado: Record<string, number> = {};
  partes.forEach((p) => (resultado[p.turno] = p.base));
  return resultado;
}

async function main() {
  const escolaId = "escola_default";

  const [professores, turmas, horarios, disponibilidades] = await Promise.all([
    db.select().from(professoresTable).where(eq(professoresTable.escolaId, escolaId)),
    db.select().from(turmasTable).where(eq(turmasTable.escolaId, escolaId)),
    db.select().from(horariosTable).where(eq(horariosTable.escolaId, escolaId)),
    db.select().from(disponibilidadeTable),
  ]);

  const turmaMap = new Map(turmas.map((t) => [t.id, t]));

  // aulas reais por professor+turno (grade ja sincronizada, fonte de verdade atual)
  const aulasPorProfessorTurno = new Map<number, Record<string, number>>();
  for (const h of horarios) {
    const turno = turmaMap.get(h.turmaId)?.turno;
    if (!turno) continue;
    if (!aulasPorProfessorTurno.has(h.professorId)) aulasPorProfessorTurno.set(h.professorId, {});
    const rec = aulasPorProfessorTurno.get(h.professorId)!;
    rec[turno] = (rec[turno] ?? 0) + 1;
  }

  // HA ja marcada (obrigatoria=true) por professor+turno
  const haMarcadaPorProfessorTurno = new Map<number, Record<string, number>>();
  const motivosVistos = new Map<number, Set<string>>();
  for (const d of disponibilidades) {
    if (!d.horaAtividadeObrigatoria) continue;
    if (!haMarcadaPorProfessorTurno.has(d.professorId)) haMarcadaPorProfessorTurno.set(d.professorId, {});
    const rec = haMarcadaPorProfessorTurno.get(d.professorId)!;
    const turno = d.turno ?? "sem_turno";
    rec[turno] = (rec[turno] ?? 0) + 1;
    if (!motivosVistos.has(d.professorId)) motivosVistos.set(d.professorId, new Set());
    if (d.motivo) motivosVistos.get(d.professorId)!.add(d.motivo);
  }

  console.log("=".repeat(70));
  console.log("DIAGNÓSTICO DE HORA-ATIVIDADE -- fórmula oficial SEED-PR");
  console.log("=".repeat(70));

  let totalComFalta = 0;
  let totalStaleMotivo = 0;

  for (const prof of professores) {
    const aulas = aulasPorProfessorTurno.get(prof.id);
    if (!aulas || Object.values(aulas).every((n) => n === 0)) continue; // sem aula nenhuma, ignora

    const exigidoPorTurno = calcularHoraAtividadePorTurno(aulas);
    const marcadoPorTurno = haMarcadaPorProfessorTurno.get(prof.id) ?? {};

    const linhas: string[] = [];
    let temFalta = false;
    for (const turno of Object.keys(exigidoPorTurno)) {
      const exigido = exigidoPorTurno[turno] ?? 0;
      const marcado = marcadoPorTurno[turno] ?? 0;
      if (exigido === 0) continue;
      const falta = exigido - marcado;
      if (falta !== 0) temFalta = true;
      linhas.push(`${turno}: ${marcado}/${exigido} aulas=${aulas[turno] ?? 0}${falta > 0 ? ` (FALTAM ${falta})` : falta < 0 ? ` (${-falta} A MAIS)` : ""}`);
    }

    const motivos = motivosVistos.get(prof.id);
    const temMotivoAntigo = motivos && [...motivos].some((m) => m.includes("22/06") || m.includes("26/06"));

    if (temFalta || temMotivoAntigo) {
      totalComFalta += temFalta ? 1 : 0;
      totalStaleMotivo += temMotivoAntigo ? 1 : 0;
      console.log(`\n${prof.nome} (id ${prof.id})${temMotivoAntigo ? "  [HA referenciando semana antiga 22/06-26/06]" : ""}`);
      for (const l of linhas) console.log(`  ${l}`);
    }
  }

  console.log(`\n\nTotal de professores com HA em falta ou sobra: ${totalComFalta}`);
  console.log(`Total de professores com HA referenciando a semana antiga (22/06-26/06): ${totalStaleMotivo}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
