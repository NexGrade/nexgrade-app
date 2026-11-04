import { describe, expect, it } from "vitest";
import { reposicionarHAMovel, slotsLetivosPorTurno, turnosAfetadosPelaHA, haForaDoTurnoDoExperimento, type AulaPos, type DispLinha } from "../reposicionar-ha";

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

  it("HA manual (marcada na tela) muda de lugar para fechar janela e mantem o texto", () => { // [HA-MANUAL-MOVEL]
    const r = rodar([aula(0, 1), aula(0, 2), aula(0, 4)], [ha(0, 6, "HA manual (definida na tela)")]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ diaSemana: 0, horarioSlot: 3 });
    expect(r[0]!.linha.motivo).toBe("HA manual (definida na tela)");
  });

  it("[MESMA-PESSOA-HA] aula do cadastro secundario ocupa o horario: a HA nao vai para cima dela", () => {
    // principal (1) tem aula na 1 e na 4; o secundario (2) tem a 2 e a 3; HA na 6. Sem o mapa, a HA ia para a 2 ou a 3
    // (em cima da aula do 2); com o mapa, o unico buraco e a 5
    const aulas = [aula(0, 1), aula(0, 4), aula(0, 2, M, 2), aula(0, 3, M, 2)];
    const r = reposicionarHAMovel({ aulas, disp: [ha(0, 6)], slotsLetivos: slots, turnos: [M], professores: [1], principal: new Map([[1, 1], [2, 1]]) });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ diaSemana: 0, horarioSlot: 5 });
    const semMapa = reposicionarHAMovel({ aulas, disp: [ha(0, 6)], slotsLetivos: slots, turnos: [M], professores: [1] });
    expect([2, 3]).toContain(semMapa[0]?.horarioSlot);
  });

  it("[BLOQUEIO-SEM-TURNO] bloqueio sem turno vale no turno: a HA nao vai para la", () => {
    const semTurno: DispLinha = { professorId: 1, turno: null, diaSemana: 0, horarioSlot: 3, disponivel: false, horaAtividadeObrigatoria: false, motivo: "Indisponivel" };
    // aulas 1, 2, 4, 5; HA na 6; o unico buraco e a 3, bloqueada sem turno: a HA fica onde esta (antes ia para a 3)
    expect(rodar([aula(0, 1), aula(0, 2), aula(0, 4), aula(0, 5)], [semTurno, ha(0, 6)])).toHaveLength(0);
  });

  it("nao mexe em HA fixa nem probatorio", () => {
    for (const motivo of ["HA fixa (definida manualmente)", "Importado do sistema anterior 21/10 (H.A.) - estagio probatorio", "Importado do sistema anterior 02-06/11 (HA) - estagio probatorio", null]) {
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

// [HA-OUTRO-TURNO] (03/11/2026) promover a tarde refaz a HA de quem mudou tambem na manha (HA* e quem da aula nos dois)
describe("turnosAfetadosPelaHA", () => {
  it("inclui o turno em que ficou HA de quem teve aula mexida, e so dele", () => {
    const ha = [{ professorId: 1, turno: "matutino" }, { professorId: 2, turno: "noturno" }, { professorId: 1, turno: "integral" }];
    expect(turnosAfetadosPelaHA(["vespertino"], ha, new Set([1]))).toEqual(["vespertino", "matutino"]);
    expect(turnosAfetadosPelaHA(["vespertino"], ha, new Set())).toEqual(["vespertino"]);
  });
});

// [HA-SO-NO-TURNO-DO-EXPERIMENTO] (04/11/2026) promover a manha so muda a HA da tarde no que a manha mudou
describe("haForaDoTurnoDoExperimento", () => {
  const V = "vespertino";
  const h = (dia: number, n: number, turno = V, professorId = 1) => ({ professorId, turno, diaSemana: dia, horarioSlot: n });
  const onde = (rows: Array<{ diaSemana: number; horarioSlot: number }> | undefined) => (rows ?? []).map((x) => `${x.diaSemana}/${x.horarioSlot}`).sort();
  // tarde do Diego Cardoso (Demonstracao): ter 1a aula, HA 2-3-4, 5a aula; sex HA 2 e 4 (5 HA; a conta da 4)
  const aulas = [aula(1, 1, V), aula(1, 5, V), aula(4, 1, V), aula(4, 3, V), aula(4, 5, V)];
  const hoje = [h(1, 2), h(1, 3), h(1, 4), h(4, 2), h(4, 4)];
  const quatro = [h(1, 2), h(1, 4), h(4, 2), h(4, 4)];
  const roda = (recalc: ReturnType<typeof h>[], recalcHoje: ReturnType<typeof h>[]) =>
    onde(haForaDoTurnoDoExperimento(hoje, recalc, recalcHoje, aulas, [M], new Set([1])).get("1|vespertino"));
  it("a manha nao mudou a conta da tarde: fica a HA de hoje (nem a sobra importada sai)", () => {
    expect(roda([h(0, 1), h(0, 2), h(2, 1), h(2, 2)], quatro)).toEqual(onde(hoje));
  });
  it("a manha tirou uma HA da tarde: sai uma das de hoje, as outras ficam no lugar", () => {
    const fica = roda([h(1, 2), h(1, 4), h(4, 2)], quatro);
    expect(fica).toHaveLength(4);
    expect(fica.every((x) => onde(hoje).includes(x))).toBe(true);
  });
  it("sobra da manha (HA*): soma a nova sem mexer nas de hoje", () => {
    expect(roda([...quatro, h(2, 1)], quatro)).toEqual(onde([...hoje, h(2, 1)]));
  });
  it("tira primeiro a HA da ponta do dia, que nao abre janela", () => {
    const aulasPonta = [aula(1, 1, V), aula(1, 2, V)]; // ter: aulas 1-2, HA 3 e 4 (a 4 e a ponta)
    const r = haForaDoTurnoDoExperimento([h(1, 3), h(1, 4)], [h(1, 3)], [h(1, 3), h(1, 4)], aulasPonta, [M], new Set([1]));
    expect(onde(r.get("1|vespertino"))).toEqual(["1/3"]);
  });
  it("nao vale para o turno do experimento nem para quem nao teve aula mexida", () => {
    const r = haForaDoTurnoDoExperimento([h(0, 1, M), h(0, 2, V, 2)], [], [], aulas, [M], new Set([1]));
    expect(r.size).toBe(0);
  });
});
