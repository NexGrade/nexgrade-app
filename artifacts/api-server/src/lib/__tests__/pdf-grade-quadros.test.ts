import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { aulasDosBlocos, textoTurma, gerarPdfTurmasLadoALado, gerarPdfProfessoresCompacto, gerarPdfQuadroProfessores } from "../pdf-grade-quadros";
import type { BlocoGrade } from "../pdf-grade";

const horas = { 1: "07:30", 2: "08:20", 3: "09:10", 4: "10:10", 5: "11:00", 6: "11:50" };
const turma = (nome: string): BlocoGrade => ({
  rotulo: `Turma: ${nome}`, horariosPorAula: horas,
  slots: [{ diaSemana: 0, numeroAula: 1, linha1: "MAT", linha2: "José Raul", texto: "Matemática (José Raul)" },
          { diaSemana: 4, numeroAula: 6, linha1: "PORT", linha2: "Manoel" }],
});
const prof = (nome: string): BlocoGrade => ({
  rotulo: nome.toUpperCase(), horariosPorAula: horas,
  slots: [{ diaSemana: 0, numeroAula: 1, linha1: "8ºA", linha2: "MAT" }, { diaSemana: 1, numeroAula: 2, linha1: "HA", destacado: true }],
  celulasBloqueadas: [{ diaSemana: 2, numeroAula: 3 }],
});
const paginas = async (b: Uint8Array) => (await PDFDocument.load(b)).getPageCount();

describe("modelos de PDF da grade [PDF-MODELOS]", () => {
  it("junta as aulas de todos os blocos", () => {
    expect(aulasDosBlocos([{ rotulo: "x", slots: [{ diaSemana: 0, numeroAula: 7, linha1: "a" }], horariosPorAula: { 1: "07:30" } }])).toEqual([1, 7]);
  });
  it("celula de turma: texto completo ou sigla (professor)", () => {
    expect(textoTurma({ diaSemana: 0, numeroAula: 1, linha1: "MAT", linha2: "Ana", texto: "Matemática (Ana)" })).toBe("Matemática (Ana)");
    expect(textoTurma({ diaSemana: 0, numeroAula: 1, linha1: "MAT", linha2: "Ana" })).toBe("MAT (Ana)");
  });
  it("turmas lado a lado: 5 turmas por pagina", async () => {
    const b = await gerarPdfTurmasLadoALado("Escola", "Grade", "28/10", ["8ºA", "8ºB", "9ºA", "9ºB", "9ºC", "9ºD", "1ºA"].map(turma));
    expect(await paginas(b)).toBe(2);
  });
  it("professores compacto e quadro geral geram paginas", async () => {
    const profs = Array.from({ length: 50 }, (_, i) => prof(`Professor ${i + 1}`));
    expect(await paginas(await gerarPdfProfessoresCompacto("Escola", "Grade", "28/10", profs))).toBeGreaterThanOrEqual(2);
    expect(await paginas(await gerarPdfQuadroProfessores("Escola", "Grade", "28/10", profs))).toBe(2);
  });
});
