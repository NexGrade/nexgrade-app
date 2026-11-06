import { describe, it, expect } from "vitest";
import { montarDia, resumirMes, slotDaTurma, chaveMarca, rotuloTurmas, relatorioPeriodo, percentualPresenca, type RegistroPeriodo, type AulaGrade, type SlotEsquema } from "../presenca";

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

  describe("[PRESENCA-PERIODO] relatorio por periodo", () => {
    const reg = (professorId: number, data: string, numeroAula: number, status: RegistroPeriodo["status"], extra: Partial<RegistroPeriodo> = {}): RegistroPeriodo =>
      ({ data, turno: "matutino", numeroAula, professorId, status, substitutoId: null, substitutoNome: null, observacao: null, ...extra });
    const registros = [
      reg(1, "2026-11-03", 2, "falta"), reg(1, "2026-11-03", 1, "presente"), reg(1, "2026-11-04", 1, "substituido", { substitutoId: 3 }),
      reg(2, "2026-11-03", 1, "atraso"),
    ];
    const observacoes = [{ data: "2026-11-03", turno: "matutino", professorId: 1, observacao: "atestado" }, { data: "2026-11-05", turno: "vespertino", professorId: 2, observacao: "reuniao" }];
    const nomes = new Map(profs.map((p) => [p.id, p.nome]));
    const base = { de: "2026-11-01", ate: "2026-11-30", registros, observacoes, nomes };

    it("% de presenca conta presente + atraso sobre as marcadas", () => {
      expect(percentualPresenca({ presente: 1, atraso: 0, marcadas: 3 })).toBe("33,3%");
      expect(percentualPresenca({ presente: 0, atraso: 0, marcadas: 0 })).toBe("—");
    });

    it("geral: uma linha por professor, TOTAL e as ocorrencias em ordem com a observacao do dia", () => {
      const t = relatorioPeriodo({ ...base, tipo: "geral" });
      expect(t.titulo).toBe("Presença dos professores — Geral — 01/11/2026 a 30/11/2026");
      expect(t.linhas.slice(0, 4).map((l) => l.celulas.slice(0, 8))).toEqual([
        ["Ana", "0", "0", "1", "0", "0", "1", "100%"],
        ["Bruna", "1", "1", "0", "1", "0", "3", "33,3%"],
        ["Carlos", "0", "0", "0", "0", "1", "0", "—"],
        ["TOTAL", "1", "1", "1", "1", "1", "4", "50%"],
      ]);
      const ocorr = t.linhas.slice(6).map((l) => [l.celulas[0], l.celulas[1], l.celulas[3], l.celulas[4], l.celulas[5]]);
      expect(ocorr).toEqual([
        ["Ana", "03/11/2026", "Atraso", "", ""],
        ["Bruna", "03/11/2026", "Falta", "", "atestado"],
        ["Bruna", "04/11/2026", "Substituído", "Carlos", ""],
      ]);
    });

    it("individual: bloco por professor, aula a aula, observacao geral uma vez por dia e dia so com observacao", () => {
      const t = relatorioPeriodo({ ...base, tipo: "individual" });
      expect(t.linhas.filter((l) => l.grupo).map((l) => l.celulas[0]!.split(" — ")[0])).toEqual(["Ana", "Bruna"]);
      const bruna = t.linhas.slice(t.linhas.findIndex((l) => l.celulas[0]!.startsWith("Bruna")) + 1).map((l) => [l.celulas[0], l.celulas[2], l.celulas[3], l.celulas[5]]);
      expect(bruna).toEqual([["03/11/2026", "1ª", "Presente", "atestado"], ["03/11/2026", "2ª", "Falta", ""], ["04/11/2026", "1ª", "Substituído", ""]]);
      expect(t.linhas[1]!.celulas.slice(0, 4)).toEqual(["03/11/2026", "Manhã", "1ª", "Atraso"]);
      expect(t.linhas[2]!.celulas).toEqual(["05/11/2026", "Tarde", "—", "Observação", "", "reuniao"]);
      const so = relatorioPeriodo({ ...base, tipo: "individual", professorId: 3 });
      expect(so.titulo.endsWith("— Carlos")).toBe(true);
      expect(so.linhas).toEqual([]);
    });

    it("total: numeros da escola e por turno", () => {
      const t = relatorioPeriodo({ ...base, tipo: "total" });
      const v = Object.fromEntries(t.linhas.map((l) => [l.celulas[0], l.celulas[1]]));
      expect(v).toMatchObject({ "Aulas marcadas": "4", Falta: "1", "% de presença (presente + atraso)": "50%", "Dias com marcação": "2", "Professores com pelo menos uma falta": "1", "Observações do dia registradas": "2" });
      expect(v["Manhã: aulas marcadas · faltas · atrasos · substituídas"]).toBe("4 · 1 · 1 · 1");
    });
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
