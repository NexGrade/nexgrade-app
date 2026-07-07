import { describe, it, expect } from "vitest";
import { parseCSV, detectType } from "../importar";

describe("parseCSV", () => {
  it("separa por vírgula e remove aspas", () => {
    const csv = 'nome,email\n"João Silva",joao@escola.com';
    expect(parseCSV(csv)).toEqual([
      ["nome", "email"],
      ["João Silva", "joao@escola.com"],
    ]);
  });

  it("também aceita ponto-e-vírgula como separador (padrão comum em CSV exportado no Brasil)", () => {
    const csv = "nome;email\nMaria;maria@escola.com";
    expect(parseCSV(csv)).toEqual([
      ["nome", "email"],
      ["Maria", "maria@escola.com"],
    ]);
  });
});

describe("detectType", () => {
  it("identifica professores pelo cabeçalho", () => {
    expect(detectType(["Nome", "Email", "Professor"])).toBe("professores");
    expect(detectType(["nome_docente"])).toBe("professores");
  });

  it("identifica turmas pelo cabeçalho", () => {
    expect(detectType(["Turma", "Série", "Turno"])).toBe("turmas");
  });

  it("identifica disciplinas pelo cabeçalho", () => {
    expect(detectType(["Disciplina", "Carga Semanal"])).toBe("disciplinas");
  });

  it("retorna desconhecido quando nada bate", () => {
    expect(detectType(["coluna_a", "coluna_b"])).toBe("desconhecido");
  });
});
