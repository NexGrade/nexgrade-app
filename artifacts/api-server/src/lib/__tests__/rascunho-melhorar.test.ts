import { describe, it, expect } from "vitest";
import { aulasDePartidaDoMelhorar } from "../rascunho-melhorar";

// [RASCUNHO-MELHORAR] (06/11/2026) o Melhorar dentro do rascunho parte da grade do rascunho
const aula = (id: number, turmaId: number, disciplinaId: number, professorId: number, diaSemana: number, numeroAula: number) =>
  ({ id, turmaId, disciplinaId, professorId, diaSemana, numeroAula });

describe("aulas de partida do Melhorar [RASCUNHO-MELHORAR]", () => {
  const oficiais = [aula(1, 10, 100, 7, 0, 1), aula(2, 10, 100, 7, 0, 2), aula(3, 20, 200, 8, 1, 1)];

  it("nas turmas do rascunho usa as aulas dele (professor e lugar trocados); nas outras, as oficiais", () => {
    const rascunho = [aula(1, 10, 100, 9, 2, 3), aula(2, 10, 100, 9, 0, 2)]; // turma 10: Bia (9) no lugar da Ana (7), uma aula mudou de lugar
    const r = aulasDePartidaDoMelhorar(oficiais, rascunho, []);
    expect(r.map((h) => [h.id, h.turmaId, h.professorId, h.diaSemana, h.numeroAula])).toEqual([
      [3, 20, 8, 1, 1], [-1, 10, 9, 2, 3], [-2, 10, 9, 0, 2],
    ]);
  });

  it("sem rascunho, so as oficiais; aulas que nao vao ao motor (passthrough) ficam fora tambem no rascunho", () => {
    expect(aulasDePartidaDoMelhorar(oficiais, [], [])).toEqual(oficiais);
    const rascunho = [aula(50, 10, 100, 7, 0, 1), aula(51, 10, 300, 7, 0, 7)];
    const r = aulasDePartidaDoMelhorar(oficiais, rascunho, [aula(4, 10, 300, 7, 0, 7)]);
    expect(r.map((h) => h.id)).toEqual([3, -50]);
  });
});
