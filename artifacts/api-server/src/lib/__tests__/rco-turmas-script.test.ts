import { describe, it, expect } from "vitest";
import { turmasQuePrecisamDoScript } from "../rco-turmas-script";

const r = (codTurma: number, turmaRco: string, diaSemana: number, hora: string, coddisc: number, disciplinaNome: string) =>
  ({ codTurma, turmaRco, diaSemana, hora, coddisc, disciplinaNome });

describe("turmasQuePrecisamDoScript", () => {
  it("aponta trio no mesmo horario e disciplinas diferentes com o mesmo codigo; o resto vai pelo XML", () => {
    const regs = [
      // 2NC: trio seg 19:35
      r(2692280, "2NC", 0, "19:35", 5096, "Programação"), r(2692280, "2NC", 0, "19:35", 6322, "Física e Tecnociência"),
      r(2692280, "2NC", 0, "19:35", 2595, "Robótica"), r(2692280, "2NC", 0, "18:45", 27, "Filosofia"),
      // 1ME DOC: Pratica Turma 01 (seg) e Turma 02 (sex) com o mesmo codigo 1269
      r(2729930, "1ME DOC", 0, "13:05", 1269, "Prática de Formação (Est. Supe) - Turma 01"),
      r(2729930, "1ME DOC", 4, "13:05", 1269, "Prática de Formação (Est. Supe) - Turma 02"),
      // 1NF ADM: comum (a mesma disciplina duas vezes nao conta)
      r(2724039, "1NF ADM", 0, "20:35", 2, "Matemática"), r(2724039, "1NF ADM", 0, "22:10", 2, "Matemática"),
    ];
    expect(turmasQuePrecisamDoScript(regs)).toEqual([
      { codTurma: "2729930", turma: "1ME DOC", motivos: ["mesmo código 1269: Prática de Formação (Est. Supe) - Turma 01 / Prática de Formação (Est. Supe) - Turma 02"] },
      { codTurma: "2692280", turma: "2NC", motivos: ["trio/dupla: Seg 19:35 (3 disciplinas)"] },
    ]);
  });
});
