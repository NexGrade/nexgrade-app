import { describe, it, expect } from "vitest";
import { sugerirTrocasParaBloqueios, mesmaOpcaoCiclo } from "../resolver-bloqueio";
import type { AulaExp, Indisponivel } from "../resolver-choque";
import type { SlotHora, TurmaHora } from "../choques-professor";

// [RESOLVER-BLOQUEIO] (12/11/2026) regra pura: uma turma de 1 dia com 3 aulas, Nicolas bloqueado na 3a
const turmas = new Map<number, TurmaHora>([[1, { id: 1, nome: "9MF", turno: "matutino", nivelEnsino: "fundamental" }]]);
const slots: SlotHora[] = [1, 2, 3].map((n) => ({ turno: "matutino", nivelEnsino: "fundamental", numeroAula: n, horaInicio: `0${7 + n}:00:00`, duracaoMinutos: 50 }));
const nomes: Record<number, string> = { 1: "Nicolas", 2: "Thayná", 3: "Ione" };
const discs: Record<number, string> = { 10: "Matemática", 11: "Português", 12: "Ciências" };
let id = 0;
const aula = (disciplinaId: number, professorId: number, numeroAula: number, extra: Partial<AulaExp> = {}): AulaExp =>
  ({ id: ++id, turmaId: 1, disciplinaId, professorId, diaSemana: 0, numeroAula, ...extra });
const bloqueioNicolas: Indisponivel & { bloqueia: boolean } = { professorId: 1, turno: "matutino", diaSemana: 0, horarioSlot: 3, ha: false, bloqueia: true };

function rodar(indisponiveis: Array<Indisponivel & { bloqueia?: boolean }>, exp: AulaExp[] = [aula(11, 2, 1), aula(12, 3, 2), aula(10, 1, 3)]) {
  return sugerirTrocasParaBloqueios({
    exp, fora: [], turmas, slots, indisponiveis,
    aulasValidas: new Map([[1, [1, 2, 3]]]), limite: 50, // os outros dias estao vagos: sem limite alto a opcao com HA ficaria de fora
    nomeProfessor: (i) => nomes[i] ?? `#${i}`, nomeDisciplina: (i) => discs[i] ?? `#${i}`,
  });
}

describe("sugerirTrocasParaBloqueios", () => {
  it("troca simples quando ha quem possa ir para o horario bloqueado", () => {
    const r = rodar([bloqueioNicolas]);
    expect(r).toHaveLength(1);
    expect(r[0]!.texto).toBe("Nicolas tem bloqueio na segunda 3ª aula, onde está a aula da 9MF");
    expect(r[0]!.opcoes[0]!.ciclo.length).toBe(2);
  });

  it("HA movel no destino vai junto para outro horario; HA fixa trava a troca", () => {
    // Ione tem HA movel na 3a: so a Thayna (1a) ou a Ione levando a HA
    const movel = rodar([bloqueioNicolas, { professorId: 3, turno: "matutino", diaSemana: 0, horarioSlot: 3, ha: true, movel: true, motivo: "HA manual (definida na tela)" }]);
    const comHa = movel[0]!.opcoes.find((o) => o.moverHa?.length);
    expect(comHa?.moverHa?.[0]).toMatchObject({ professorId: 3, de: { diaSemana: 0, numeroAula: 3 } });
    // HA fixa da Ione e da Thayna na 3a: nenhuma troca com elas (so levar a aula para um horario vago de outro dia)
    const fixa = rodar([bloqueioNicolas,
      { professorId: 3, turno: "matutino", diaSemana: 0, horarioSlot: 3, ha: true, movel: false, motivo: "HA fixa (definida manualmente)" },
      { professorId: 2, turno: "matutino", diaSemana: 0, horarioSlot: 3, ha: true, movel: false, motivo: "HA fixa (definida manualmente)" }]);
    expect(fixa[0]!.opcoes.length).toBeGreaterThan(0);
    expect(fixa[0]!.opcoes.every((o) => o.ciclo.length === 2 && o.ciclo[1]!.diaSemana !== 0 && !o.moverHa)).toBe(true);
  });

  it("aula sobre HA importada movel nao entra na lista; aula fixa nao se mexe", () => {
    expect(rodar([{ professorId: 1, turno: "matutino", diaSemana: 0, horarioSlot: 3, ha: true, movel: false, bloqueia: false, motivo: "Importado do sistema anterior (H.A.)" }])).toEqual([]);
    const r = rodar([bloqueioNicolas], [aula(11, 2, 1), aula(12, 3, 2), aula(10, 1, 3, { fixa: true })]);
    expect(r[0]!.opcoes).toEqual([]);
  });

  it("mesmaOpcaoCiclo compara turma, ciclo e HA", () => {
    const a = { turmaId: 1, ciclo: [{ diaSemana: 0, numeroAula: 3 }, { diaSemana: 0, numeroAula: 1 }] };
    expect(mesmaOpcaoCiclo(a, { ...a })).toBe(true);
    expect(mesmaOpcaoCiclo(a, { ...a, ciclo: [...a.ciclo].reverse() })).toBe(false);
  });
});
