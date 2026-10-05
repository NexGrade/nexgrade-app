// [SIMULAR-PROMOCAO] (05/10/2026) Antes de promover um experimento: monta em
// MEMORIA a grade oficial como ficaria depois da promocao (mesma regra do
// promover: troca so as aulas dos pares turma+professor do experimento), roda o
// MESMO calculo de HA da promocao (calcularHAIdeal com aulasOverride, sem gravar)
// e conta as janelas de professor dos turnos envolvidos do jeito da tela de
// Conflitos: aula, HA e atividade do Urania ("(ocupado: FORM)"...) ocupam o
// horario. Compara com a oficial atual. Nada e gravado.
import { db, professoresTable, turmasTable, horariosTable, horariosExperimentaisTable, disponibilidadeTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { calcularHAIdeal, type AulaParaCalculoHA, type MarcaHACalculada } from "./recalcular-ha";

const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex"];

export interface JanelaSimulada {
  professorId: number;
  professorNome: string;
  turno: string;
  dia: string;
  janelas: number;
  dia_detalhe: string; // ex.: "3:aula 5:HA 6:aula"
}

export interface ResultadoSimulacao {
  nome: string;
  turnos: string[];
  oficial: { janelas: number; diasComConflito: number; detalhe: JanelaSimulada[] };
  experimento: { janelas: number; diasComConflito: number; detalhe: JanelaSimulada[] };
  professoresComHAMudando: number;
  veredito: "melhor" | "empate" | "pior";
}

export async function simularPromocao(escolaId: string, nome: string): Promise<ResultadoSimulacao | null> {
  const [profs, turmas, oficial, exp, disp] = await Promise.all([
    db.select().from(professoresTable).where(eq(professoresTable.escolaId, escolaId)),
    db.select().from(turmasTable).where(eq(turmasTable.escolaId, escolaId)),
    db.select().from(horariosTable).where(eq(horariosTable.escolaId, escolaId)),
    db.select().from(horariosExperimentaisTable)
      .where(and(eq(horariosExperimentaisTable.escolaId, escolaId), eq(horariosExperimentaisTable.nome, nome))),
    db.select().from(disponibilidadeTable),
  ]);
  if (exp.length === 0) return null;

  const nomeProf = new Map(profs.map((p) => [p.id, p.nome]));
  const profIds = new Set(profs.map((p) => p.id));
  const turnoDe = new Map(turmas.map((t) => [t.id, t.turno]));
  const turnos = [...new Set(exp.map((e) => turnoDe.get(e.turmaId)).filter((t): t is string => !!t))];

  // mesma regra do promover: apaga so os pares turma+professor do experimento
  const pares = new Set(exp.map((e) => `${e.turmaId}|${e.professorId}`));
  const aulasOficial: AulaParaCalculoHA[] = oficial.map((h) => ({ professorId: h.professorId, turmaId: h.turmaId, diaSemana: h.diaSemana, numeroAula: h.numeroAula }));
  const aulasSimuladas: AulaParaCalculoHA[] = [
    ...aulasOficial.filter((a) => !pares.has(`${a.turmaId}|${a.professorId}`)),
    ...exp.map((e) => ({ professorId: e.professorId, turmaId: e.turmaId, diaSemana: e.diaSemana, numeroAula: e.numeroAula })),
  ];
  const haOficial = await calcularHAIdeal(escolaId, aulasOficial);
  const haSimulada = await calcularHAIdeal(escolaId, aulasSimuladas);

  const atividade = new Set(disp
    .filter((d) => profIds.has(d.professorId) && !d.horaAtividadeObrigatoria && d.turno && /\(ocupado:\s*[^)]+\)/.test(d.motivo ?? ""))
    .map((d) => `${d.professorId}|${d.turno}|${d.diaSemana}|${d.horarioSlot}`));

  const contar = (aulas: AulaParaCalculoHA[], ha: MarcaHACalculada[]) => {
    const porDia = new Map<string, Map<number, string>>(); // "prof|turno|dia" -> aula -> tipo
    const marca = (p: number, t: string, d: number, a: number, tipo: string) => {
      const k = `${p}|${t}|${d}`;
      if (!porDia.has(k)) porDia.set(k, new Map());
      if (!porDia.get(k)!.has(a) || tipo === "aula") porDia.get(k)!.set(a, tipo);
    };
    for (const a of aulas) {
      const t = turnoDe.get(a.turmaId);
      if (t && turnos.includes(t)) marca(a.professorId, t, a.diaSemana, a.numeroAula, "aula");
    }
    for (const m of ha) if (turnos.includes(m.turno)) marca(m.professorId, m.turno, m.diaSemana, m.horarioSlot, m.outroTurno ? "HA*" : "HA");

    const detalhe: JanelaSimulada[] = [];
    for (const [k, m] of porDia) {
      const [p, t, d] = k.split("|");
      const nums = [...m.keys()].sort((x, y) => x - y);
      let janelas = 0;
      for (let a = nums[0]! + 1; a < nums[nums.length - 1]!; a++) if (!m.has(a) && !atividade.has(`${p}|${t}|${d}|${a}`)) janelas++;
      if (janelas > 0) {
        detalhe.push({
          professorId: Number(p), professorNome: nomeProf.get(Number(p)) ?? `#${p}`, turno: t!, dia: DIAS[Number(d)] ?? d!,
          janelas, dia_detalhe: nums.map((a) => `${a}:${m.get(a)}`).join(" "),
        });
      }
    }
    detalhe.sort((x, y) => y.janelas - x.janelas || x.professorNome.localeCompare(y.professorNome));
    return {
      janelas: detalhe.reduce((s, d) => s + d.janelas, 0),
      diasComConflito: detalhe.filter((d) => d.janelas >= 2).length, // mesmo corte da tela de Conflitos
      detalhe,
    };
  };

  const resOficial = contar(aulasOficial, haOficial);
  const resExp = contar(aulasSimuladas, haSimulada);

  const chave = (m: MarcaHACalculada) => `${m.professorId}|${m.turno}|${m.diaSemana}|${m.horarioSlot}`;
  const sOf = new Set(haOficial.map(chave));
  const sEx = new Set(haSimulada.map(chave));
  const mudam = new Set([
    ...haOficial.filter((m) => !sEx.has(chave(m))),
    ...haSimulada.filter((m) => !sOf.has(chave(m))),
  ].map((m) => m.professorId));

  return {
    nome,
    turnos,
    oficial: resOficial,
    experimento: resExp,
    professoresComHAMudando: mudam.size,
    veredito: resExp.janelas < resOficial.janelas ? "melhor" : resExp.janelas === resOficial.janelas ? "empate" : "pior",
  };
}
