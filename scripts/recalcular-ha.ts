// Recalcula a Hora-Atividade institucional de todos os professores,
// usando a fórmula oficial SEED-PR já validada no sistema, aplicada
// nas aulas REAIS da grade já sincronizada (27/07-31/07).
//
// Estratégia automática:
//   - Falta HA: preenche primeiro horários livres que já são "janela"
//     (buraco entre duas aulas ocupadas no mesmo dia) -- resolve
//     hora-atividade insuficiente E janela excessiva ao mesmo tempo.
//     Se não houver janelas suficientes, completa com qualquer slot
//     livre no mesmo turno (Art. 11 §4º -- HA concentrada no turno
//     principal quando até 19 aulas nesse turno).
//   - Sobra HA: remove o excesso (mantém o resto intacto).
//   - Já bate mas motivo é da semana antiga (22/06-26/06): só atualiza
//     o motivo/data, sem mexer na posição.
//
// Sempre em modo DRY-RUN primeiro -- pede confirmação antes de gravar.
//
// Como rodar:
//   npx tsx scripts/recalcular-ha.ts

import { db } from "@workspace/db";
import {
  professoresTable,
  turmasTable,
  horariosTable,
  horarioSlotsTable,
  disponibilidadeTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import * as readline from "readline";

const DIAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];
const MOTIVO_NOVO = "Hora-atividade institucional (grade real 27/07 a 31/07)";

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

function perguntar(pergunta: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(pergunta, (resp) => { rl.close(); resolve(resp); }));
}

