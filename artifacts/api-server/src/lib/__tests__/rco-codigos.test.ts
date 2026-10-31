import { describe, it, expect } from "vitest";
import { resolverCoddiscComOrigem } from "../rco-codigos";

describe("codigo da disciplina no arquivo do RCO [CODIGOS-RCO-TELA]", () => {
  const sem = { codigoExternoRco: null, externoPeloSae: null };
  it("cadastrado na disciplina vence; depois pelo SAE; depois o dicionario", () => {
    expect(resolverCoddiscComOrigem({ disciplinaNome: "Língua Espanhola", codigoExternoRco: 9, externoPeloSae: 8 })).toEqual({ codigo: 9, origem: "externo" });
    expect(resolverCoddiscComOrigem({ disciplinaNome: "Língua Espanhola", codigoExternoRco: null, externoPeloSae: 8 })).toEqual({ codigo: 8, origem: "sae" });
    expect(resolverCoddiscComOrigem({ disciplinaNome: "Língua Espanhola", ...sem })).toEqual({ codigo: 3826, origem: "dicionario" });
  });
  it("Espanhol e Pratica de Formacao pelo arquivo do RCO [MATRIZ-3A-RCO]", () => {
    expect(resolverCoddiscComOrigem({ disciplinaNome: "Prática de Formação", ...sem })?.codigo).toBe(1269);
  });
  it("nao chuta codigo de nome parecido (Lingua Espanhola I fica sem)", () => {
    expect(resolverCoddiscComOrigem({ disciplinaNome: "Língua Espanhola I", ...sem })).toBeNull();
  });
});
