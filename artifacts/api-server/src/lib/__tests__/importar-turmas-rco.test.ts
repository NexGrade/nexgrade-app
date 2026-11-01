import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { lerExportacaoRco, type ExportacaoRco } from "../rco-exportacao";
import { ligarDisciplinasRco, montarPreviaImportacaoRco, nomeBonito, planejarTurmasRco, type DisciplinaDaEscola } from "../importar-turmas-rco";
import { NOME_PADRAO_POR_CODIGO } from "../nome-padrao-disciplina";
import { SIGLA_PADRAO_POR_CODIGO } from "../sigla-padrao";

// [IMPORTAR-TURMAS-RCO] mesma regra de lib/db/importar-turmas-do-rco.cjs, agora no Painel Master.
const reg = (campos: Record<string, string | number>) =>
  "<REGISTRO>" + Object.entries(campos).map(([k, v]) => `<${k}>${v}</${k}>`).join("") + "</REGISTRO>";
function xml(p: { disciplinas: Array<Record<string, string | number>>; turmas: Array<Record<string, string | number>>; grades: Array<[number, number, number]> }) {
  return `<URANIA><DISCIPLINAS>${p.disciplinas.map(reg).join("")}</DISCIPLINAS>` +
    `<TURMAS>${p.turmas.map(reg).join("")}</TURMAS>` +
    `<GRADES>${p.grades.map(([t, d, a]) => reg({ COD_TURMA: t, COD_DISCIPLINA: d, AULAS: a })).join("")}</GRADES></URANIA>`;
}
const ARQUIVO = xml({
  disciplinas: [
    { CODIGO: 1, NOME: "LINGUA PORTUGUESA", ABREVIATURA: "106" },
    { CODIGO: 2, NOME: "MATEMATICA", ABREVIATURA: "201" },
    { CODIGO: 6, NOME: "EDUCACAO FISICA", ABREVIATURA: "EF" },
    { CODIGO: 3826, NOME: "LINGUA ESPANHOLA", ABREVIATURA: "LEM" },
    { CODIGO: 9999, NOME: "PROJETO DE VIDA", ABREVIATURA: "PV" },
    { CODIGO: 3799, NOME: "MONITORIA", ABREVIATURA: "MON" },
  ],
  turmas: [
    { CODIGO: 100, NOME: "4060_6_1_A", ABREVIATURA: "6A", DIAS: 23456, AULAS: 5, TURNO: "T" },
    { CODIGO: 200, NOME: "0009_3_1_A", ABREVIATURA: "3A", DIAS: 23456, AULAS: 6, TURNO: "M", COD_TURMA_IF: 201 },
    { CODIGO: 201, NOME: "0009_3_1_A", ABREVIATURA: "3A IF", DIAS: 23456, AULAS: 6, TURNO: "M" },
    { CODIGO: 300, NOME: "3041_1_1_A", ABREVIATURA: "MON", DIAS: 23456, AULAS: 2, TURNO: "T" },
    { CODIGO: 400, NOME: "4060_7_1_A", ABREVIATURA: "7A", DIAS: 23456, AULAS: 9, TURNO: "MT" },
  ],
  grades: [
    [100, 1, 5], [100, 2, 5], [100, 6, 2],
    [200, 1, 3], [200, 2, 3], [200, 3826, 2],
    [201, 2, 1], [201, 9999, 2],
    [300, 3799, 2],
  ],
});
const exp = lerExportacaoRco(ARQUIVO) as ExportacaoRco;

