import { describe, it, expect } from "vitest";
import { lerExportacaoRco, resumirExportacaoRco } from "../rco-exportacao";

// [ARQUIVO-RCO] trecho no formato real do arquivo do RCO (Mario Braga, 26/10/2026)
const XML = `<EXPORT_URANIA_INSERT>
	<DISCIPLINAS>
		<REGISTRO>
			<CODIGO>21</CODIGO>
			<NOME>ARTE</NOME>
			<ABREVIATURA>704</ABREVIATURA>
		</REGISTRO>
		<REGISTRO>
			<CODIGO>1269</CODIGO>
			<NOME>PRATICA DE FORMACAO (EST.SUPE)</NOME>
			<ABREVIATURA>    </ABREVIATURA>
		</REGISTRO>
	</DISCIPLINAS>
	<TURMAS>
		<REGISTRO>
			<CODIGO>2729930</CODIGO>
			<NOME>2500_1_6_E</NOME>
			<ABREVIATURA>1ª E</ABREVIATURA>
			<DIAS>23456</DIAS>
			<AULAS>7</AULAS>
			<TURNO>MT</TURNO>
		</REGISTRO>
		<REGISTRO>
			<CODIGO>2696579</CODIGO>
			<NOME>0051_3_5_B</NOME>
			<ABREVIATURA>3ª B</ABREVIATURA>
			<DIAS>2345</DIAS>
			<AULAS>3</AULAS>
			<TURNO>N</TURNO>
			<COD_TURMA_IF>2696578</COD_TURMA_IF>
		</REGISTRO>
	</TURMAS>
	<GRADES>
		<REGISTRO>
			<COD_TURMA>2729930</COD_TURMA>
			<COD_DISCIPLINA>1269</COD_DISCIPLINA>
			<AULAS>5</AULAS>
		</REGISTRO>
	</GRADES>
</EXPORT_URANIA_INSERT>`;

describe("lerExportacaoRco", () => {
  it("le disciplinas, turmas e grade do arquivo do RCO", () => {
    const e = lerExportacaoRco(XML)!;
    expect(e.disciplinas).toEqual([
      { codigo: 21, nome: "ARTE", abreviatura: "704", sae: "704" },
      { codigo: 1269, nome: "PRATICA DE FORMACAO (EST.SUPE)", abreviatura: "", sae: null },
    ]);
    expect(e.turmas[0]).toMatchObject({ codigo: 2729930, curso: "2500", serie: "1", letra: "E", dias: [2, 3, 4, 5, 6], aulasPorDia: 7, turno: "MT", codigoIf: null });
    expect(e.turmas[1]).toMatchObject({ codigo: 2696579, turno: "N", codigoIf: 2696578 });
    expect(e.grades).toEqual([{ codTurma: 2729930, codDisciplina: 1269, aulas: 5 }]);
    expect(resumirExportacaoRco(e)).toEqual({
      disciplinas: 2, turmas: 2, linhasGrade: 1, turmasPorTurno: { integral: 1, noite: 1 }, turmasComParteIf: 1, cursos: 2,
    });
  });

  it("recusa arquivo que nao e a exportacao do RCO", () => {
    expect(lerExportacaoRco("<IMPORT_HORARIO><HORARIO></HORARIO></IMPORT_HORARIO>")).toBeNull();
    expect(lerExportacaoRco("qualquer coisa")).toBeNull();
  });
});
