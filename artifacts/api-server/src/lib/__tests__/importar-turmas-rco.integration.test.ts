import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db, pool, configuracoesTable, disciplinasTable, turmaDisciplinasTable, turmasTable } from "@workspace/db";
import { aplicarImportacaoRco, previaImportacaoRco } from "../importar-turmas-rco";
import { CHAVE_CONTEUDO } from "../arquivo-rco";

// [IMPORTAR-TURMAS-RCO] (31/10/2026) prévia e aplicar com um Postgres de verdade (so com TEST_DATABASE_URL).
const TEM_BANCO = !!process.env.TEST_DATABASE_URL;
const E = `imprco_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const reg = (c: Record<string, string | number>) => "<REGISTRO>" + Object.entries(c).map(([k, v]) => `<${k}>${v}</${k}>`).join("") + "</REGISTRO>";
const XML = "<URANIA><DISCIPLINAS>" +
  [{ CODIGO: 1, NOME: "LINGUA PORTUGUESA", ABREVIATURA: "106" }, { CODIGO: 2, NOME: "MATEMATICA", ABREVIATURA: "201" }, { CODIGO: 3826, NOME: "LINGUA ESPANHOLA", ABREVIATURA: "LEM" }].map(reg).join("") +
  "</DISCIPLINAS><TURMAS>" +
  [{ CODIGO: 91001, NOME: "4060_6_1_A", TURNO: "T" }, { CODIGO: 91002, NOME: "0009_1_1_A", TURNO: "M" }].map(reg).join("") +
  "</TURMAS><GRADES>" +
  [[91001, 1, 5], [91001, 2, 5], [91002, 1, 3], [91002, 3826, 2]].map(([t, d, a]) => reg({ COD_TURMA: t!, COD_DISCIPLINA: d!, AULAS: a! })).join("") +
  "</GRADES></URANIA>";

describe.skipIf(!TEM_BANCO)("importar turmas do arquivo do RCO (integração)", () => {
  let mat = 0;
  beforeAll(async () => {
    await db.insert(configuracoesTable).values({ escolaId: E, chave: CHAVE_CONTEUDO, valor: { xml: XML } });
    // disciplina do catalogo ja na escola, sem Codigo Externo: liga pelo SAE e ganha o codigo
    const [d] = await db.insert(disciplinasTable).values({ escolaId: E, nome: "Matemática", codigoSae: "201" }).returning();
    mat = d!.id;
  });
  afterAll(async () => {
    await db.delete(turmasTable).where(eq(turmasTable.escolaId, E));
    await db.delete(disciplinasTable).where(eq(disciplinasTable.escolaId, E));
    await db.delete(configuracoesTable).where(eq(configuracoesTable.escolaId, E));
    await pool.end();
  });

  it("prévia não grava nada", async () => {
    const p = await previaImportacaoRco(E, { ano: 2027, comEspanhola: false });
    expect(p.resumo).toEqual({ turmasNovas: 2, vinculos: 3, disciplinasNovas: 1, codigosAGravar: 1 });
    expect(p.bloqueio).toBeNull();
    expect(await db.select().from(turmasTable).where(eq(turmasTable.escolaId, E))).toHaveLength(0);
  });

  it("aplicar cria turmas, vínculos e disciplina nova; liga a existente e grava o Código Externo; segunda vez não duplica", async () => {
    const r = await aplicarImportacaoRco(E, { ano: 2027, comEspanhola: false });
    expect(r.turmas.map((t) => [t.nome, t.turno, t.codigoSere])).toEqual([["6ºA", "vespertino", 91001], ["1ºA", "matutino", 91002]]);
    expect(r.codigosGravados).toEqual([{ disciplinaId: mat, codigo: 2 }]);
    expect(r.disciplinasNovas.map((d) => d.codigo)).toEqual([1]);
    const turmas = await db.select().from(turmasTable).where(eq(turmasTable.escolaId, E));
    expect(turmas.every((t) => t.anoLetivo === 2027)).toBe(true);
    const vinc = await db.select().from(turmaDisciplinasTable).where(inArray(turmaDisciplinasTable.turmaId, turmas.map((t) => t.id)));
    expect(vinc).toHaveLength(3); // Espanhola ficou de fora
    const [m] = await db.select().from(disciplinasTable).where(eq(disciplinasTable.id, mat));
    expect(m!.codigoExternoRco).toBe(2);

    await expect(aplicarImportacaoRco(E, { ano: 2027, comEspanhola: false })).rejects.toThrow(/Nada a gravar/);
    expect(await db.select().from(turmasTable).where(eq(turmasTable.escolaId, E))).toHaveLength(2);
  });
});