describe("plano das turmas do arquivo do RCO", () => {
  it("uma turma por turma do RCO; parte IF junta na FGB; monitoria e integral ficam de fora", () => {
    const p = planejarTurmasRco(exp, false);
    expect(p.plano.map((t) => [t.nome, t.turno, t.serie, t.nivel, t.codigoSere, t.codigoSereIf])).toEqual([
      ["6ºA", "vespertino", "6º Ano", "fundamental", 100, null],
      ["3ºA", "matutino", "3ª Série", "medio_tecnico", 200, 201],
    ]);
    // FGB + IF somadas (Matematica 3 + 1)
    expect(p.plano[1]!.disciplinas).toEqual([{ codigo: 1, aulas: 3 }, { codigo: 2, aulas: 4 }, { codigo: 9999, aulas: 2 }]);
    expect(p.plano[1]!.espanholaFora).toBe(2);
    expect(p.fora).toEqual(["Monitoria: 3041_1_1_A (SERE 300, vespertino)", "turno MT (integral?): 4060_7_1_A (SERE 400)"]);
    expect(p.repetidos).toEqual([]);
  });
  it("com Espanhola, ela entra na turma", () => {
    const p = planejarTurmasRco(exp, true);
    expect(p.plano[1]!.disciplinas).toContainEqual({ codigo: 3826, aulas: 2 });
    expect(p.plano[1]!.espanholaFora).toBe(0);
  });
});

describe("ligação das disciplinas do RCO com as da escola", () => {
  const turmas = planejarTurmasRco(exp, false).plano;
  const d = (id: number, nome: string, codigoSae: string | null = null, codigoExternoRco: number | null = null): DisciplinaDaEscola => ({ id, nome, codigoSae, codigoExternoRco });

  it("ordem: Código Externo, depois SAE (arquivo ou tabela), depois nome; sem par vira disciplina nova", () => {
    const escola = [
      d(10, "Português", null, 1),             // mesmo Codigo Externo
      d(11, "Matemática", "201"),              // SAE do arquivo
      d(12, "Educação Física", "999"),         // SAE pela tabela codigos_rco_disciplina (6 -> 999)
    ];
    const { ligacoes, avisos } = ligarDisciplinasRco(exp, turmas, escola, new Map([[6, 999]]));
    expect(avisos).toEqual([]);
    expect(ligacoes.map((l) => [l.codigo, l.disciplinaId, l.como, l.gravarCodigo, l.nome])).toEqual([
      [1, 10, "codigo externo", false, "Português"],
      [2, 11, "SAE", true, "Matemática"],
      [6, 12, "SAE", true, "Educação Física"],
      [9999, null, "nova", true, "Projeto de Vida"],
    ]);
  });
  it("liga pelo nome (sem acento) só disciplina ainda sem Código Externo", () => {
    const { ligacoes } = ligarDisciplinasRco(exp, turmas, [d(20, "Matemática"), d(21, "Língua Portuguesa", null, 77)], new Map());
    expect(ligacoes.find((l) => l.codigo === 2)).toMatchObject({ disciplinaId: 20, como: "nome" });
    // "Lingua Portuguesa" ja tem outro codigo: nao liga e nao cria outra com o mesmo nome -> aviso
    expect(ligacoes.find((l) => l.codigo === 1)).toBeUndefined();
  });
  it("disciplina nova usa o nome do padrão NexGrade", () => {
    const { ligacoes } = ligarDisciplinasRco(exp, turmas, [], new Map());
    expect(ligacoes.find((l) => l.codigo === 1)).toMatchObject({ disciplinaId: null, nome: NOME_PADRAO_POR_CODIGO[1] });
  });
  it("duas candidatas: avisa; desempata pelo nome igual", () => {
    const r1 = ligarDisciplinasRco(exp, turmas, [d(30, "Matemática", "201"), d(31, "Matemática II", "201")], new Map());
    expect(r1.ligacoes.find((l) => l.codigo === 2)).toMatchObject({ disciplinaId: 30 });
    const r2 = ligarDisciplinasRco(exp, turmas, [d(30, "Mat A", "201"), d(31, "Mat B", "201")], new Map());
    expect(r2.ligacoes.find((l) => l.codigo === 2)).toBeUndefined();
    expect(r2.avisos[0]).toMatch(/^2 MATEMATICA: 2 disciplinas candidatas/);
  });
  it("dois códigos do RCO na mesma disciplina da escola: aviso", () => {
    // Matematica (SAE 201 no arquivo) e Ed. Fisica (6 -> SAE 201 pela tabela) caem na mesma #40
    const { avisos } = ligarDisciplinasRco(exp, turmas, [d(40, "Geral", "201")], new Map([[6, 201]]));
    expect(avisos.some((a) => a.startsWith("disciplina #40 recebeu 2 códigos do RCO"))).toBe(true);
  });
});

