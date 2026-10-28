import { describe, it, expect, vi } from "vitest";
vi.mock("@workspace/db", () => ({ db: {} }));
import { gerarSiglaDisciplina, siglaForaDoPadrao, siglaParaDisciplina } from "../sigla-disciplina";

describe("sigla de disciplina no padrao NexGrade [SIGLA-UNICA]", () => {
  it("gera 3 letras por palavra, com ponto, e romano separado", () => {
    expect(gerarSiglaDisciplina("Gestão Organizacional")).toBe("GES.ORG");
    expect(gerarSiglaDisciplina("História I")).toBe("HIS I");
    expect(gerarSiglaDisciplina("Saúde e Segurança do Trabalho")).toBe("SAU.SEG.TRA");
    expect(gerarSiglaDisciplina("Programação e Monitoramento da Produção I")).toBe("PRO.MON.PRO I");
    expect(gerarSiglaDisciplina("Arte")).toBe("ART");
  });
  it("reconhece sigla so de iniciais", () => {
    expect(siglaForaDoPadrao("BI", "Biologia II")).toBe(false); // uma palavra + romano
    expect(siglaForaDoPadrao("FATF", "Filosofia Análises de Textos Filosóficos")).toBe(true);
    expect(siglaForaDoPadrao("LEI", "Língua Espanhola I")).toBe(true);
    expect(siglaForaDoPadrao("PAEE", "PAEE")).toBe(false);
    expect(siglaForaDoPadrao("GES.ORG", "Gestão Organizacional")).toBe(false);
  });
  it("padrao pelo codigo vence; depois a das outras escolas; depois a digitada; senao gera", () => {
    const ref = { porCodigo: new Map([[6025, "COM.VEN"]]), porNome: new Map([["oratoria", "ORA"]]) };
    expect(siglaParaDisciplina(ref, 3811, "História I", "HI")).toBe("HIS I");
    expect(siglaParaDisciplina(ref, 6025, "Comunicação e Vendas", "CV")).toBe("COM.VEN");
    expect(siglaParaDisciplina(ref, null, "Oratória", "OR")).toBe("ORA");
    expect(siglaParaDisciplina(ref, null, "Robótica Educacional", "rob.edu")).toBe("ROB.EDU");
    expect(siglaParaDisciplina(ref, null, "Noções de Contabilidade", "NC")).toBe("NOC.CON");
    expect(siglaParaDisciplina(null, null, "Empreendedorismo")).toBe("EMP");
  });
});
