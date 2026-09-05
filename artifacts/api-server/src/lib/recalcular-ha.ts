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
//   - Preenche primeiro no(s) turno(s) onde o professor da aula,
//     priorizando sempre o slot que resulta em MENOS janelas no total
//     (art. 11 par. 4 -- HA concentrada no turno principal).
//   - [POLITICA-CONTRATURNO] O que nao couber (turno de ensino lotado
//     de aula real, sem espaco suficiente) e completado automaticamente
//     em contraturno, no turno onde o professor nao da aula. Decisao
//     institucional confirmada em 28/08/2026 -- antes disso o sistema
//     nunca inventava contraturno sozinho (so preservava marcacao
//     manual ja existente); agora preenche o que sobra sozinho, sempre
//     priorizando o turno de ensino primeiro.
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

function calcularHoraAtividadePorTurno(aulasPorTurno: Record<string, number>, exigidoOverride?: number): Record<string, number> {
  const turnos = Object.keys(aulasPorTurno);
  const totalAulas = turnos.reduce((soma, t) => soma + (aulasPorTurno[t] || 0), 0);
  if (totalAulas <= 0) {
    const zeros: Record<string, number> = {};
    turnos.forEach((t) => (zeros[t] = 0));
    return zeros;
  }
  const exigidoTotal = exigidoOverride ?? calcularHoraAtividadeInstitucional(totalAulas);
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

export interface AulaParaCalculoHA {
  professorId: number;
  turmaId: number;
  diaSemana: number;
  numeroAula: number;
}

export interface MarcaHACalculada {
  professorId: number;
  turno: string;
  diaSemana: number;
  horarioSlot: number;
}

/**
 * [PURO -- NAO GRAVA NADA] Calcula qual seria a distribuicao IDEAL de
 * Hora-Atividade institucional pra um conjunto de aulas (a formula
 * oficial SEED-PR, preenchendo primeiro janela, art. 11 par. 4).
 *
 * Recebe a lista de aulas pronta (`aulasOverride`) em vez de buscar
 * `horariosTable` sozinha -- permite reusar o MESMO calculo tanto pra
 * grade oficial real (`recalcularHoraAtividade`, que grava no banco)
 * quanto pra uma previa/experimento (so simulacao, pra exibir num PDF
 * antes de promover, sem gravar nada).
 *
 * Retorna a lista FINAL de marcas de HA (as que ja estavam certas +
 * as novas escolhidas), nao um diff -- quem grava no banco (a funcao
 * abaixo) que calcula o diff contra o que ja existe.
 */
export async function calcularHAIdeal(
  escolaId: string,
  aulasOverride?: AulaParaCalculoHA[],
): Promise<MarcaHACalculada[]> {
  const [professores, turmas, horariosReais, horarioSlots, disponibilidadesTodas] = await Promise.all([
    db.select().from(professoresTable).where(eq(professoresTable.escolaId, escolaId)),
    db.select().from(turmasTable).where(eq(turmasTable.escolaId, escolaId)),
    aulasOverride ? Promise.resolve([]) : db.select().from(horariosTable).where(eq(horariosTable.escolaId, escolaId)),
    db.select().from(horarioSlotsTable).where(eq(horarioSlotsTable.escolaId, escolaId)),
    db.select().from(disponibilidadeTable),
  ]);
  const horarios: AulaParaCalculoHA[] = aulasOverride ?? horariosReais;

  const profIdsDaEscola = new Set(professores.map((p) => p.id));
  const disponibilidades = disponibilidadesTodas.filter((d) => profIdsDaEscola.has(d.professorId));

  const turmaMap = new Map(turmas.map((t) => [t.id, t]));

  const maxAulaPorTurno = new Map<string, number>();
  for (const s of horarioSlots) {
    const atual = maxAulaPorTurno.get(s.turno) ?? 0;
    if (s.numeroAula > atual) maxAulaPorTurno.set(s.turno, s.numeroAula);
  }

  const marcasFinais: MarcaHACalculada[] = [];

  for (const prof of professores) {
    const aulasDoProf = horarios.filter((h) => h.professorId === prof.id);
    if (aulasDoProf.length === 0) continue;

    const aulasPorTurno: Record<string, number> = {};
    const ocupadoPorTurnoOriginal = new Map<string, Set<string>>();
    for (const h of aulasDoProf) {
      const turno = turmaMap.get(h.turmaId)?.turno;
      if (!turno) continue;
      aulasPorTurno[turno] = (aulasPorTurno[turno] ?? 0) + 1;
      if (!ocupadoPorTurnoOriginal.has(turno)) ocupadoPorTurnoOriginal.set(turno, new Set());
      ocupadoPorTurnoOriginal.get(turno)!.add(`${h.diaSemana}-${h.numeroAula}`);
    }

    // bloqueios (disponivel=false, nao-HA) -- excluidos de qualquer
    // calculo de candidato, em qualquer fase. turno===null bloqueia em
    // todos os turnos onde o professor tem aula.
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

    // [MANUAL-CONTRATURNO] HA ja marcada manualmente num turno onde o
    // professor NAO tem nenhuma aula real -- e uma decisao institucional
    // tomada por fora do sistema (autorizacao da coordenacao), sempre
    // respeitada e nunca recalculada por aqui. Conta pro total exigido.
    const haManualContraturno = disponibilidades.filter(
      (d) => d.professorId === prof.id && d.horaAtividadeObrigatoria && !((d.turno ?? "") in aulasPorTurno),
    );
    for (const m of haManualContraturno) {
      marcasFinais.push({ professorId: prof.id, turno: m.turno ?? "sem_turno", diaSemana: m.diaSemana, horarioSlot: m.horarioSlot });
    }

    const totalAulas = Object.values(aulasPorTurno).reduce((s, n) => s + n, 0);
    const exigidoTotal = calcularHoraAtividadeInstitucional(totalAulas);
    // [FIX] a HA manual de contraturno ja preservada acima conta pro
    // total exigido -- sem subtrair aqui, o orcamento automatico por
    // turno de ensino seria calculado em cima do total CHEIO de novo,
    // dando HA a mais (manual + automatica somando mais que o exigido).
    const exigidoParaDistribuir = Math.max(0, exigidoTotal - haManualContraturno.length);
    const orcamentoPorTurno = calcularHoraAtividadePorTurno(aulasPorTurno, exigidoParaDistribuir);

    // [PREENCHIMENTO-GULOSO] Funcao reutilizavel: dado um turno, um
    // orcamento e o conjunto inicial de slots ocupados (aula real),
    // preenche o maximo possivel do orcamento nesse turno, sempre
    // escolhendo a cada passo o slot que resulta em MENOS janelas no
    // total (empate: prefere colado a algo ja ocupado, depois mais
    // perto da borda do turno, depois ordem do dia). Retorna quanto
    // sobrou de orcamento sem conseguir encaixar (turno lotado).
    function preencherGuloso(turno: string, orcamentoInicial: number, ocupadoInicial: Set<string>): number {
      let orcamento = orcamentoInicial;
      const maxAula = maxAulaPorTurno.get(turno) ?? 6;
      const bloqueado = bloqueadoPorTurno.get(turno) ?? new Set();
      const ocupado = new Set(ocupadoInicial);
      // [LIMITE-HA-POR-DIA] evita empilhar toda a HA de um professor
      // num so dia (ex.: dia inteiro so de HA) -- conta quantas HA ja
      // foram colocadas em cada dia NESTA chamada (por turno).
      const contagemDiaAtual = new Map<number, number>();
      const MAX_HA_POR_DIA = 3;

      function livre(dia: number, aula: number): boolean {
        if (aula < 1 || aula > maxAula) return false;
        const chave = `${dia}-${aula}`;
        return !ocupado.has(chave) && !bloqueado.has(chave);
      }
      function contarJanelas(conjunto: Set<string>): number {
        let total = 0;
        for (let dia = 0; dia < 5; dia++) {
          for (let aula = 1; aula <= maxAula; aula++) {
            const chave = `${dia}-${aula}`;
            if (conjunto.has(chave)) continue;
            if (conjunto.has(`${dia}-${aula - 1}`) && conjunto.has(`${dia}-${aula + 1}`)) total++;
          }
        }
        return total;
      }

      while (orcamento > 0) {
        let candidatos: Array<{ dia: number; aula: number }> = [];
        for (let dia = 0; dia < 5; dia++) {
          for (let aula = 1; aula <= maxAula; aula++) {
            if (livre(dia, aula)) candidatos.push({ dia, aula });
          }
        }
        if (candidatos.length === 0) break;
        const dentroDoLimite = candidatos.filter((c) => (contagemDiaAtual.get(c.dia) ?? 0) < MAX_HA_POR_DIA);
        if (dentroDoLimite.length > 0) candidatos = dentroDoLimite;

        let melhor: { dia: number; aula: number; janelas: number; colado: boolean; dist: number } | null = null;
        for (const c of candidatos) {
          const testado = new Set(ocupado);
          testado.add(`${c.dia}-${c.aula}`);
          const janelas = contarJanelas(testado);
          const colado = ocupado.has(`${c.dia}-${c.aula - 1}`) || ocupado.has(`${c.dia}-${c.aula + 1}`);
          const dist = Math.min(c.aula - 1, maxAula - c.aula);
          if (
            !melhor ||
            janelas < melhor.janelas ||
            (janelas === melhor.janelas && colado && !melhor.colado) ||
            (janelas === melhor.janelas && colado === melhor.colado && dist < melhor.dist) ||
            (janelas === melhor.janelas && colado === melhor.colado && dist === melhor.dist && c.dia < melhor.dia)
          ) {
            melhor = { ...c, janelas, colado, dist };
          }
        }
        if (!melhor) break;
        marcasFinais.push({ professorId: prof.id, turno, diaSemana: melhor.dia, horarioSlot: melhor.aula });
        ocupado.add(`${melhor.dia}-${melhor.aula}`);
        contagemDiaAtual.set(melhor.dia, (contagemDiaAtual.get(melhor.dia) ?? 0) + 1);
        orcamento--;
      }
      return orcamento;
    }

    // [RECALCULO DETERMINISTICO] Pra cada turno onde o professor da
    // aula, preenche do ZERO (nunca olhando pra HA antiga) a melhor
    // distribuicao do orcamento daquele turno -- sempre com o mesmo
    // resultado pra mesma entrada (aulas reais + orcamento), o que
    // elimina qualquer chance de oscilacao entre rodadas.
    let sobraGeral = 0;
    for (const turno of Object.keys(aulasPorTurno)) {
      const orcamento = orcamentoPorTurno[turno] ?? 0;
      if (orcamento <= 0) continue;
      const restante = preencherGuloso(turno, orcamento, ocupadoPorTurnoOriginal.get(turno) ?? new Set());
      sobraGeral += restante;
    }

    // [CONTRATURNO-AUTOMATICO] O que nao coube no(s) turno(s) de
    // ensino (turno lotado -- aula real ocupando quase tudo) e
    // colocado automaticamente em contraturno, no(s) turno(s) onde o
    // professor NAO da aula nenhuma. Prioriza o turno com mais espaco
    // livre primeiro. So entra aqui quando de fato faltou espaco --
    // nunca reduz o que ja coube no turno de ensino.
    if (sobraGeral > 0) {
      const turnosContraturno = [...maxAulaPorTurno.keys()].filter((t) => !(t in aulasPorTurno));
      // ordena pelo turno com mais slots livres primeiro, pra
      // distribuir de forma mais equilibrada quando ha mais de uma
      // opcao de contraturno (ex.: professor so do vespertino tem
      // tanto matutino quanto noturno como opcao)
      const espacoLivre = (turno: string) => {
        const maxAula = maxAulaPorTurno.get(turno) ?? 6;
        const bloqueado = bloqueadoPorTurno.get(turno) ?? new Set();
        let livre = 0;
        for (let dia = 0; dia < 5; dia++) {
          for (let aula = 1; aula <= maxAula; aula++) {
            if (!bloqueado.has(`${dia}-${aula}`)) livre++;
          }
        }
        return livre;
      };
      turnosContraturno.sort((a, b) => espacoLivre(b) - espacoLivre(a));

      for (const turno of turnosContraturno) {
        if (sobraGeral <= 0) break;
        // [FIX] semeia com a HA manual ja existente nesse contraturno
        // (se houver) -- senao o preenchimento automatico podia
        // escolher o MESMO slot que já tem uma marca manual ali.
        const jaManualNesseTurno = new Set(
          haManualContraturno.filter((m) => (m.turno ?? "sem_turno") === turno).map((m) => `${m.diaSemana}-${m.horarioSlot}`),
        );
        sobraGeral = preencherGuloso(turno, sobraGeral, jaManualNesseTurno);
      }
    }

    // Se AINDA sobrar depois de tentar todo turno de ensino E todo
    // contraturno (bloqueios cobrindo a semana inteira em todo turno),
    // fica como pendencia real -- a conferencia de conflitos acusa ate
    // alguem decidir manualmente (ex.: reduzir a carga do professor).
  }
  return marcasFinais;
}

/**
 * Recalcula a Hora-Atividade institucional de todos os professores de
 * uma escola, com base nas aulas REAIS da grade oficial atual. Aplica
 * as mudancas diretamente (sem confirmacao interativa) -- para uso
 * automatico apos geracao/promocao/correcao de grade.
 *
 * Usa calcularHAIdeal (puro) por baixo, e so cuida de comparar contra
 * o que ja existe em disponibilidadeTable pra gravar so a diferenca.
 *
 * [MULTI-PASSADA] O reposicionamento de uma HA às vezes precisa de
 * mais de um ciclo pra chegar no lugar ideal (ex.: mover a HA de A
 * pra B libera uma janela em C, que só um segundo cálculo detecta).
 * Em vez de exigir que alguém rode o recálculo várias vezes na mão,
 * a função já roda internamente até estabilizar (nenhuma mudança na
 * passada) ou até o limite de segurança, garantindo que o sistema
 * sempre convirja numa solução sozinho.
 */
export async function recalcularHoraAtividade(escolaId: string): Promise<ResultadoRecalculoHA> {
  const MAX_PASSADAS = 5;
  let totalInseridas = 0;
  let totalRemovidas = 0;
  const professoresAfetadosGeral = new Set<number>();

  for (let passada = 1; passada <= MAX_PASSADAS; passada++) {
    const resultado = await recalcularHoraAtividadeUmaPassada(escolaId);
    totalInseridas += resultado.inseridas;
    totalRemovidas += resultado.removidas;
    resultado.professoresAfetadosIds.forEach((id) => professoresAfetadosGeral.add(id));

    // estabilizou -- nenhuma mudanca nessa passada, nao precisa continuar
    if (resultado.inseridas === 0 && resultado.removidas === 0) break;
  }

  return {
    inseridas: totalInseridas,
    removidas: totalRemovidas,
    professoresAfetados: professoresAfetadosGeral.size,
  };
}

interface ResultadoUmaPassada extends ResultadoRecalculoHA {
  professoresAfetadosIds: number[];
}

async function recalcularHoraAtividadeUmaPassada(escolaId: string): Promise<ResultadoUmaPassada> {
  const [marcasFinais, disponibilidadesTodas, professores] = await Promise.all([
    calcularHAIdeal(escolaId),
    db.select().from(disponibilidadeTable),
    db.select().from(professoresTable).where(eq(professoresTable.escolaId, escolaId)),
  ]);

  const profIdsDaEscola = new Set(professores.map((p) => p.id));
  const disponibilidades = disponibilidadesTodas.filter((d) => profIdsDaEscola.has(d.professorId) && d.horaAtividadeObrigatoria);

  const chaveMarca = (m: { professorId: number; turno: string; diaSemana: number; horarioSlot: number }) =>
    `${m.professorId}|${m.turno}|${m.diaSemana}|${m.horarioSlot}`;

  const finaisSet = new Set(marcasFinais.map(chaveMarca));
  const existentesPorChave = new Map(disponibilidades.map((d) => [chaveMarca({ professorId: d.professorId, turno: d.turno ?? "sem_turno", diaSemana: d.diaSemana, horarioSlot: d.horarioSlot }), d]));

  const paraInserir = marcasFinais.filter((m) => !existentesPorChave.has(chaveMarca(m)));
  const paraRemoverIds = disponibilidades
    .filter((d) => !finaisSet.has(chaveMarca({ professorId: d.professorId, turno: d.turno ?? "sem_turno", diaSemana: d.diaSemana, horarioSlot: d.horarioSlot })))
    .map((d) => d.id);

  const professoresAfetadosSet = new Set<number>([
    ...paraInserir.map((m) => m.professorId),
    ...disponibilidades.filter((d) => paraRemoverIds.includes(d.id)).map((d) => d.professorId),
  ]);

  if (paraInserir.length === 0 && paraRemoverIds.length === 0) {
    return { inseridas: 0, removidas: 0, professoresAfetados: 0, professoresAfetadosIds: [] };
  }

  await db.transaction(async (tx) => {
    if (paraInserir.length > 0) {
      await tx.insert(disponibilidadeTable).values(
        paraInserir.map((i) => ({
          professorId: i.professorId,
          turno: i.turno === "sem_turno" ? null : i.turno,
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
    professoresAfetadosIds: [...professoresAfetadosSet],
  };
}
