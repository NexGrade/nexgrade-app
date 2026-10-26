import { describe, it, expect, vi } from "vitest";

vi.mock("@workspace/db", () => ({ db: {}, horarioSlotsTable: {} }));

import { calcularMapaIntegral, slotReal } from "../turno-integral";

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
});