describe("prévia", () => {
  it("turma já existente (mesmo SERE ou nome+turno) é pulada e não conta disciplinas dela", () => {
    const { previa, novas } = montarPreviaImportacaoRco(exp, [{ id: 1, nome: "3ºA", turno: "matutino", codigoSere: null }], [], new Map(), { ano: 2027, comEspanhola: false });
    expect(novas.map((t) => t.nome)).toEqual(["6ºA"]);
    expect(previa.puladas).toEqual(["3ºA matutino"]);
    expect(previa.disciplinas.map((x) => x.codigo)).toEqual([1, 2, 6]);
    expect(previa.resumo).toEqual({ turmasNovas: 1, vinculos: 3, disciplinasNovas: 3, codigosAGravar: 0 });
    expect(previa.bloqueio).toBeNull();
    expect(previa.espanholaNoArquivo).toBe(true);
    expect(previa.disciplinas[0]!.sigla).toBe(SIGLA_PADRAO_POR_CODIGO[1]);
  });
  it("nada novo, avisos ou nomes repetidos bloqueiam o aplicar", () => {
    const tudo = [{ id: 1, nome: "x", turno: "x", codigoSere: 100 }, { id: 2, nome: "y", turno: "y", codigoSere: 200 }];
    expect(montarPreviaImportacaoRco(exp, tudo, [], new Map(), { ano: 2027, comEspanhola: false }).previa.bloqueio).toMatch(/Nada a gravar/);
    const dup = [{ id: 30, nome: "A", codigoSae: "201", codigoExternoRco: null }, { id: 31, nome: "B", codigoSae: "201", codigoExternoRco: null }];
    expect(montarPreviaImportacaoRco(exp, [], dup, new Map(), { ano: 2027, comEspanhola: false }).previa.bloqueio).toMatch(/avisos/);
    const rep = lerExportacaoRco(xml({
      disciplinas: [{ CODIGO: 1, NOME: "LP", ABREVIATURA: "1" }],
      turmas: [{ CODIGO: 1, NOME: "4060_6_1_A", TURNO: "T" }, { CODIGO: 2, NOME: "4061_6_1_A", TURNO: "T" }],
      grades: [[1, 1, 5]],
    }))!;
    const r = montarPreviaImportacaoRco(rep, [], [], new Map(), { ano: 2027, comEspanhola: false }).previa;
    expect(r.repetidos).toEqual(["6ºA vespertino"]);
    expect(r.bloqueio).toMatch(/mesmo nome/);
  });
});

describe("padrão NexGrade de nome e sigla", () => {
  it("nome-padrao-disciplina.ts e sigla-padrao.ts batem com lib/db/dados/padrao-disciplinas.json", () => {
    const json = JSON.parse(readFileSync(join(__dirname, "../../../../../lib/db/dados/padrao-disciplinas.json"), "utf8")).porCodigo as Record<string, { nome: string; sigla: string }>;
    expect(Object.fromEntries(Object.entries(json).map(([k, v]) => [k, v.nome]))).toEqual(Object.fromEntries(Object.entries(NOME_PADRAO_POR_CODIGO).map(([k, v]) => [k, v])));
    expect(Object.fromEntries(Object.entries(json).map(([k, v]) => [k, v.sigla]))).toEqual(Object.fromEntries(Object.entries(SIGLA_PADRAO_POR_CODIGO).map(([k, v]) => [k, v])));
  });
  it("nomeBonito", () => {
    expect(nomeBonito("HISTORIA DO PARANA II")).toBe("Historia do Parana II");
  });
});
