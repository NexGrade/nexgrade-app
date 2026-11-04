import { describe, it, expect } from "vitest";
import { haDevidaPorTurno } from "../hora-atividade";
import { ehHAOutroTurno } from "../ha-contraturno";
import { professoresQueMudaram } from "../ha-so-quem-mudou";

describe("[HA-DEVIDA-UMA-CONTA] haDevidaPorTurno", () => {
  it("tabela por turno (10 aulas -> 3, 20 -> 6)", () => {
    expect(haDevidaPorTurno({ matutino: 10, vespertino: 20 }, []).porTurno).toEqual({ matutino: 3, vespertino: 6 });
  });

  it("HA presa em turno sem aula e devida la e sai do turno com mais HA", () => {
    const r = haDevidaPorTurno({ matutino: 10, vespertino: 20 }, [{ turno: "noturno" }]);
    expect(r.porTurno).toEqual({ matutino: 3, vespertino: 5 });
    expect(r.contraturno).toEqual({ noturno: 1 });
  });

  it("HA presa no proprio turno nao muda a conta; sem turno tambem desconta", () => {
    expect(haDevidaPorTurno({ matutino: 10 }, [{ turno: "matutino" }]).porTurno).toEqual({ matutino: 3 });
    expect(haDevidaPorTurno({ matutino: 10 }, [{ turno: null }]).porTurno).toEqual({ matutino: 2 });
  });

  it("ignora a chave 'integral' (o chamador projeta no turno real)", () => {
    expect(haDevidaPorTurno({ integral: 10, matutino: 4 }, []).porTurno).toEqual({ matutino: 1 });
  });
});

describe("[HA-ESTRELA-UMA-REGRA] ehHAOutroTurno", () => {
  it("automatica de outro turno e importada (HA*) sao HA*; (HA) e manual nao", () => {
    expect(ehHAOutroTurno("Hora-atividade institucional (recalculada automaticamente) -- HA de outro turno (HA*)")).toBe(true);
    expect(ehHAOutroTurno("Importado do sistema anterior 05-09/10 (HA*)")).toBe(true);
    expect(ehHAOutroTurno("Importado do sistema anterior 05-09/10 (HA)")).toBe(false);
    expect(ehHAOutroTurno("HA manual (definida na tela)")).toBe(false);
    expect(ehHAOutroTurno(null)).toBe(false);
  });
});

describe("[HA-SO-QUEM-MUDOU-GERAL] professoresQueMudaram", () => {
  const h = (professorId: number, turmaId: number, disciplinaId: number, diaSemana: number, numeroAula: number) =>
    ({ professorId, turmaId, disciplinaId, diaSemana, numeroAula }) as never;
  it("so quem teve aula diferente (inclusive troca de disciplina no mesmo horario)", () => {
    const antes = [h(1, 10, 100, 0, 1), h(1, 10, 101, 0, 2), h(2, 11, 200, 1, 1)];
    const depois = [h(1, 10, 101, 0, 1), h(1, 10, 100, 0, 2), h(2, 11, 200, 1, 1)];
    expect([...professoresQueMudaram(antes, depois)]).toEqual([1]);
  });
});
