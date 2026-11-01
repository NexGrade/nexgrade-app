import { describe, expect, it } from "vitest";
import { reposicionarHAMovel, slotsLetivosPorTurno, type AulaPos, type DispLinha } from "../reposicionar-ha";

// [HA-MOVEL-MELHORIA] casos da regra: HA movel vai para onde tira janela, sem mexer em aula
const M = "matutino";
const slots = slotsLetivosPorTurno([1, 2, 3, 4, 5, 6].map((n) => ({ turno: M, numeroAula: n, letivo: true }))
  .concat([1, 2, 3, 4, 5].map((n) => ({ turno: "vespertino", numeroAula: n, letivo: true }))));
const aula = (dia: number, n: number, turno = M, professorId = 1): AulaPos => ({ professorId, turno, diaSemana: dia, numeroAula: n });
const ha = (dia: number, n: number, motivo: string | null = "Importado do sistema anterior 21/10 (H.A.)", turno = M): DispLinha =>
  ({ professorId: 1, turno, diaSemana: dia, horarioSlot: n, disponivel: true, horaAtividadeObrigatoria: true, motivo });
const blq = (dia: number, n: number, motivo = "Atividade fora de sala (ocupado: FOR)"): DispLinha =>
  ({ professorId: 1, turno: M, diaSemana: dia, horarioSlot: n, disponivel: false, horaAtividadeObrigatoria: false, motivo });
const rodar = (aulas: AulaPos[], disp: DispLinha[]) => reposicionarHAMovel({ aulas, disp, slotsLetivos: slots, turnos: [M], professores: [1] });

describe("reposicionarHAMovel", () => {
  it("leva a HA importada para o buraco entre aulas", () => {
    // seg: aula 1, 2, _, 4 ; HA na 6 -> deve ir para a 3
    const r = rodar([aula(0, 1), aula(0, 2), aula(0, 4)], [ha(0, 6)]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ diaSemana: 0, horarioSlot: 3 });
  });

  it("HA automatica tambem e movel", () => {
    const r = rodar([aula(0, 1), aula(0, 3)], [ha(0, 5, "Hora-atividade institucional (recalculada automaticamente)")]);
    expect(r[0]).toMatchObject({ diaSemana: 0, horarioSlot: 2 });
  });

  it("HA importada do Urania, gravada como (HA) e (HA*), tambem e movel", () => { // [HA-IMPORTADA-FORMATOS]
    for (const motivo of ["Importado do sistema anterior 02-06/11 (HA)", "Importado do sistema anterior 05-09/10 (HA*)"]) {
      const r = rodar([aula(0, 1), aula(0, 2), aula(0, 4)], [ha(0, 6, motivo)]);
      expect(r, motivo).toHaveLength(1);
      expect(r[0]).toMatchObject({ diaSemana: 0, horarioSlot: 3 });
    }
  });

  it("nao mexe em HA fixa, probatorio nem manual", () => {
    for (const motivo of ["HA fixa (definida manualmente)", "Importado do sistema anterior 21/10 (H.A.) - estagio probatorio", "Importado do sistema anterior 02-06/11 (HA) - estagio probatorio", "HA manual (definida na tela)", null]) {
      expect(rodar([aula(0, 1), aula(0, 2), aula(0, 4)], [ha(0, 6, motivo)])).toHaveLength(0);
    }
  });

  it("nao move quando nao diminui janela (empate fica onde esta)", () => {
    expect(rodar([aula(0, 1), aula(0, 2), aula(0, 3)], [ha(0, 4)])).toHaveLength(0);
  });

  it("nunca poe HA em cima de bloqueio nem em dia sem aula", () => {
    // seg: aula 1, _, 3 com bloqueio na 2 (nao e janela); ter: aula 1, _, 3 sem bloqueio -> vai para ter 2
    const r = rodar([aula(0, 1), aula(0, 3), aula(1, 1), aula(1, 3)], [blq(0, 2), ha(0, 6)]);
    expect(r[0]).toMatchObject({ diaSemana: 1, horarioSlot: 2 });
    // seg: aulas 1-2, bloqueio comum 3-4, HA na 5 (2 janelas). Tirar a HA de seg resolveria,
    // mas o professor nao tem aula na ter: a HA nao vai para um dia sem aula
    expect(rodar([aula(0, 1), aula(0, 2)], [blq(0, 3, "Bloqueio (importado)"), blq(0, 4, "Bloqueio (importado)"), ha(0, 5)])).toHaveLength(0);
  });

  it("mantem a quantidade de HA (so muda de lugar)", () => {
    const disp = [ha(0, 6), ha(1, 6), ha(2, 6)];
    const r = rodar([aula(0, 1), aula(0, 3), aula(1, 1), aula(1, 3), aula(2, 1), aula(2, 3)], disp);
    expect(r).toHaveLength(3);
    expect(new Set(r.map((m) => `${m.diaSemana}|${m.horarioSlot}`))).toEqual(new Set(["0|2", "1|2", "2|2"]));
  });

  it("nao usa a ultima aula da manha se ha aula na 1a da tarde no mesmo dia", () => {
    // seg: HA na 1, bloqueio comum na 2, aulas 3-5 -> a 2 e janela; o unico lugar que resolve e a 6
    const disp = [ha(0, 1), blq(0, 2, "Bloqueio (importado)")];
    const manha = [aula(0, 3), aula(0, 4), aula(0, 5)];
    expect(rodar(manha, disp)[0]).toMatchObject({ diaSemana: 0, horarioSlot: 6 });
    expect(rodar([...manha, aula(0, 1, "vespertino")], disp)).toHaveLength(0);
  });

  it("respeita no maximo 3 HA no dia", () => {
    const aulas = [aula(0, 1), aula(0, 6), aula(1, 1), aula(1, 2)];
    const disp = [ha(0, 2), ha(0, 3), ha(0, 4), ha(1, 6)];
    // seg ja tem 3 HA: a HA de ter nao vai para seg 5 (que tiraria a janela de seg)
    const r = rodar(aulas, disp);
    expect(r.some((m) => m.linha.diaSemana === 1 && m.diaSemana === 0)).toBe(false);
  });
});
