import { describe, it, expect } from "vitest";
import { horarioRco, noturnoComecaAs18 } from "../../routes/export";

// [RCO-NOTURNO-18H] noturno que começa às 18:00 (Mário Braga) usa o horário da escola; 18:40 (Romário) o fixo do RCO
describe("horário do noturno no arquivo do RCO", () => {
  it("Mário Braga (começa às 18:00): horário real da escola", () => {
    const usar = noturnoComecaAs18(["18:00:00", "18:45:00", "19:35:00", "20:35:00", "21:25:00", "22:10:00"]);
    expect(usar).toBe(true);
    expect(horarioRco("noturno", "18:00", "18:45", usar)).toEqual(["18:00", "18:45"]);
    expect(horarioRco("noturno", "18:45", "19:35", usar)).toEqual(["18:45", "19:35"]);
    expect(horarioRco("noturno", "20:35", "21:25", usar)).toEqual(["20:35", "21:25"]);
  });
  it("Romário (começa às 18:40): horário fixo do RCO, como antes", () => {
    const usar = noturnoComecaAs18(["18:40:00", "19:30:00", "20:35:00", "21:20:00", "22:10:00"]);
    expect(usar).toBe(false);
    expect(horarioRco("noturno", "20:35", "21:25", usar)).toEqual(["20:30", "21:20"]);
  });
  it("manhã e tarde não mudam", () => {
    expect(horarioRco("matutino", "07:30", "08:20")).toEqual(["07:30", "08:20"]);
  });
});
