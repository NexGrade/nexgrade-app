import { describe, it, expect } from "vitest";
import { pedirParaLigar, esperarServidor } from "../servidor-calculo";

// [CPSAT-DESPERTADOR] (17/11/2026) relogio falso: cada pausa avanca o tempo, nada espera de verdade
function relogio() {
  let t = 0;
  return { agora: () => t, dormir: async (ms: number) => { t += ms; }, get t() { return t; } };
}

describe("despertador do servidor de calculo [CPSAT-DESPERTADOR]", () => {
  it("500 do Google e depois 202: tenta de novo e liga (caso do Andre Andreatta, 17/11)", async () => {
    const r = relogio();
    const respostas = [{ status: 500, data: "<h1>Error: Server Error</h1>" }, { status: 202, data: { status: "PROVISIONING", acao: "start" } }];
    const logs: string[] = [];
    expect(await pedirParaLigar({ chamar: async () => respostas.shift()!, ...r, log: (m) => logs.push(m) })).toBe(true);
    expect(r.t).toBe(10_000);
    expect(logs[0]).toContain("tentativa 1: resposta 500");
  });

  it("409 (ainda desligando) e erro de rede tambem repetem", async () => {
    const r = relogio();
    let n = 0;
    const chamar = async () => { n++; if (n === 1) return { status: 409 }; if (n === 2) throw new Error("ECONNRESET"); return { status: 200, data: { status: "RUNNING", acao: "nenhuma" } }; };
    expect(await pedirParaLigar({ chamar, ...r, log: () => {} })).toBe(true);
    expect(n).toBe(3);
  });

  it("falhando sempre, desiste no tempo maximo", async () => {
    const r = relogio();
    let n = 0;
    expect(await pedirParaLigar({ chamar: async () => { n++; return { status: 500 }; }, ...r, log: () => {}, maxEsperaMs: 120_000 })).toBe(false);
    expect(n).toBe(13); // em 0, 10, ..., 120 s
    expect(r.t).toBeLessThanOrEqual(120_000);
  });
});

describe("espera do servidor de calculo [CPSAT-DESPERTADOR]", () => {
  it("responde depois de algumas tentativas: true", async () => {
    const r = relogio();
    let n = 0;
    expect(await esperarServidor({ checar: async () => ++n >= 4, ...r })).toBe(true);
    expect(r.t).toBe(9_000);
  });

  it("nunca responde (ou da erro): false no tempo maximo, em vez de seguir como se tivesse ligado", async () => {
    const r = relogio();
    expect(await esperarServidor({ checar: async () => { throw new Error("fetch failed"); }, ...r, maxEsperaMs: 240_000 })).toBe(false);
    expect(r.t).toBeGreaterThanOrEqual(240_000);
  });
});
