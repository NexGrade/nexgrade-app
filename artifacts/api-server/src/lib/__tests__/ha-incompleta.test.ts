import { describe, it, expect } from "vitest";
import { professoresComHAIncompleta } from "../ha-incompleta";

const ha = (professorId: number, turno: string | null, horaAtividadeObrigatoria = true) => ({ professorId, turno, horaAtividadeObrigatoria });

describe("[HA-INCOMPLETA-REFAZ] professoresComHAIncompleta", () => {
  it("professor sem nenhuma HA no turno (regra pede 2) entra", () => {
    const r = professoresComHAIncompleta([ha(1, "matutino"), ha(1, "matutino")], [], ["matutino"]);
    expect([...r]).toEqual([1]);
  });

  it("HA completa (mesma quantidade, mesmo em outro lugar) nao entra", () => {
    expect(professoresComHAIncompleta([ha(1, "matutino"), ha(1, "matutino")], [ha(1, "matutino"), ha(1, "matutino")], ["matutino"]).size).toBe(0);
  });

  it("so olha os turnos do experimento e ignora linha que nao e HA", () => {
    const ideal = [ha(1, "matutino"), ha(2, "vespertino")];
    const hoje = [ha(1, "matutino", false)];
    expect([...professoresComHAIncompleta(ideal, hoje, ["matutino"])]).toEqual([1]);
  });

  it("HA a mais do que a regra tambem entra (a quantidade tem que ser a da regra)", () => {
    expect([...professoresComHAIncompleta([ha(1, "matutino")], [ha(1, "matutino"), ha(1, "matutino")], ["matutino"])]).toEqual([1]);
  });

  it("HA num turno do experimento onde a regra nao poe nenhuma entra", () => {
    expect([...professoresComHAIncompleta([], [ha(3, "matutino")], ["matutino"])]).toEqual([3]);
  });
});
