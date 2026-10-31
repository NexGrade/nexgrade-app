import { describe, it, expect, vi } from "vitest";

vi.mock("@workspace/db", () => ({ db: {}, horarioSlotsTable: {}, horariosTable: {}, turmasTable: {} }));

import { calcularMapaIntegral, slotReal, mapaIntegralDosSlots, projetarIntegral, idEspelho, aulasIntegraisNoTurno } from "../turno-integral";

// [TURNO-INTEGRAL] esquemas reais do Mario Braga (26/10/2026): matutino Medio/Tecnico
// 07:30 ... 11:55, vespertino 13:05, 13:55, 14:45, 15:50, 16:40; integral no RCO
// 07:30 ... 11:55 + 13:05, 13:55, 15:00, 15:50, 16:40.
const s = (turno: string, numeroAula: number, horaInicio: string, nivelEnsino: string | null = null) =>
  ({ turno, numeroAula, horaInicio, duracaoMinutos: 50, nivelEnsino, letivo: true });

const manha = ["07:30", "08:20", "09:25", "10:15", "11:05"];
const outros = [
  ...manha.map((h, i) => s("matutino", i + 1, h, "fundamental")),
  ...[...manha, "11:55"].map((h, i) => s("matutino", i + 1, h, "medio_tecnico")),
  ...["13:05", "13:55", "14:45", "15:50", "16:40"].map((h, i) => s("vespertino", i + 1, h)),
  ...["18:00", "18:45", "19:35", "20:35", "21:25", "22:10"].map((h, i) => s("noturno", i, h)),
];
const integral = [...manha, "11:55", "13:05", "13:55", "15:00", "15:50", "16:40"].map((h, i) => s("integral", i + 1, h));

describe("turno integral", () => {
  const mapa = calcularMapaIntegral(integral, outros);

  it("liga as 6 aulas da manha ao matutino com o mesmo numero", () => {
    for (let a = 1; a <= 6; a++) expect(mapa.get(a)).toEqual({ turno: "matutino", numeroAula: a });
  });

  it("liga as 5 aulas da tarde ao vespertino, inclusive a de 15:00 (vespertino 14:45)", () => {
    expect(mapa.get(7)).toEqual({ turno: "vespertino", numeroAula: 1 });
    expect(mapa.get(8)).toEqual({ turno: "vespertino", numeroAula: 2 });
    expect(mapa.get(9)).toEqual({ turno: "vespertino", numeroAula: 3 });
    expect(mapa.get(10)).toEqual({ turno: "vespertino", numeroAula: 4 });
    expect(mapa.get(11)).toEqual({ turno: "vespertino", numeroAula: 5 });
  });

  it("aula sem sobreposicao fica sem equivalente", () => {
    const m = calcularMapaIntegral([s("integral", 12, "17:30")], outros);
    expect(m.has(12)).toBe(false);
    expect(slotReal("integral", 12, m)).toEqual({ turno: "integral", numeroAula: 12 });
  });

  it("turma comum continua no proprio turno", () => {
    expect(slotReal("vespertino", 3, mapa)).toEqual({ turno: "vespertino", numeroAula: 3 });
    expect(slotReal("integral", 9, mapa)).toEqual({ turno: "vespertino", numeroAula: 3 });
  });

  // [INTEGRAL-NO-MOTOR] caso real do Mario Braga (29/10/2026): Biologia na 1ME ter 3a aula
  // e a MELHORIA-matutino pondo o mesmo professor numa turma da manha nesse horario
  it("aulas da integral entram como ocupadas no turno real, com o numero da aula do turno", () => {
    const aulas = [
      { turmaId: 380, professorId: 5, diaSemana: 1, numeroAula: 3 }, // ter 3a integral = 3a da manha
      { turmaId: 380, professorId: 5, diaSemana: 0, numeroAula: 9 }, // seg 9a integral = 3a da tarde
      { turmaId: 12, professorId: 5, diaSemana: 1, numeroAula: 3 }, // turma comum: fica de fora
    ];
    const integrais = new Set([380]);
    expect(aulasIntegraisNoTurno(aulas, integrais, mapa, "matutino")).toEqual([{ turmaId: 380, professorId: 5, diaSemana: 1, numeroAula: 3 }]);
    expect(aulasIntegraisNoTurno(aulas, integrais, mapa, "vespertino")).toEqual([{ turmaId: 380, professorId: 5, diaSemana: 0, numeroAula: 3 }]);
    expect(aulasIntegraisNoTurno(aulas, integrais, mapa, "noturno")).toEqual([]);
  });
});

describe("projetarIntegral (visao do professor)", () => {
  // esquema do Mario Braga: integral 11 aulas (3a da tarde as 15:00), manha 6, tarde 5
  const slots = [
    ...["07:30", "08:20", "09:25", "10:15", "11:05", "11:55"].map((h, i) => ({ turno: "matutino", nivelEnsino: "medio_tecnico", numeroAula: i + 1, horaInicio: h, duracaoMinutos: 50 })),
    ...["13:05", "13:55", "14:45", "15:50", "16:40"].map((h, i) => ({ turno: "vespertino", nivelEnsino: null, numeroAula: i + 1, horaInicio: h, duracaoMinutos: 50 })),
    ...["07:30", "08:20", "09:25", "10:15", "11:05", "11:55", "13:05", "13:55", "15:00", "15:50", "16:40"].map((h, i) => ({ turno: "integral", nivelEnsino: null, numeroAula: i + 1, horaInicio: h, duracaoMinutos: 50 })),
  ];
  const mapa = mapaIntegralDosSlots(slots);
  const turmas = [
    { id: 7, nome: "1ME DOC", turno: "integral", nivelEnsino: "medio_tecnico" },
    { id: 8, nome: "7TA", turno: "vespertino", nivelEnsino: "fundamental" },
  ];

  it("leva a aula da tarde do integral para a tarde do professor, numa turma espelho", () => {
    const aulas = [
      { id: 1, turmaId: 7, numeroAula: 9, diaSemana: 0, professorId: 5 }, // 15:00 -> 3a da tarde
      { id: 2, turmaId: 7, numeroAula: 2, diaSemana: 0, professorId: 5 }, // 08:20 -> 2a da manha
      { id: 3, turmaId: 8, numeroAula: 4, diaSemana: 0, professorId: 5 }, // turma comum: nao muda
    ];
    const r = projetarIntegral(turmas, aulas, mapa);
    expect(r.aulas[0]).toMatchObject({ id: 1, turmaId: idEspelho(7, "vespertino"), numeroAula: 3 });
    expect(r.aulas[1]).toMatchObject({ id: 2, turmaId: idEspelho(7, "matutino"), numeroAula: 2 });
    expect(r.aulas[2]).toEqual(aulas[2]);
    const espelhoTarde = r.turmas.find((t) => t.id === idEspelho(7, "vespertino"));
    expect(espelhoTarde).toMatchObject({ nome: "1ME DOC", turno: "vespertino" });
    expect(r.turmas.find((t) => t.id === idEspelho(7, "matutino"))?.nivelEnsino).toBe("medio_tecnico");
    expect(r.turmas.filter((t) => t.id === 7)).toHaveLength(1);
  });

  it("sem turma integral, devolve tudo igual", () => {
    const aulas = [{ turmaId: 8, numeroAula: 1 }];
    const r = projetarIntegral([turmas[1]!], aulas, mapa);
    expect(r.aulas).toBe(aulas);
  });
});
