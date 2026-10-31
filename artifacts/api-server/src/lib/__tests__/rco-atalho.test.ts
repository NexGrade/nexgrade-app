import { describe, it, expect, vi } from "vitest";
import vm from "node:vm";
vi.mock("@workspace/db", () => ({ db: {}, configuracoesTable: {} }));
import { montarFavorito, origemValida, scriptDeAviso } from "../rco-atalho";
import { ehLeituraSomenteAdmin } from "../permissao";

const CHAVE = "abcDEF123_-abcDEF123_-abcDEF12";

/** Roda o favorito numa "tela do RCO" de mentira: devolve o script que ele carregaria e os alertas. */
function clicar(favorito: string, turnoNaTela: string | null) {
  const alertas: string[] = [];
  const carregados: string[] = [];
  const combo = turnoNaTela == null ? undefined : { options: [{ text: turnoNaTela }], selectedIndex: 0 };
  const document = {
    getElementsByName: (n: string) => (n === "codTurno" && combo ? [combo] : []),
    createElement: () => ({ src: "", onerror: null }),
    body: { appendChild: (s: { src: string }) => { carregados.push(s.src); } },
  };
  vm.runInNewContext(favorito.slice("javascript:".length), { document, alert: (m: string) => alertas.push(m), Date });
  return { alertas, carregados };
}

describe("atalho de gravacao no RCO [RCO-ATALHO]", () => {
  it("le o turno escolhido no RCO e carrega o script da escola", () => {
    const fav = montarFavorito("https://app.nexgrade.com.br", CHAVE);
    expect(fav.startsWith("javascript:")).toBe(true);
    expect(fav).not.toMatch(/[%#]/); // o navegador decodifica/corta javascript: com % e #
    for (const [tela, turno] of [["Manhã", "matutino"], ["Tarde", "vespertino"], ["Noite", "noturno"], ["Integral", "integral"]]) {
      const r = clicar(fav, tela);
      expect(r.alertas).toEqual([]);
      expect(r.carregados[0]).toMatch(new RegExp(`^https://app\\.nexgrade\\.com\\.br/api/rco-atalho/${CHAVE}\\.js\\?turno=${turno}&v=\\d+$`));
    }
  });
  it("sem turno escolhido no RCO so avisa", () => {
    const fav = montarFavorito("https://app.nexgrade.com.br", CHAVE);
    for (const tela of [null, "Selecione"]) {
      const r = clicar(fav, tela);
      expect(r.carregados).toEqual([]);
      expect(r.alertas[0]).toMatch(/escolha o Periodo Letivo e o Turno/);
    }
  });
  it("so aceita endereco do NexGrade valido e chave no formato", () => {
    expect(origemValida("https://app.nexgrade.com.br")).toBe(true);
    expect(origemValida("http://localhost:5173")).toBe(true);
    expect(origemValida("http://app.nexgrade.com.br")).toBe(false);
    expect(origemValida("https://x.com/'+alert(1)+'")).toBe(false);
    expect(() => montarFavorito("https://app.nexgrade.com.br", "curta")).toThrow();
  });
  it("aviso em JavaScript nao quebra com aspas nem fecha tag", () => {
    const js = scriptDeAviso(`turma "3A" </script>`);
    const alertas: string[] = [];
    vm.runInNewContext(js, { alert: (m: string) => alertas.push(m) });
    expect(alertas).toEqual([`NexGrade: turma "3A" </script>`]);
    expect(js).not.toContain("</script>");
  });
  it("chave do atalho: so direcao, coordenacao e secretaria leem [PERMISSAO-PAPEL]", () => {
    expect(ehLeituraSomenteAdmin("/export/rco-script/atalho")).toBe(true);
    expect(ehLeituraSomenteAdmin("/Export/RCO-Script/Atalho/")).toBe(true);
  });
});
