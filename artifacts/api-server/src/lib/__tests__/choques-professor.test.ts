import { describe, it, expect } from "vitest";
import { choquesDeProfessor, descreverChoques, mensagemDaTravaDeChoque, type SlotHora, type TurmaHora } from "../choques-professor";

// [CHOQUE-ANTES-DE-GRAVAR] (09/11/2026) mesma regra da trava do banco, para avisar antes de gravar
const turmas = new Map<number, TurmaHora>([
  [1, { id: 1, nome: "9MF", turno: "matutino", nivelEnsino: "fundamental" }],
  [2, { id: 2, nome: "1MA", turno: "matutino", nivelEnsino: "medio_tecnico" }],
  [3, { id: 3, nome: "6TA", turno: "vespertino", nivelEnsino: "fundamental" }],
  [4, { id: 4, nome: "INT", turno: "integral", nivelEnsino: "fundamental" }],
]);
const slots: SlotHora[] = [
  { turno: "matutino", nivelEnsino: "fundamental", numeroAula: 1, horaInicio: "07:30:00", duracaoMinutos: 50 },
  { turno: "matutino", nivelEnsino: "fundamental", numeroAula: 2, horaInicio: "08:20:00", duracaoMinutos: 50 },
  { turno: "matutino", nivelEnsino: "medio_tecnico", numeroAula: 1, horaInicio: "07:30:00", duracaoMinutos: 50 },
  { turno: "matutino", nivelEnsino: "medio_tecnico", numeroAula: 2, horaInicio: "08:20:00", duracaoMinutos: 50 },
  { turno: "vespertino", nivelEnsino: null, numeroAula: 1, horaInicio: "13:05:00", duracaoMinutos: 50 },
  { turno: "integral", nivelEnsino: null, numeroAula: 7, horaInicio: "08:20:00", duracaoMinutos: 50 },
];
const aula = (turmaId: number, professorId: number | null, diaSemana: number, numeroAula: number, assincrona = false) =>
  ({ turmaId, professorId, diaSemana, numeroAula, assincrona });

describe("choquesDeProfessor", () => {
  it("acha o professor em duas turmas no mesmo horario real", () => {
    const c = choquesDeProfessor([aula(1, 10, 2, 1), aula(2, 10, 2, 1)], turmas, slots);
    expect(c).toHaveLength(1);
    expect(c[0]!.professorId).toBe(10);
  });

  it("nao acusa horarios diferentes, outro dia, outro turno, a mesma turma nem aula assincrona", () => {
    expect(choquesDeProfessor([aula(1, 10, 2, 1), aula(2, 10, 2, 2)], turmas, slots)).toHaveLength(0);
    expect(choquesDeProfessor([aula(1, 10, 2, 1), aula(2, 10, 3, 1)], turmas, slots)).toHaveLength(0);
    expect(choquesDeProfessor([aula(1, 10, 2, 1), aula(3, 10, 2, 1)], turmas, slots)).toHaveLength(0);
    expect(choquesDeProfessor([aula(1, 10, 2, 1), aula(1, 10, 2, 1)], turmas, slots)).toHaveLength(0);
    expect(choquesDeProfessor([aula(1, 10, 2, 1), aula(2, 10, 2, 1, true)], turmas, slots)).toHaveLength(0);
  });

  it("usa a hora real: a 7a aula da integral (08:20) bate com a 2a da manha", () => {
    expect(choquesDeProfessor([aula(1, 10, 0, 2), aula(4, 10, 0, 7)], turmas, slots)).toHaveLength(1);
  });

  it("sem horario cadastrado, vale o mesmo turno e o mesmo numero de aula", () => {
    expect(choquesDeProfessor([aula(1, 10, 0, 5), aula(2, 10, 0, 5)], turmas, slots)).toHaveLength(1);
  });

  it("com o filtro, so os choques que envolvem as aulas que importam", () => {
    const novas = [aula(1, 10, 2, 1)];
    const antigas = [aula(2, 10, 2, 1), aula(2, 11, 4, 2), aula(1, 11, 4, 2)];
    const c = choquesDeProfessor([...novas, ...antigas], turmas, slots, (a) => novas.includes(a));
    expect(c).toHaveLength(1);
    expect(descreverChoques(c, turmas, () => "Kerolen")).toEqual(["Kerolen: quarta, 1ª aula na 9MF e 1ª aula na 1MA"]);
  });
});

describe("mensagemDaTravaDeChoque", () => {
  it("tira a mensagem da trava do erro do banco (vem no cause)", () => {
    const err = new Error("Failed query: insert into horarios", { cause: new Error("IMPOSSÍVEL SALVAR: O professor selecionado já possui aula alocada na turma 9MF (matutino) neste mesmo horário!") });
    expect(mensagemDaTravaDeChoque(err)).toBe("IMPOSSÍVEL SALVAR: O professor selecionado já possui aula alocada na turma 9MF (matutino) neste mesmo horário!");
    expect(mensagemDaTravaDeChoque(new Error("outra coisa"))).toBeNull();
  });
});
