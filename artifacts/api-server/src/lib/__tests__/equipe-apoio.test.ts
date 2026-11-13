// [EQUIPE-APOIO] (12/11/2026) Equipe de apoio no Ponto Diario: cadastro, quem entra em cada turno e a folha.
import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { EquipeApoioInput, linhasEquipeDoTurno, rotuloEquipe, semTabelaEquipe, type PessoaEquipe } from "../equipe-apoio";
import { gerarPdfPontoDiario, type PontoDiario, type LinhaPonto } from "../pdf-ponto-diario";

const semana = (turno: string) => [0, 1, 2, 3, 4].map((dia) => ({ dia, turno }));

describe("cadastro da equipe de apoio", () => {
  it("aceita as cinco funcoes e limpa o expediente repetido", () => {
    for (const funcao of ["pedagogo", "paee", "interprete", "pac", "sala_recursos"]) {
      const r = EquipeApoioInput.safeParse({ nome: " Ana ", funcao, expediente: [{ dia: 2, turno: "vespertino" }, { dia: 0, turno: "matutino" }, { dia: 2, turno: "vespertino" }] });
      expect(r.success, funcao).toBe(true);
      if (r.success) {
        expect(r.data.nome).toBe("Ana");
        expect(r.data.complemento).toBeNull();
        expect(r.data.expediente).toEqual([{ dia: 0, turno: "matutino" }, { dia: 2, turno: "vespertino" }]);
      }
    }
  });
  it("recusa funcao desconhecida, nome vazio, sem expediente, sabado e turno invalido", () => {
    const base = { nome: "Ana", funcao: "pedagogo", expediente: [{ dia: 0, turno: "matutino" }] };
    expect(EquipeApoioInput.safeParse({ ...base, funcao: "professor" }).success).toBe(false);
    expect(EquipeApoioInput.safeParse({ ...base, nome: "   " }).success).toBe(false);
    expect(EquipeApoioInput.safeParse({ ...base, expediente: [] }).success).toBe(false);
    expect(EquipeApoioInput.safeParse({ ...base, expediente: [{ dia: 5, turno: "matutino" }] }).success).toBe(false);
    expect(EquipeApoioInput.safeParse({ ...base, expediente: [{ dia: 0, turno: "integral" }] }).success).toBe(false);
  });
});

describe("quem da equipe entra no turno", () => {
  const pessoas: PessoaEquipe[] = [
    { nome: "Zélia", funcao: "pedagogo", complemento: null, expediente: semana("matutino") },
    { nome: "Bruno", funcao: "interprete", complemento: "2ºA", expediente: [{ dia: 1, turno: "matutino" }] },
    { nome: "Ana", funcao: "pedagogo", complemento: null, expediente: semana("vespertino") },
    { nome: "Carla", funcao: "sala_recursos", complemento: "", expediente: semana("matutino") },
    { nome: "Dado antigo", funcao: "pac", complemento: null, expediente: null },
  ];
  it("so quem marcou o dia e o turno, pela ordem das funcoes e depois do nome", () => {
    expect(linhasEquipeDoTurno(pessoas, 1, "matutino")).toEqual([
      { nome: "Zélia", funcao: "Pedagogia" },
      { nome: "Bruno", funcao: "Intérprete · 2ºA" },
      { nome: "Carla", funcao: "Sala de Recursos" },
    ]);
    expect(linhasEquipeDoTurno(pessoas, 0, "matutino").map((l) => l.nome)).toEqual(["Zélia", "Carla"]);
    expect(linhasEquipeDoTurno(pessoas, 0, "vespertino").map((l) => l.nome)).toEqual(["Ana"]);
    expect(linhasEquipeDoTurno(pessoas, 0, "noturno")).toEqual([]);
  });
  it("rotulo da funcao com e sem complemento", () => {
    expect(rotuloEquipe("paee")).toBe("PAEE");
    expect(rotuloEquipe("pac", "  ")).toBe("PAC");
    expect(rotuloEquipe("interprete", "1ºB")).toBe("Intérprete · 1ºB");
  });
  it("reconhece a tabela que ainda nao existe (migracao atrasada)", () => {
    expect(semTabelaEquipe({ code: "42P01" })).toBe(true);
    expect(semTabelaEquipe({ cause: { code: "42P01" } })).toBe(true);
    expect(semTabelaEquipe({ code: "23505" })).toBe(false);
  });
});

describe("folha do Ponto Diario com a equipe de apoio", () => {
  const colunas = [1, 2, 3, 4, 5, 6].map((n) => ({ numeroAula: n, hora: `0${6 + n}:30` }));
  const professor = (i: number): LinhaPonto => ({
    professor: `Professor ${String(i).padStart(2, "0")}`,
    celulas: colunas.map(() => ({ texto: "1A/MAT", tipo: "aula" as const })),
    aulas: 6, ha: 0,
  });
  const ponto = (nProf: number, nEquipe: number): PontoDiario => ({
    escola: "Escola Teste", data: "2026-11-12", dataBR: "12/11/2026", diaSemana: "Quinta-feira", aviso: null,
    turnos: [{
      turno: "matutino", rotulo: "Manhã", colunas,
      linhas: Array.from({ length: nProf }, (_, i) => professor(i)),
      equipe: Array.from({ length: nEquipe }, (_, i) => ({ nome: `Pessoa ${i}`, funcao: i % 2 ? "Pedagogia" : "Intérprete · 2ºA" })),
    }],
  });
  const paginas = async (b: Uint8Array) => (await PDFDocument.load(b)).getPageCount();

  it("sem equipe a folha continua igual (uma pagina)", async () => {
    expect(await paginas(await gerarPdfPontoDiario(ponto(30, 0)))).toBe(1);
  });
  it("com equipe cabe na mesma folha enquanto da para escrever", async () => {
    expect(await paginas(await gerarPdfPontoDiario(ponto(30, 6)))).toBe(1);
  });
  it("turno so com equipe (nenhum professor) tambem sai", async () => {
    expect(await paginas(await gerarPdfPontoDiario(ponto(0, 3)))).toBe(1);
  });
  it("lista grande passa para outra folha sem quebrar", async () => {
    expect(await paginas(await gerarPdfPontoDiario(ponto(150, 20)))).toBeGreaterThan(1);
  });
});
