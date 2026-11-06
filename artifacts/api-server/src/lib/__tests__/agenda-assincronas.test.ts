import { describe, it, expect } from "vitest";
import { montarAgendaAssincronas, tabelaAgendaAssincronas, type AulaAssincrona, type TrioDaAula } from "../agenda-assincronas";
import type { SlotEsquema } from "../presenca";

// [AGENDA-ASSINCRONAS] (06/11/2026) regra confirmada pela dona: na Hibrida (trio) a assincrona da semana e do
// professor presencial da semana; nas outras, do proprio professor.
const slots: SlotEsquema[] = [
  { turno: "noturno", nivelEnsino: null, numeroAula: 1, horaInicio: "18:40:00", duracaoMinutos: 50, letivo: true },
  { turno: "noturno", nivelEnsino: null, numeroAula: 2, horaInicio: "19:30:00", duracaoMinutos: 50, letivo: true },
];
const nomes = new Map([[1, "Ana"], [2, "Bruna"], [3, "Carlos"], [4, "Dora"]]);
const aula = (professorId: number, disciplinaId: number, disciplina: string, diaSemana: number, numeroAula: number, turmaId = 10): AulaAssincrona =>
  ({ turmaId, turma: "3B-HUM", turno: "noturno", nivelEnsino: null, diaSemana, numeroAula, disciplinaId, disciplina, professorId });
// trio: Sociologia (Ana, 1), Filosofia (Bruna, 2), Historia (Carlos, 3), comecando na segunda 02/11/2026
const trio = new Map<string, TrioDaAula>([
  ["10|1|1", { grupo: "10:T1", ordem: 1, inicio: "2026-11-02" }],
  ["10|2|2", { grupo: "10:T1", ordem: 2, inicio: "2026-11-02" }],
  ["10|3|3", { grupo: "10:T1", ordem: 3, inicio: "2026-11-02" }],
]);
// semanas corridas: 02/11 -> 1, 09/11 -> 2, 16/11 -> 3, 23/11 -> 1
const ordemDaSemana = (inicio: string, data: string) => (Math.floor((Date.parse(data) - Date.parse(inicio)) / (7 * 86_400_000)) % 3) + 1;
const dias = ["2026-11-02", "2026-11-09", "2026-11-10", "2026-11-15", "2026-11-16"].map((data) => ({ data, semAula: data === "2026-11-10" ? "Feriado" : null }));

describe("agenda das assincronas [AGENDA-ASSINCRONAS]", () => {
  const aulas = [
    // trio sincronizado: as 3 assincronas na segunda, 2a aula
    aula(1, 1, "Sociologia", 0, 2), aula(2, 2, "Filosofia", 0, 2), aula(3, 3, "História", 0, 2),
    // assincrona fora de trio (terca): sempre do proprio professor
    aula(4, 4, "Arte", 1, 1),
  ];

  it("no trio fica so a do professor presencial da semana; fora do trio, a do proprio professor; feriado e fim de semana fora", () => {
    const r = montarAgendaAssincronas({ dias, aulas, trio, slots, nomes, ordemDaSemana });
    expect(r.map((l) => [l.data, l.hora, l.disciplina, l.professor])).toEqual([
      ["2026-11-02", "19:30", "Sociologia", "Ana"],
      ["2026-11-09", "19:30", "Filosofia", "Bruna"],
      ["2026-11-16", "19:30", "História", "Carlos"],
    ]);
  });

  it("assincrona do trio fora do horario da vez fica com o presencial da semana", () => {
    const r = montarAgendaAssincronas({ dias: [{ data: "2026-11-09" }], aulas: [aula(1, 1, "Sociologia", 0, 1)], trio, slots, nomes, ordemDaSemana });
    expect(r.map((l) => [l.disciplina, l.professor])).toEqual([["Sociologia", "Bruna"]]);
  });

  it("filtra por professor e monta a tabela por dia (feriado aparece como sem aula)", () => {
    const r = montarAgendaAssincronas({ dias: [...dias, { data: "2026-11-03" }], aulas, trio, slots, nomes, ordemDaSemana, professorId: 4 });
    expect(r.map((l) => [l.data, l.disciplina])).toEqual([["2026-11-03", "Arte"]]);
    const t = tabelaAgendaAssincronas({ de: "2026-11-02", ate: "2026-11-16", dias, linhas: montarAgendaAssincronas({ dias, aulas, trio, slots, nomes, ordemDaSemana }) });
    expect(t.linhas.filter((l) => l.grupo).map((l) => l.celulas[0])).toEqual([
      "Segunda-feira, 02/11/2026", "Segunda-feira, 09/11/2026", "Terça-feira, 10/11/2026 — Feriado (sem aula)", "Segunda-feira, 16/11/2026",
    ]);
    expect(t.linhas[1]!.celulas).toEqual(["Noite", "2ª 19:30", "3B-HUM", "Sociologia (Híbrida)", "Ana"]);
  });
});
