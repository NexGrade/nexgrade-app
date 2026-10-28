import { describe, it, expect } from "vitest";
import { montarBlocosReservas, type ReservaCelula } from "../reservas-por-espaco";

const r = (o: Partial<ReservaCelula>): ReservaCelula => ({ local: "Lab. Info. 01", equipamento: false, dia: 0, numeroAula: 1, professor: "Ana Souza", turma: "8ºA", disciplina: "MAT", quantidade: null, pendente: false, ...o });

describe("reservas por espaco [RESERVAS-POR-ESPACO]", () => {
  it("um quadro por espaco e por equipamento, com turma, disciplina e professor", () => {
    const b = montarBlocosReservas([
      r({}),
      r({ dia: 2, numeroAula: 3, turma: null, disciplina: null, pendente: true }),
      r({ local: "Chromebooks", equipamento: true, quantidade: 30, professor: "Rui Lima" }),
      r({ local: "Chromebooks", equipamento: true, quantidade: 10, professor: "Ana Souza", turma: "9ºB", disciplina: "ING" }),
    ], { 1: "07:30", 2: "08:20", 3: "09:10" });
    expect(b.map((x) => x.rotulo)).toEqual(["Espaço: Lab. Info. 01", "Equipamento: Chromebooks"]);
    expect(b[0]!.slots).toContainEqual({ diaSemana: 0, numeroAula: 1, linha1: "8ºA · MAT", linha2: "Ana Souza", destacado: false });
    expect(b[0]!.slots).toContainEqual({ diaSemana: 2, numeroAula: 3, linha1: "Reserva", linha2: "Ana Souza (aguard.)", destacado: true });
    expect(b[1]!.slots[0]).toMatchObject({ linha1: "8ºA · MAT / 9ºB · ING", linha2: "Rui Lima (30) / Ana Souza (10)" });
  });
});
