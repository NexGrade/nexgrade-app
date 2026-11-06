import { describe, it, expect } from "vitest";
import { montarDia, resumirMes, slotDaTurma, chaveMarca, rotuloTurmas, type AulaGrade, type SlotEsquema } from "../presenca";

const slots: SlotEsquema[] = [
  { turno: "matutino", nivelEnsino: "medio_tecnico", numeroAula: 1, horaInicio: "07:30:00", duracaoMinutos: 50, letivo: true },
  { turno: "matutino", nivelEnsino: "medio_tecnico", numeroAula: 2, horaInicio: "08:20:00", duracaoMinutos: 50, letivo: true },
  { turno: "matutino", nivelEnsino: "fundamental", numeroAula: 1, horaInicio: "07:40:00", duracaoMinutos: 50, letivo: true },
  { turno: "noturno", nivelEnsino: null, numeroAula: 2, horaInicio: "18:40:00", duracaoMinutos: 50, letivo: true },
];
const profs = [{ id: 1, nome: "Bruna" }, { id: 2, nome: "Ana" }, { id: 3, nome: "Carlos" }];
const aula = (p: number, n: number, turma: string, extra: Partial<AulaGrade> = {}): AulaGrade =>
  ({ professorId: p, numeroAula: n, turno: "matutino", nivelEnsino: "medio_tecnico", turma, disciplina: "MAT", sala: "", ...extra });

describe("presenca dos professores [PRESENCA-PEDAGOGIA]", () => {
  it("usa o horario do nivel da turma no matutino", () => {
    expect(slotDaTurma(slots, "matutino", "fundamental", 1)?.horaInicio).toBe("07:40:00");
    expect(slotDaTurma(slots, "matutino", "medio_tecnico", 1)?.horaInicio).toBe("07:30:00");
    expect(slotDaTurma(slots, "noturno", null, 2)?.horaInicio).toBe("18:40:00");
  });

  it("monta o dia por professor (ordem alfabetica), junta turmas na mesma aula e traz a marcacao", () => {
    const marcas = new Map([[chaveMarca(1, 2), { status: "falta" as const, substitutoId: null, substitutoNome: null, observacao: "atestado" }]]);
    const dia = montarDia(profs, [aula(1, 2, "1ºA"), aula(1, 2, "1ºB", { sala: "Lab" }), aula(1, 1, "2ºA"), aula(2, 1, "6ºA", { nivelEnsino: "fundamental" }), aula(3, 2, "3ºA", { turno: "noturno" })], slots, marcas, new Map([[2, "Licença médica"]]), "matutino");
    expect(dia.map((d) => d.nome)).toEqual(["Ana", "Bruna"]); // Carlos so tem aula a noite
    expect(dia[0]).toMatchObject({ licenca: "Licença médica", aulas: [{ numeroAula: 1, hora: "07:40", fim: "08:30", turmas: "6ºA" }] });
    expect(dia[1]!.aulas).toEqual([
      expect.objectContaining({ numeroAula: 1, hora: "07:30", turmas: "2ºA", marca: null }),
      expect.objectContaining({ numeroAula: 2, hora: "08:20", turmas: "1ºA + 1ºB", sala: "Lab", marca: expect.objectContaining({ status: "falta", observacao: "atestado" }) }),
    ]);
  });

  it("[PRESENCA-ASS-HA] mostra assincrona e HA; no mesmo horario a aula presencial vence; HA usa o nivel das aulas dele", () => {
    const dia = montarDia(profs, [
      aula(1, 1, "6ºA", { nivelEnsino: "fundamental" }),
      aula(1, 2, "7ºA", { tipo: "assincrona", nivelEnsino: "fundamental" }),
      aula(1, 2, "", { tipo: "ha", nivelEnsino: null, disciplina: "HA" }),
      aula(1, 1, "", { tipo: "ha", nivelEnsino: null, disciplina: "HA" }),
      aula(2, 1, "", { tipo: "ha", nivelEnsino: null, disciplina: "HA*" }),
    ], slots, new Map(), new Map(), "matutino", new Map([[1, "saiu mais cedo"]]));
    expect(dia.map((d) => [d.nome, d.observacao])).toEqual([["Ana", null], ["Bruna", "saiu mais cedo"]]);
    expect(dia[0]!.aulas).toEqual([expect.objectContaining({ numeroAula: 1, tipo: "ha", disciplinas: "HA*", hora: "07:30" })]);
    expect(dia[1]!.aulas).toEqual([
      expect.objectContaining({ numeroAula: 1, tipo: "aula", turmas: "6ºA", hora: "07:40" }),
      expect.objectContaining({ numeroAula: 2, tipo: "assincrona", turmas: "7ºA" }),
    ]);
  });

  it("[PRESENCA-HIBRIDA] traz presencial/suporte do trio; turmas juntas: presencial se for em alguma", () => {
    const dia = montarDia(profs, [
      aula(1, 1, "1ºA", { trio: "suporte" }), aula(1, 1, "1ºB", { trio: "presencial" }),
      aula(1, 2, "2ºA", { trio: "suporte" }),
      aula(1, 3, "3ºA"),
    ], slots, new Map(), new Map(), "matutino");
    expect(dia[0]!.aulas.map((a) => [a.numeroAula, a.trio])).toEqual([[1, "presencial"], [2, "suporte"], [3, null]]);
    expect(rotuloTurmas(dia[0]!.aulas[1]!)).toBe("2ºA (híbrida, suporte)");
  });

  it("resume o mes por professor e conta quem substituiu", () => {
    const r = resumirMes([
      { professorId: 1, status: "falta", substitutoId: null },
      { professorId: 1, status: "substituido", substitutoId: 3 },
      { professorId: 1, status: "presente", substitutoId: null },
      { professorId: 2, status: "atraso", substitutoId: null },
    ], new Map(profs.map((p) => [p.id, p.nome])));
    expect(r).toEqual([
      expect.objectContaining({ professor: "Ana", atraso: 1, marcadas: 1 }),
      expect.objectContaining({ professor: "Bruna", falta: 1, substituido: 1, presente: 1, marcadas: 3 }),
      expect.objectContaining({ professor: "Carlos", substituiu: 1, marcadas: 0 }),
    ]);
  });
});
