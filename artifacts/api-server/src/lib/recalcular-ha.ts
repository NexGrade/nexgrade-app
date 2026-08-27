// [NOVO] Recalculo automatico de Hora-Atividade institucional.
//
// Extraido e generalizado de scripts/recalcular-ha.ts (que estava
// preso a escolaId="escola_default", um valor que nao existe mais
// desde que o sistema virou multi-tenant -- por isso o recalculo
// nunca rodava de verdade e a HA ficava desatualizada apos cada
// geracao de grade nova, exigindo scripts avulsos por professor).
//
// Usa a formula oficial SEED-PR (Resolucao n. 7.200/2025, art. 11)
// aplicada nas aulas REAIS da grade oficial atual:
//   - Falta HA: preenche primeiro janelas (buraco entre duas aulas no
//     mesmo dia) -- resolve HA insuficiente e janela excessiva ao
//     mesmo tempo. Sem janelas suficientes, completa com qualquer
//     slot livre no mesmo turno (art. 11 par. 4 -- HA concentrada no
//     turno principal quando ate 19 aulas nesse turno).
//   - Sobra HA: remove o excesso.
//   - Ja bate: nao mexe.
//
// Chamado automaticamente apos: promover experimento pra oficial,
// geracao direta (nao-experimental) pelo heuristico, e correcao
// cirurgica de professor -- ver pontos de chamada em horarios.ts.
import { db } from "@workspace/db";
import {
  professoresTable,
  turmasTable,
  horariosTable,
  horarioSlotsTable,
  disponibilidadeTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

const MOTIVO_HA_AUTO = "Hora-atividade institucional (recalculada automaticamente)";

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

export interface ResultadoRecalculoHA {
  inseridas: number;
  removidas: number;
  professoresAfetados: number;
}

/**
 * Recalcula a Hora-Atividade institucional de todos os professores de
 * uma escola, com base nas aulas REAIS da grade oficial atual. Aplica
 * as mudancas diretamente (sem confirmacao interativa) -- para uso
 * automatico apos geracao/promocao/correcao de grade.
 */
export async function recalcularHoraAtividade(escolaId: string): Promise<ResultadoRecalculoHA> {
  const [professores, turmas, horarios, horarioSlots, disponibilidadesTodas] = await Promise.all([
    db.select().from(professoresTable).where(eq(professoresTable.escolaId, escolaId)),
    db.select().from(turmasTable).where(eq(turmasTable.escolaId, escolaId)),
    db.select().from(horariosTable).where(eq(horariosTable.escolaId, escolaId)),
    db.select().from(horarioSlotsTable).where(eq(horarioSlotsTable.escolaId, escolaId)),
    db.select().from(disponibilidadeTable),
  ]);

  const profIdsDaEscola = new Set(professores.map((p) => p.id));
  const disponibilidades = disponibilidadesTodas.filter((d) => profIdsDaEscola.has(d.professorId));

  const turmaMap = new Map(turmas.map((t) => [t.id, t]));

  const maxAulaPorTurno = new Map<string, number>();
  for (const s of horarioSlots) {
    const atual = maxAulaPorTurno.get(s.turno) ?? 0;
    if (s.numeroAula > atual) maxAulaPorTurno.set(s.turno, s.numeroAula);
  }

  type Insercao = { professorId: number; turno: string; diaSemana: number; horarioSlot: number };
  const paraInserir: Insercao[] = [];
  const paraRemoverIds: number[] = [];
  const professoresAfetadosSet = new Set<number>();

  for (const prof of professores) {
    const aulasDoProf = horarios.filter((h) => h.professorId === prof.id);
    if (aulasDoProf.length === 0) continue;

    // aulasPorTurno / ocupadoPorTurno -- so cobrem turnos onde o
    // professor tem aula REAL. Turnos de contraturno (HA sem aula
    // nenhuma) nao aparecem aqui de proposito.
    const aulasPorTurno: Record<string, number> = {};
    const ocupadoPorTurno = new Map<string, Set<string>>();
    for (const h of aulasDoProf) {
      const turno = turmaMap.get(h.turmaId)?.turno;
      if (!turno) continue;
      aulasPorTurno[turno] = (aulasPorTurno[turno] ?? 0) + 1;
      if (!ocupadoPorTurno.has(turno)) ocupadoPorTurno.set(turno, new Set());
      ocupadoPorTurno.get(turno)!.add(`${h.diaSemana}-${h.numeroAula}`);
    }

    const totalAulas = Object.values(aulasPorTurno).reduce((s, n) => s + n, 0);
    const exigidoTotal = calcularHoraAtividadeInstitucional(totalAulas);

    // [FIX] Slots ja marcados como BLOQUEIO (disponivel=false, nao-HA)
    // -- a busca de horario livre pra nova HA precisa excluir essas
    // celulas tambem, nao so as que tem aula real. Sem isso, o
    // algoritmo podia inserir HA em cima de um bloqueio ja existente
    // (ex.: professor com o dia inteiro bloqueado, sem vir a escola --
    // colocar HA la dentro nao faz sentido nenhum). d.turno === null
    // conta como bloqueio universal (vale pra qualquer turno).
    const bloqueadoPorTurno = new Map<string, Set<string>>();
    for (const d of disponibilidades) {
      if (d.professorId !== prof.id || d.disponivel) continue;
      const chave = `${d.diaSemana}-${d.horarioSlot}`;
      if (d.turno == null) {
        for (const turno of Object.keys(aulasPorTurno)) {
          if (!bloqueadoPorTurno.has(turno)) bloqueadoPorTurno.set(turno, new Set());
          bloqueadoPorTurno.get(turno)!.add(chave);
        }
      } else {
        if (!bloqueadoPorTurno.has(d.turno)) bloqueadoPorTurno.set(d.turno, new Set());
        bloqueadoPorTurno.get(d.turno)!.add(chave);
      }
    }

    const haDoProf = disponibilidades.filter((d) => d.professorId === prof.id && d.horaAtividadeObrigatoria);

    // Valida cada HA existente (qualquer turno, inclusive
    // contraturno): so e invalida se colidir com uma aula REAL no
    // mesmo turno. Num turno sem aula nenhuma pra esse professor
    // (contraturno), nunca ha colisao possivel -- a marcacao e sempre
    // respeitada, mesmo sem aula ali.
    //
    // [FIX-REPOSICIONAMENTO] Alem de invalidar por colisao, tambem
    // invalida (pra reposicionar depois) uma HA que NAO esta fechando
    // janela nenhuma, SE existir uma janela de verdade sem HA nesse
    // mesmo turno. Sem isso, uma HA que ficou "sobrando" numa posicao
    // ruim (porque a grade mudou ao redor dela depois que ela foi
    // colocada) nunca era corrigida -- a quantidade total already
    // batia, entao o algoritmo antigo nao mexia nela, mesmo com uma
    // janela vaga esperando do lado.
    const marcadasValidas: typeof haDoProf = [];
    const candidatasAReposicionar: typeof haDoProf = [];
    for (const m of haDoProf) {
      const turno = m.turno ?? "sem_turno";
      const ocupado = ocupadoPorTurno.get(turno);
      const bloqueado = bloqueadoPorTurno.get(turno);
      const chave = `${m.diaSemana}-${m.horarioSlot}`;
      const colide = (ocupado?.has(chave) ?? false) || (bloqueado?.has(chave) ?? false);
      if (colide) {
        paraRemoverIds.push(m.id);
        professoresAfetadosSet.add(prof.id);
        continue;
      }
      candidatasAReposicionar.push(m);
    }

    // pra cada turno onde o professor tem HA, verifica se existe uma
    // janela de verdade (slot vago entre duas posicoes ocupadas --
    // aula real OU HA ja mantida) que nenhuma das HAs desse turno esta
    // preenchendo. Se existir, e a HA em questao NAO fecha janela
    // nenhuma, ela e candidata a mover.
    const porTurnoHA = new Map<string, typeof haDoProf>();
    for (const m of candidatasAReposicionar) {
      const turno = m.turno ?? "sem_turno";
      if (!porTurnoHA.has(turno)) porTurnoHA.set(turno, []);
      porTurnoHA.get(turno)!.push(m);
    }
    for (const [turno, marcasDoTurno] of porTurnoHA) {
      const maxAula = maxAulaPorTurno.get(turno) ?? 6;
      const ocupadoReal = ocupadoPorTurno.get(turno) ?? new Set();
      const todasHAsDoTurno = new Set(marcasDoTurno.map((m) => `${m.diaSemana}-${m.horarioSlot}`));
      // ocupado total pra fins de deteccao de janela = aula real + toda HA desse turno
      const ocupadoTotal = new Set([...ocupadoReal, ...todasHAsDoTurno]);

      const existeJanelaVaga = (() => {
        for (let dia = 0; dia < 5; dia++) {
          for (let aula = 1; aula <= maxAula; aula++) {
            const chave = `${dia}-${aula}`;
            if (ocupadoTotal.has(chave)) continue;
            if (ocupadoTotal.has(`${dia}-${aula - 1}`) && ocupadoTotal.has(`${dia}-${aula + 1}`)) return true;
          }
        }
        return false;
      })();

      for (const m of marcasDoTurno) {
        const chave = `${m.diaSemana}-${m.horarioSlot}`;
        const fechaJanela =
          ocupadoTotal.has(`${m.diaSemana}-${m.horarioSlot - 1}`) &&
          ocupadoTotal.has(`${m.diaSemana}-${m.horarioSlot + 1}`);
        if (existeJanelaVaga && !fechaJanela) {
          paraRemoverIds.push(m.id);
          professoresAfetadosSet.add(prof.id);
        } else {
          marcadasValidas.push(m);
        }
      }
    }

    const diferenca = exigidoTotal - marcadasValidas.length;

    if (diferenca === 0) continue;

    if (diferenca < 0) {
      // Sobra HA -- remove o excesso, preferindo remover das
      // marcadas que ESTAO no turno de ensino (as que nosso proprio
      // algoritmo costuma gerar); deixa contraturno por ultimo, ja
      // que normalmente foi colocado manualmente por decisao
      // institucional especifica.
      const noTurnoDeEnsino = marcadasValidas.filter((m) => (m.turno ?? "") in aulasPorTurno);
      const emContraturno = marcadasValidas.filter((m) => !((m.turno ?? "") in aulasPorTurno));
      const ordemRemocao = [...noTurnoDeEnsino, ...emContraturno];
      const remover = ordemRemocao.slice(0, -diferenca);
      paraRemoverIds.push(...remover.map((m) => m.id));
      professoresAfetadosSet.add(prof.id);
      continue;
    }

    // Falta HA -- insere so nos turnos onde o professor DA AULA de
    // verdade (nunca inventa um contraturno novo sozinho -- isso e
    // decisao institucional feita manualmente pela coordenacao).
    // Turnos com mais aulas primeiro (concentra no turno principal,
    // espirito do art. 11 par. 4 da Resolucao SEED-PR n. 7.200/2025).
    let faltam = diferenca;
    const turnosOrdenados = Object.keys(aulasPorTurno).sort((a, b) => (aulasPorTurno[b] ?? 0) - (aulasPorTurno[a] ?? 0));

    for (const turno of turnosOrdenados) {
      if (faltam <= 0) break;
      const ocupado = ocupadoPorTurno.get(turno) ?? new Set();
      const bloqueado = bloqueadoPorTurno.get(turno) ?? new Set();
      const maxAula = maxAulaPorTurno.get(turno) ?? 6;
      const jaMarcado = new Set(
        marcadasValidas.filter((m) => (m.turno ?? "sem_turno") === turno).map((m) => `${m.diaSemana}-${m.horarioSlot}`),
      );
      // [FIX] pra deteccao de janela (antes/depois), HA ja existente
      // TAMBEM conta como "ocupado" -- senao um vago entre uma HA e
      // uma aula real nao era reconhecido como janela de verdade.
      const ocupadoParaJanela = new Set([...ocupado, ...jaMarcado]);

      const candidatosJanela: Array<{ dia: number; aula: number }> = [];
      const candidatosOutros: Array<{ dia: number; aula: number }> = [];

      for (let dia = 0; dia < 5; dia++) {
        for (let aula = 1; aula <= maxAula; aula++) {
          const chave = `${dia}-${aula}`;
          if (ocupado.has(chave) || jaMarcado.has(chave) || bloqueado.has(chave)) continue;
          const antesOcupado = ocupadoParaJanela.has(`${dia}-${aula - 1}`);
          const depoisOcupado = ocupadoParaJanela.has(`${dia}-${aula + 1}`);
          if (antesOcupado && depoisOcupado) {
            candidatosJanela.push({ dia, aula });
          } else {
            candidatosOutros.push({ dia, aula, colada: antesOcupado || depoisOcupado });
          }
        }
      }

      // Prioridade dos candidatos "outros": primeiro os que ficam
      // COLADOS no bloco de aulas/HA ja existente (estende o bloco
      // compacto do professor, sem deixar vao entre a HA e a aula).
      // So depois, entre os restantes, prefere a borda do dia (aula 1
      // ou ultima) -- essa preferencia de borda so vale quando nao ha
      // nenhuma posicao colada disponivel (ex.: dia sem nenhuma aula
      // ainda, contraturno, etc).
      candidatosOutros.sort((a, b) => {
        if (a.colada !== b.colada) return a.colada ? -1 : 1;
        const distA = Math.min(a.aula - 1, maxAula - a.aula);
        const distB = Math.min(b.aula - 1, maxAula - b.aula);
        if (distA !== distB) return distA - distB;
        return a.dia - b.dia;
      });

      const escolhidos = [...candidatosJanela, ...candidatosOutros].slice(0, faltam);
      for (const c of escolhidos) {
        paraInserir.push({ professorId: prof.id, turno, diaSemana: c.dia, horarioSlot: c.aula });
        ocupado.add(`${c.dia}-${c.aula}`);
      }
      faltam -= escolhidos.length;
      if (escolhidos.length > 0) professoresAfetadosSet.add(prof.id);
    }

    // Se ainda faltar depois de tentar todos os turnos de ensino, nao
    // insere em lugar nenhum sozinho -- fica como pendencia real (a
    // conferencia de conflitos continua acusando ate alguem decidir
    // manualmente, ex.: abrir um contraturno novo pra esse professor).
  }

  if (paraInserir.length === 0 && paraRemoverIds.length === 0) {
    return { inseridas: 0, removidas: 0, professoresAfetados: 0 };
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
          motivo: MOTIVO_HA_AUTO,
        })),
      );
    }
    if (paraRemoverIds.length > 0) {
      await tx.delete(disponibilidadeTable).where(inArray(disponibilidadeTable.id, paraRemoverIds));
    }
  });

  return {
    inseridas: paraInserir.length,
    removidas: paraRemoverIds.length,
    professoresAfetados: professoresAfetadosSet.size,
  };
}