async function main() {
  const escolaId = "escola_default";

  const [professores, turmas, horarios, horarioSlots, disponibilidades] = await Promise.all([
    db.select().from(professoresTable).where(eq(professoresTable.escolaId, escolaId)),
    db.select().from(turmasTable).where(eq(turmasTable.escolaId, escolaId)),
    db.select().from(horariosTable).where(eq(horariosTable.escolaId, escolaId)),
    db.select().from(horarioSlotsTable).where(eq(horarioSlotsTable.escolaId, escolaId)),
    db.select().from(disponibilidadeTable),
  ]);

  const turmaMap = new Map(turmas.map((t) => [t.id, t]));

  // maior numero de aula por turno (teto de slots existentes)
  const maxAulaPorTurno = new Map<string, number>();
  for (const s of horarioSlots) {
    const atual = maxAulaPorTurno.get(s.turno) ?? 0;
    if (s.numeroAula > atual) maxAulaPorTurno.set(s.turno, s.numeroAula);
  }

  type Insercao = { professorId: number; turno: string; diaSemana: number; horarioSlot: number };
  const paraInserir: Insercao[] = [];
  const paraRemoverIds: number[] = [];
  const paraAtualizarMotivoIds: number[] = [];

  for (const prof of professores) {
    const aulasDoProf = horarios.filter((h) => h.professorId === prof.id);
    if (aulasDoProf.length === 0) continue;

    const aulasPorTurno: Record<string, number> = {};
    const ocupadoPorTurno = new Map<string, Set<string>>(); // turno -> set "dia-aula"
    for (const h of aulasDoProf) {
      const turno = turmaMap.get(h.turmaId)?.turno;
      if (!turno) continue;
      aulasPorTurno[turno] = (aulasPorTurno[turno] ?? 0) + 1;
      if (!ocupadoPorTurno.has(turno)) ocupadoPorTurno.set(turno, new Set());
      ocupadoPorTurno.get(turno)!.add(`${h.diaSemana}-${h.numeroAula}`);
    }

    const exigidoPorTurno = calcularHoraAtividadePorTurno(aulasPorTurno);

    const haDoProf = disponibilidades.filter((d) => d.professorId === prof.id && d.horaAtividadeObrigatoria);
    const haPorTurno = new Map<string, typeof haDoProf>();
    for (const d of haDoProf) {
      const turno = d.turno ?? "sem_turno";
      if (!haPorTurno.has(turno)) haPorTurno.set(turno, []);
      haPorTurno.get(turno)!.push(d);
    }

    for (const turno of Object.keys(exigidoPorTurno)) {
      const exigido = exigidoPorTurno[turno] ?? 0;
      if (exigido === 0) continue;
      const marcadas = haPorTurno.get(turno) ?? [];
      const diferenca = exigido - marcadas.length;

      if (diferenca === 0) {
        // ja bate -- so atualiza motivo se estiver desatualizado
        for (const m of marcadas) {
          if (m.motivo?.includes("22/06") || m.motivo?.includes("26/06")) {
            paraAtualizarMotivoIds.push(m.id);
          }
        }
        continue;
      }

      if (diferenca < 0) {
        // sobra -- remove o excesso (os ultimos da lista, ordem arbitraria estavel)
        const remover = marcadas.slice(0, -diferenca);
        paraRemoverIds.push(...remover.map((m) => m.id));
        continue;
      }

      // falta -- acha slots livres nesse turno, priorizando janelas
      const ocupado = ocupadoPorTurno.get(turno) ?? new Set();
      const maxAula = maxAulaPorTurno.get(turno) ?? 6;
      const jaMarcado = new Set(marcadas.map((m) => `${m.diaSemana}-${m.horarioSlot}`));

      const candidatosJanela: Array<{ dia: number; aula: number }> = [];
      const candidatosOutros: Array<{ dia: number; aula: number }> = [];

      for (let dia = 0; dia < 5; dia++) {
        for (let aula = 1; aula <= maxAula; aula++) {
          const chave = `${dia}-${aula}`;
          if (ocupado.has(chave) || jaMarcado.has(chave)) continue;
          const antesOcupado = ocupado.has(`${dia}-${aula - 1}`);
          const depoisOcupado = ocupado.has(`${dia}-${aula + 1}`);
          if (antesOcupado && depoisOcupado) {
            candidatosJanela.push({ dia, aula });
          } else {
            candidatosOutros.push({ dia, aula });
          }
        }
      }

      const escolhidos = [...candidatosJanela, ...candidatosOutros].slice(0, diferenca);
      for (const c of escolhidos) {
        paraInserir.push({ professorId: prof.id, turno, diaSemana: c.dia, horarioSlot: c.aula });
      }
      // marca como ocupado pra nao escolher o mesmo slot duas vezes nesse mesmo turno
      for (const c of escolhidos) ocupado.add(`${c.dia}-${c.aula}`);
    }
  }

  console.log("=".repeat(70));
  console.log("RECÁLCULO DE HORA-ATIVIDADE -- dry-run");
  console.log("=".repeat(70));
  console.log(`Inserções (HA nova): ${paraInserir.length}`);
  console.log(`Remoções (excesso): ${paraRemoverIds.length}`);
  console.log(`Atualizações de motivo (já corretas, só desatualizadas): ${paraAtualizarMotivoIds.length}`);

  const profMap = new Map(professores.map((p) => [p.id, p]));
  if (paraInserir.length > 0) {
    console.log("\nInserções:");
    for (const i of paraInserir) {
      console.log(`  + ${profMap.get(i.professorId)?.nome} | ${i.turno} | ${DIAS[i.diaSemana]} aula ${i.horarioSlot}`);
    }
  }

  if (paraRemoverIds.length === 0 && paraInserir.length === 0 && paraAtualizarMotivoIds.length === 0) {
    console.log("\nNada a fazer.");
    process.exit(0);
  }

  const resp = await perguntar("\nAplicar essas mudanças agora? (digite 'sim' para confirmar) ");
  if (resp.trim().toLowerCase() !== "sim") {
    console.log("Cancelado -- nada foi alterado.");
    process.exit(0);
  }

  await db.transaction(async (tx) => {
    if (paraInserir.length > 0) {
      await tx.insert(disponibilidadeTable).values(
        paraInserir.map((i) => ({
          professorId: i.professorId,
          turno: i.turno,
          diaSemana: i.diaSemana,
          horarioSlot: i.horarioSlot,
          disponivel: true,
          horaAtividadeObrigatoria: true,
          motivo: MOTIVO_NOVO,
        })),
      );
    }
    if (paraRemoverIds.length > 0) {
      await tx.delete(disponibilidadeTable).where(inArray(disponibilidadeTable.id, paraRemoverIds));
    }
    for (const id of paraAtualizarMotivoIds) {
      await tx.update(disponibilidadeTable).set({ motivo: MOTIVO_NOVO }).where(eq(disponibilidadeTable.id, id));
    }
  });

  console.log("\nPronto! Hora-atividade recalculada.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
