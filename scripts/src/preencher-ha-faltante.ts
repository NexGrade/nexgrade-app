// Script pontual — completa a Hora-Atividade institucional que falta
// pra cada professor, usando SÓ horários livres (nem aula real, nem já
// bloqueado, nem já marcado como HA) nos dias em que o professor JÁ
// ESTÁ na escola naquele turno (tem pelo menos 1 aula real naquele
// dia+turno). Nunca inventa um dia novo pra ele, nunca sobrescreve
// nada que já esteja marcado.
//
// Prioridade: turno em que o professor dá mais aulas primeiro (é o
// "principal" dele), espalhando as HA que faltam pelos dias em que ele
// já está lá, em vez de empilhar tudo no mesmo dia.
//
// Se não sobrar espaço livre suficiente nos dias em que ele já está na
// escola, o script preenche o que der e avisa quanto ainda falta —
// não força HA em outro turno/dia sem aula real, porque isso violaria
// a regra "HA no mesmo turno das aulas" (Art. 11, §4º).
//
// Seguro rodar mais de uma vez (idempotente).
//
// Como rodar:
//   pnpm --filter @workspace/scripts exec tsx src/preencher-ha-faltante.ts

import { db, pool } from "@workspace/db";
import { professoresTable, turmasTable, horariosTable, horarioSlotsTable, disponibilidadeTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const ESCOLA_ID = "escola_default";
const TURNOS = ["matutino", "vespertino", "noturno"] as const;
const MOTIVO = "HA institucional preenchida automaticamente — horário livre no dia em que o professor já está na escola";
const MOTIVO_ALTERNADO = "HA institucional preenchida automaticamente — turno alternado (grade cheia no turno principal), mesmo dia em que já está na escola";

// Mesma lógica de lib/hora-atividade.ts: calcula o total geral de HA
// (arredondado pra cima uma única vez) e distribui entre os turnos
// proporcionalmente, em vez de cada turno arredondar pra cima sozinho
// (o que infla o total -- 20 manhã + 10 tarde não pode virar 7+4=11
// quando o certo pra 30 aulas é 10).
function calcularHoraAtividadePorTurno(aulasPorTurno: Record<string, number>): Record<string, number> {
  const turnos = Object.keys(aulasPorTurno);
  const totalAulas = turnos.reduce((soma, t) => soma + (aulasPorTurno[t] || 0), 0);
  if (totalAulas <= 0) {
    const zeros: Record<string, number> = {};
    turnos.forEach((t) => (zeros[t] = 0));
    return zeros;
  }
  const exigidoTotal = Math.ceil(totalAulas / 3);
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
  console.log("🔧 Preenchendo HA institucional faltante em horários livres...\n");

  const [professores, turmas, horarios, disponibilidadesTodas] = await Promise.all([
    db.select().from(professoresTable).where(and(eq(professoresTable.escolaId, ESCOLA_ID), eq(professoresTable.ativo, true))),
    db.select().from(turmasTable).where(eq(turmasTable.escolaId, ESCOLA_ID)),
    db.select().from(horariosTable).where(eq(horariosTable.escolaId, ESCOLA_ID)),
    db.select().from(disponibilidadeTable),
  ]);

  const turnoPorTurmaId = new Map(turmas.map((t) => [t.id, t.turno]));

  const slotsPorTurno: Record<string, number[]> = {};
  for (const turno of TURNOS) {
    const condicaoNivel = turno === "matutino" ? eq(horarioSlotsTable.nivelEnsino, "medio_tecnico") : undefined;
    const where = condicaoNivel ? and(eq(horarioSlotsTable.turno, turno), condicaoNivel) : eq(horarioSlotsTable.turno, turno);
    const slots = await db.select().from(horarioSlotsTable).where(where);
    slotsPorTurno[turno] = slots.map((s) => s.numeroAula).sort((a, b) => a - b);
  }

  let totalPreenchidas = 0;
  let professoresCompletos = 0;
  const aindaFaltando: string[] = [];

  for (const prof of professores) {
    // Placeholder (0h) -- não tem regime real, não se aplica.
    if (prof.cargaHorariaTotal <= 0) continue;

    const aulasDoProf = horarios.filter((h) => h.professorId === prof.id);

    // Turnos em que o professor trabalha, do que tem mais aula pro que
    // tem menos -- prioriza preencher no turno "principal" dele primeiro.
    const aulasPorTurno: Record<string, typeof aulasDoProf> = {};
    aulasDoProf.forEach((h) => {
      const turno = turnoPorTurmaId.get(h.turmaId);
      if (!turno) return;
      if (!aulasPorTurno[turno]) aulasPorTurno[turno] = [];
      aulasPorTurno[turno]!.push(h);
    });
    const turnosOrdenados = Object.entries(aulasPorTurno).sort((a, b) => b[1].length - a[1].length).map(([t]) => t);

    // [FIX] Exigido agora usa o mesmo método de lib/hora-atividade.ts:
    // total geral arredondado pra cima uma vez, distribuído entre os
    // turnos proporcionalmente -- não mais um número fixo (9/18), nem
    // cada turno arredondando pra cima de forma independente (o que
    // inflava o total).
    const contagemPorTurno: Record<string, number> = {};
    turnosOrdenados.forEach((t) => (contagemPorTurno[t] = aulasPorTurno[t]!.length));
    const exigidoPorTurno = calcularHoraAtividadePorTurno(contagemPorTurno);
    const exigido = Object.values(exigidoPorTurno).reduce((a, b) => a + b, 0);
    const disponibilidadeProf = disponibilidadesTodas.filter((d) => d.professorId === prof.id);
    const haAtual = disponibilidadeProf.filter((d) => d.horaAtividadeObrigatoria).length;
    let faltam = exigido - haAtual;
    if (faltam <= 0) continue;

    const existenteSet = new Set(disponibilidadeProf.map((d) => `${d.turno ?? "null"}-${d.diaSemana}-${d.horarioSlot}`));
    const ocupadoSet = new Set(aulasDoProf.map((h) => `${turnoPorTurmaId.get(h.turmaId)}-${h.diaSemana}-${h.numeroAula}`));

    const linhasParaInserir: Array<typeof disponibilidadeTable.$inferInsert> = [];

    for (const turno of turnosOrdenados) {
      if (faltam <= 0) break;
      const diasNaEscola = [...new Set(aulasPorTurno[turno]!.map((h) => h.diaSemana))];
      const slots = slotsPorTurno[turno] ?? [];

      for (const dia of diasNaEscola) {
        if (faltam <= 0) break;
        for (const numeroAula of slots) {
          if (faltam <= 0) break;
          const chave = `${turno}-${dia}-${numeroAula}`;
          if (ocupadoSet.has(chave) || existenteSet.has(chave)) continue; // tem aula real ou já tem algo marcado

          linhasParaInserir.push({
            professorId: prof.id,
            diaSemana: dia,
            horarioSlot: numeroAula,
            disponivel: true,
            turno,
            horaAtividadeObrigatoria: true,
            motivo: MOTIVO,
          });
          existenteSet.add(chave);
          faltam--;
        }
      }
    }

    // [NOVO] "Períodos alternados" -- quando a grade do professor no
    // turno principal está cheia (não sobrou nenhum slot livre pra HA
    // lá), a prática real da escola é fazer a HA no turno OPOSTO, mas
    // sempre no MESMO dia em que ele já vem pra dar aula (ex.: dá aula
    // de manhã na segunda, faz HA à tarde nessa mesma segunda -- não
    // um dia qualquer). Só entra em ação depois de esgotar o turno
    // principal, e só nos dias em que ele já está fisicamente na
    // escola (em qualquer turno).
    if (faltam > 0) {
      const diasQueJaVem = [...new Set(aulasDoProf.map((h) => h.diaSemana))];
      for (const turno of TURNOS) {
        if (faltam <= 0) break;
        const slots = slotsPorTurno[turno] ?? [];

        for (const dia of diasQueJaVem) {
          if (faltam <= 0) break;
          for (const numeroAula of slots) {
            if (faltam <= 0) break;
            const chave = `${turno}-${dia}-${numeroAula}`;
            if (ocupadoSet.has(chave) || existenteSet.has(chave)) continue;

            linhasParaInserir.push({
              professorId: prof.id,
              diaSemana: dia,
              horarioSlot: numeroAula,
              disponivel: true,
              turno,
              horaAtividadeObrigatoria: true,
              motivo: MOTIVO_ALTERNADO,
            });
            existenteSet.add(chave);
            faltam--;
          }
        }
      }
    }

    if (linhasParaInserir.length > 0) {
      await db.insert(disponibilidadeTable).values(linhasParaInserir);
      totalPreenchidas += linhasParaInserir.length;
    }

    if (faltam > 0) {
      aindaFaltando.push(`${prof.nome}: faltam ainda ${faltam} (sem espaço livre nos dias em que já está na escola, nem no turno principal nem no alternado)`);
    } else {
      professoresCompletos++;
    }
  }

  console.log(`✅ ${totalPreenchidas} slot(s) de HA preenchido(s), completando ${professoresCompletos} professor(es).`);
  if (aindaFaltando.length > 0) {
    console.log(`\n⚠️  ${aindaFaltando.length} professor(es) ainda com HA insuficiente (sem horário livre disponível nos dias em que trabalham):`);
    aindaFaltando.forEach((linha) => console.log(`   - ${linha}`));
  }
  console.log("\n🎉 Concluído.");
  await pool.end();
}

main().catch((err) => {
  console.error("❌ Erro:", err);
  process.exit(1);
});
