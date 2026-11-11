import { describe, it, expect } from "vitest";
import { sugerirTrocasParaChoques, type AulaExp, type Indisponivel } from "../resolver-choque";
import type { SlotHora, TurmaHora } from "../choques-professor";

// [RESOLVER-CHOQUE] (11/11/2026) caso parecido com o do Romario: Nicolas na 9ME e na 9MF na terca 3a
const turmas = new Map<number, TurmaHora>([
  [1, { id: 1, nome: "9ME", turno: "matutino", nivelEnsino: "fundamental" }],
  [2, { id: 2, nome: "9MF", turno: "matutino", nivelEnsino: "fundamental" }],
  [3, { id: 3, nome: "1MA", turno: "matutino", nivelEnsino: "medio_tecnico" }],
]);
const slots: SlotHora[] = [1, 2, 3, 4].flatMap((n) => [
  { turno: "matutino", nivelEnsino: "fundamental", numeroAula: n, horaInicio: `0${7 + n}:00:00`, duracaoMinutos: 50 },
  { turno: "matutino", nivelEnsino: "medio_tecnico", numeroAula: n, horaInicio: `0${7 + n}:00:00`, duracaoMinutos: 50 },
]);
const P = { nicolas: 1, thayna: 2, fabio: 3, ione: 4, roberto: 5 };
const nomes: Record<number, string> = { 1: "Nicolas", 2: "Thayná", 3: "Fábio", 4: "Ione", 5: "Roberto" };
const D = { mat: 10, por: 11, arte: 12, cie: 13, his: 14 };
const discs: Record<number, string> = { 10: "Matemática", 11: "Português", 12: "Arte", 13: "Ciências", 14: "História" };
let id = 0;
const aula = (turmaId: number, disciplinaId: number, professorId: number, diaSemana: number, numeroAula: number, extra: Partial<AulaExp> = {}): AulaExp =>
  ({ id: ++id, turmaId, disciplinaId, professorId, diaSemana, numeroAula, ...extra });

function cenario(extra: { exp?: AulaExp[]; indisponiveis?: Indisponivel[] } = {}) {
  const TER = 1;
  const exp: AulaExp[] = extra.exp ?? [
    // 9ME: Nicolas na 1a e na 3a, Thayna na 2a
    aula(1, D.mat, P.nicolas, TER, 1), aula(1, D.por, P.thayna, TER, 2), aula(1, D.mat, P.nicolas, TER, 3),
    // 9MF: Arte (Fabio) 1a, Ciencias (Ione) 2a, Matematica (Nicolas) 3a = choque, Historia (Roberto) 4a
    aula(2, D.arte, P.fabio, TER, 1), aula(2, D.cie, P.ione, TER, 2), aula(2, D.mat, P.nicolas, TER, 3), aula(2, D.his, P.roberto, TER, 4),
  ];
  return sugerirTrocasParaChoques({
    exp, fora: [], turmas, slots,
    indisponiveis: extra.indisponiveis ?? [{ professorId: P.ione, turno: "matutino", diaSemana: TER, horarioSlot: 3, ha: false }],
    aulasValidas: new Map([[1, [1, 2, 3, 4]], [2, [1, 2, 3, 4]]]),
    nomeProfessor: (i) => nomes[i] ?? `#${i}`, nomeDisciplina: (i) => discs[i] ?? `#${i}`,
  });
}
const lugares = (r: ReturnType<typeof cenario>) => r[0]!.opcoes.map((o) => `${o.turmaId}:${o.de.diaSemana}-${o.de.numeroAula}>${o.para.diaSemana}-${o.para.numeroAula}`);

describe("sugerirTrocasParaChoques", () => {
  it("lista so as trocas que tiram o choque sem criar outro, sem cair em bloqueio", () => {
    const r = cenario();
    expect(r).toHaveLength(1);
    expect(r[0]!.texto).toBe("Nicolas: terça, 3ª aula na 9ME e 3ª aula na 9MF");
    const l = lugares(r);
    // 9MF 3a <-> 4a (Roberto livre na 3a): vale
    expect(l).toContain("2:1-3>1-4");
    // 9ME 3a <-> 4a (vago na 9ME): vale
    expect(l).toContain("1:1-3>1-4");
    // 9MF 3a <-> 1a: Nicolas ja esta na 9ME na 1a (choque novo)
    expect(l).not.toContain("2:1-3>1-1");
    // 9MF 3a <-> 2a: Ione bloqueada na 3a
    expect(l).not.toContain("2:1-3>1-2");
    // 9ME 3a <-> 2a: Nicolas na 2a e livre; Thayna vai para a 3a livre: vale
    expect(l).toContain("1:1-3>1-2");
    const t = r[0]!.opcoes.find((o) => o.turmaId === 2 && o.para.numeroAula === 4)!.texto;
    expect(t).toBe("9MF: trocar Matemática (Nicolas) da terça 3ª com História (Roberto) da terça 4ª");
    const vago = r[0]!.opcoes.find((o) => o.turmaId === 1 && o.para.numeroAula === 4 && o.para.diaSemana === 1)!.texto;
    expect(vago).toBe("9ME: levar Matemática (Nicolas) da terça 3ª para a terça 4ª (horário vago)");
  });

  it("aula fixa nao muda de lugar e HA conta como bloqueio", () => {
    const TER = 1;
    const exp = [
      aula(1, D.mat, P.nicolas, TER, 3, { fixa: true }),
      aula(2, D.mat, P.nicolas, TER, 3), aula(2, D.his, P.roberto, TER, 4),
    ];
    const r = cenario({ exp, indisponiveis: [{ professorId: P.roberto, turno: "matutino", diaSemana: TER, horarioSlot: 3, ha: true }] });
    const l = lugares(r);
    expect(l.some((x) => x.startsWith("1:"))).toBe(false); // a da 9ME e fixa
    expect(l).not.toContain("2:1-3>1-4"); // Roberto tem HA na 3a
  });

  it("sem choque, lista vazia", () => {
    const TER = 1;
    expect(cenario({ exp: [aula(1, D.mat, P.nicolas, TER, 1), aula(2, D.mat, P.nicolas, TER, 2)] })).toEqual([]);
  });
});
