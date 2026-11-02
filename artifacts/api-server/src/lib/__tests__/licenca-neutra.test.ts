import { describe, it, expect } from "vitest";
import { tipoNeutro, rotuloLicenca, comunicadoDaLicenca } from "../licenca-neutra";

// [LICENCA-SEM-DADO-SENSIVEL] a licenca nao mostra nem espalha dado de saude
describe("licenca sem dado sensivel", () => {
  it("tipo antigo de saude vira afastamento; os tipos neutros ficam", () => {
    expect(tipoNeutro("medica")).toBe("afastamento");
    expect(tipoNeutro("maternidade")).toBe("afastamento");
    expect(tipoNeutro("Licença médica")).toBe("afastamento");
    expect(tipoNeutro(null)).toBe("afastamento");
    expect(tipoNeutro("ferias")).toBe("ferias");
    expect(tipoNeutro("capacitacao")).toBe("capacitacao");
  });

  it("o rotulo do ponto nunca diz o motivo", () => {
    expect(rotuloLicenca("medica")).toBe("Afastado");
    expect(rotuloLicenca("paternidade")).toBe("Afastado");
    expect(rotuloLicenca("ferias")).toBe("Férias");
  });

  it("o comunicado diz so o periodo e o substituto", () => {
    const c = comunicadoDaLicenca("Ana Souza", "2026-11-03", "2026-11-20", "Bruno Lima");
    expect(c.titulo).toBe("Afastamento registrado — Ana Souza");
    expect(c.mensagem).toBe("Professor(a) Ana Souza estará afastado(a) de 03/11/2026 a 20/11/2026. Substituto(a): Bruno Lima.");
    expect(comunicadoDaLicenca("Ana Souza", "2026-11-03", "2026-11-20", null).mensagem).not.toMatch(/Substitut|Motivo/);
  });
});
