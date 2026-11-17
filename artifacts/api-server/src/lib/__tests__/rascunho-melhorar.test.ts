import { describe, it, expect } from "vitest";
import { aulasDePartidaDoMelhorar, professorDoVinculoAtual } from "../rascunho-melhorar";

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

// [MELHORAR-PROFESSOR-NOVO] (17/11/2026) caso do Andre Andreatta: Catia -> Alex em Turmas, aulas ficaram com a Catia
describe("professor do vinculo atual para aula sem vinculo [MELHORAR-PROFESSOR-NOVO]", () => {
  const linha = (turmaId: number, disciplinaId: number, professor: string, assincrona = false) => ({ turmaId, disciplinaId, professor, assincrona });
  const a = (turmaId: number, disciplinaId: number, professor: string | undefined, assincrona = false) => ({ turmaId, disciplinaId, professor, assincrona });

  it("aula do professor antigo passa para o do vinculo; as que casam nao mudam", () => {
    const linhas = [linha(1, 6153, "Alex"), linha(1, 6143, "Alex"), linha(2, 6149, "Alex")];
    const aulas = [a(1, 6153, "Catia"), a(1, 6153, "Catia"), a(1, 6143, "Alex"), a(2, 6149, "Catia")];
    expect([...professorDoVinculoAtual(aulas, linhas)]).toEqual([[0, "Alex"], [1, "Alex"], [3, "Alex"]]);
  });

  it("aula sem professor tambem vai para o do vinculo", () => {
    expect([...professorDoVinculoAtual([a(1, 10, undefined)], [linha(1, 10, "Bia")])]).toEqual([[0, "Bia"]]);
  });

  it("apoio trocado: so a linha do apoio novo esta sem aula, e ela que recebe", () => {
    const linhas = [linha(1, 10, "Ana"), linha(1, 10, "Bia")]; // titular Ana, apoio Bia (antes: Carla)
    const aulas = [a(1, 10, "Ana"), a(1, 10, "Carla")];
    expect([...professorDoVinculoAtual(aulas, linhas)]).toEqual([[1, "Bia"]]);
  });

  it("dois candidatos (dupla com os dois trocados) ou disciplina sem vinculo: nao adivinha", () => {
    const linhas = [linha(1, 10, "Ana"), linha(1, 10, "Bia")];
    expect(professorDoVinculoAtual([a(1, 10, "Carla"), a(1, 10, "Davi")], linhas).size).toBe(0);
    expect(professorDoVinculoAtual([a(1, 99, "Carla")], linhas).size).toBe(0);
  });

  it("presencial e assincrona sao grupos separados", () => {
    const linhas = [linha(1, 10, "Ana"), linha(1, 10, "Bia", true)];
    const aulas = [a(1, 10, "Ana"), a(1, 10, "Carla", true)];
    expect([...professorDoVinculoAtual(aulas, linhas)]).toEqual([[1, "Bia"]]);
  });

  it("professor novo que ja tem aula nessa turma e disciplina nao e candidato", () => {
    const linhas = [linha(1, 10, "Ana")];
    expect(professorDoVinculoAtual([a(1, 10, "Ana"), a(1, 10, "Carla")], linhas).size).toBe(0);
  });
});
