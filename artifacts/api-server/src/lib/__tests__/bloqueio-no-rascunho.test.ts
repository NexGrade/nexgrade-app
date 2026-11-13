import { describe, expect, it } from "vitest";
import { aulasEmBloqueio, chaveBloqueio, descreverAulasEmBloqueio, ehHAManualDoRascunho, type LinhaDispBloqueio } from "../bloqueio-no-rascunho";

// [AULA-EM-BLOQUEIO] (12/11/2026) regra pura: que aula conta como "em horario bloqueado" antes de promover
const linha = (o: Partial<LinhaDispBloqueio>): LinhaDispBloqueio => ({
  professorId: 1, diaSemana: 0, horarioSlot: 1, turno: "matutino", disponivel: false, horaAtividadeObrigatoria: false, motivo: null, ...o,
});
const aula = (o: Partial<{ turmaId: number; professorId: number | null; diaSemana: number; numeroAula: number; assincrona: boolean }> = {}) =>
  ({ turmaId: 10, professorId: 1, diaSemana: 0, numeroAula: 1, assincrona: false, ...o });
const posicao = () => ({ turno: "matutino", numeroAula: 1 });

describe("aulasEmBloqueio", () => {
  it("bloqueio de verdade, HA fixa e HA de probatorio contam; HA movel e livre nao", () => {
    const casos: Array<[Partial<LinhaDispBloqueio>, boolean]> = [
      [{ disponivel: false, horaAtividadeObrigatoria: false }, true],
      [{ disponivel: true, horaAtividadeObrigatoria: true, motivo: "HA fixa (definida manualmente)" }, true],
      [{ disponivel: true, horaAtividadeObrigatoria: true, motivo: "HA do estágio probatório" }, true],
      [{ disponivel: true, horaAtividadeObrigatoria: true, motivo: "HA manual (definida na tela)" }, false],
      [{ disponivel: false, horaAtividadeObrigatoria: true, motivo: "Importado do sistema anterior (H.A.)" }, false],
      [{ disponivel: true, horaAtividadeObrigatoria: false }, false],
    ];
    for (const [d, conta] of casos) expect(aulasEmBloqueio({ aulas: [aula()], disp: [linha(d)], posicao })).toHaveLength(conta ? 1 : 0);
  });

  it("aula assincrona, sem professor, de outro turno ou dia nao conta", () => {
    const disp = [linha({})];
    expect(aulasEmBloqueio({ aulas: [aula({ assincrona: true }), aula({ professorId: null }), aula({ diaSemana: 1 })], disp, posicao })).toEqual([]);
    expect(aulasEmBloqueio({ aulas: [aula()], disp, posicao: () => ({ turno: "vespertino", numeroAula: 1 }) })).toEqual([]);
  });

  it("aula oficial de fora so conta se o bloqueio veio do rascunho; dupla linha aparece uma vez", () => {
    const disp = [linha({})];
    expect(aulasEmBloqueio({ aulas: [], aulasSoMudancas: [aula()], disp, chavesDoRascunho: new Set(), posicao })).toEqual([]);
    const chaves = new Set([chaveBloqueio({ professorId: 1, turno: "matutino", diaSemana: 0, horarioSlot: 1 })]);
    expect(aulasEmBloqueio({ aulas: [], aulasSoMudancas: [aula()], disp, chavesDoRascunho: chaves, posicao })).toHaveLength(1);
    expect(aulasEmBloqueio({ aulas: [aula(), aula()], disp, posicao })).toHaveLength(1);
  });

  it("texto para a tela", () => {
    const lista = aulasEmBloqueio({ aulas: [aula({ diaSemana: 2 })], disp: [linha({ diaSemana: 2, motivo: null })], posicao });
    expect(descreverAulasEmBloqueio(lista, () => "9ME", () => "Maria Eloi")).toEqual(["Maria Eloi tem bloqueio na quarta, 1ª aula (manhã), onde está a aula da 9ME."]);
  });
  it("[HA-SOBRE-AULA] HA manual que o rascunho marcou prende o horario; a oficial, a automatica e a importada nao", () => {
    const chaves = new Set([chaveBloqueio({ professorId: 1, turno: "matutino", diaSemana: 0, horarioSlot: 1 })]);
    const ha = (motivo: string) => linha({ disponivel: true, horaAtividadeObrigatoria: true, motivo });
    expect(aulasEmBloqueio({ aulas: [aula()], disp: [ha("HA manual (definida na tela)")], chavesDoRascunho: chaves, posicao })).toHaveLength(1);
    expect(aulasEmBloqueio({ aulas: [aula()], disp: [ha("HA manual (definida na tela)")], chavesDoRascunho: new Set(), posicao })).toEqual([]);
    expect(ehHAManualDoRascunho(ha("Importado do sistema anterior (H.A.)"), chaves)).toBe(false);
    expect(ehHAManualDoRascunho(ha("Hora-atividade institucional (recalculada automaticamente)"), chaves)).toBe(false);
    expect(ehHAManualDoRascunho(linha({ disponivel: true, horaAtividadeObrigatoria: false, motivo: "HA manual (definida na tela)" }), chaves)).toBe(false);
    const lista = aulasEmBloqueio({ aulas: [aula({ diaSemana: 3 })], disp: [ha("HA manual (definida na tela)")].map((d) => ({ ...d, diaSemana: 3 })),
      chavesDoRascunho: new Set([chaveBloqueio({ professorId: 1, turno: "matutino", diaSemana: 3, horarioSlot: 1 })]), posicao });
    expect(descreverAulasEmBloqueio(lista, () => "2STM", () => "Hilda")).toEqual(["Hilda tem HA marcada no rascunho na quinta, 1ª aula (manhã), onde está a aula da 2STM."]);
  });
});
