import { describe, it, expect, vi } from "vitest";

vi.mock("@workspace/db", () => ({ db: {}, horarioSlotsTable: {}, horariosTable: {}, turmasTable: {} }));

import { calcularBloqueiosIntervalo, PARES_TURNO, type AulaReal } from "../intervalo-entre-turnos";
import { calcularMapaIntegral, aulasIntegraisNoTurno } from "../turno-integral";

// [INTERVALO-INTEGRAL] (01/11/2026) esquema do Mario Braga: matutino 1..6, vespertino 1..5,
// integral 1..11 (6 de manha + 5 de tarde). A regra esta desligada (PARES_TURNO vazio);
// os testes passam o par manha->tarde para conferir o calculo quando ela voltar.
const s = (turno: string, numeroAula: number, horaInicio: string) =>
  ({ turno, numeroAula, horaInicio, duracaoMinutos: 50, nivelEnsino: null, letivo: true });
const manha = ["07:30", "08:20", "09:25", "10:15", "11:05", "11:55"];
const tarde = ["13:05", "13:55", "14:45", "15:50", "16:40"];
const mapa = calcularMapaIntegral(
  [...manha, "13:05", "13:55", "15:00", "15:50", "16:40"].map((h, i) => s("integral", i + 1, h)),
  [...manha.map((h, i) => s("matutino", i + 1, h)), ...tarde.map((h, i) => s("vespertino", i + 1, h))],
);
const limites = new Map([["matutino", { primeira: 1, ultima: 6 }], ["vespertino", { primeira: 1, ultima: 5 }]]);
const MANHA_TARDE = [["matutino", "vespertino"]] as const;
const INTEGRAL = 99;

/** Aulas de uma turma integral, convertidas para o horario real do turno, como faz carregarAulasIntegraisNoTurno. */
const integralNoTurno = (turno: string, aulas: Array<{ professorId: number; diaSemana: number; numeroAula: number }>): AulaReal[] =>
  aulasIntegraisNoTurno(aulas.map((a) => ({ ...a, turmaId: INTEGRAL })), new Set([INTEGRAL]), mapa, turno).map((a) => ({ ...a, turno }));

describe("intervalo entre turnos", () => {
  it("esta desligado: sem pares, nao bloqueia nada", () => {
    expect(PARES_TURNO).toHaveLength(0);
    expect(calcularBloqueiosIntervalo("vespertino", limites, [{ professorId: 1, turno: "matutino", diaSemana: 0, numeroAula: 6 }])).toEqual([]);
  });

  it("turma comum: ultima aula da manha bloqueia a 1a da tarde no mesmo dia", () => {
    const r = calcularBloqueiosIntervalo("vespertino", limites, [
      { professorId: 1, turno: "matutino", diaSemana: 0, numeroAula: 6 },
      { professorId: 2, turno: "matutino", diaSemana: 0, numeroAula: 5 },
    ], MANHA_TARDE);
    expect(r).toEqual([{ professorId: 1, dia: 0, aula: 1, motivo: "intervalo matutino->vespertino" }]);
  });

  it("turma integral: a 6a aula dela (11:55) conta como ultima da manha ao gerar a tarde", () => {
    const aulas = integralNoTurno("matutino", [{ professorId: 7, diaSemana: 2, numeroAula: 6 }, { professorId: 8, diaSemana: 2, numeroAula: 5 }]);
    expect(calcularBloqueiosIntervalo("vespertino", limites, aulas, MANHA_TARDE))
      .toEqual([{ professorId: 7, dia: 2, aula: 1, motivo: "intervalo matutino->vespertino" }]);
  });

  it("turma integral: a 7a aula dela (13:05) conta como 1a da tarde ao gerar a manha", () => {
    const aulas = integralNoTurno("vespertino", [{ professorId: 7, diaSemana: 1, numeroAula: 7 }, { professorId: 8, diaSemana: 1, numeroAula: 8 }]);
    expect(calcularBloqueiosIntervalo("matutino", limites, aulas, MANHA_TARDE))
      .toEqual([{ professorId: 7, dia: 1, aula: 6, motivo: "intervalo matutino->vespertino" }]);
  });

  it("nao repete o bloqueio quando turma comum e integral pedem o mesmo", () => {
    const aulas = [
      { professorId: 7, turno: "matutino", diaSemana: 2, numeroAula: 6 },
      ...integralNoTurno("matutino", [{ professorId: 7, diaSemana: 2, numeroAula: 6 }]),
    ];
    expect(calcularBloqueiosIntervalo("vespertino", limites, aulas, MANHA_TARDE)).toHaveLength(1);
  });
});
