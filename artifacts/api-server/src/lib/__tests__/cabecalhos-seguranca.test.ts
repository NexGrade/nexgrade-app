import express from "express";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { cabecalhosSeguranca } from "../../middlewares/cabecalhosSeguranca";

// [CABECALHOS-SEGURANCA] (20/10/2026)
describe("cabecalhos de seguranca da API", () => {
  it("manda os cabecalhos de protecao e nao anuncia o Express", async () => {
    const app = express();
    app.disable("x-powered-by");
    app.use(cabecalhosSeguranca);
    app.get("/api/healthz", (_req, res) => { res.json({ status: "ok" }); });
    const server = app.listen(0);
    try {
      const { port } = server.address() as AddressInfo;
      const r = await fetch(`http://127.0.0.1:${port}/api/healthz`);
      expect(r.status).toBe(200);
      expect(r.headers.get("strict-transport-security")).toContain("max-age=31536000");
      expect(r.headers.get("x-content-type-options")).toBe("nosniff");
      expect(r.headers.get("x-frame-options")).toBe("DENY");
      expect(r.headers.get("content-security-policy")).toBe("frame-ancestors 'none'");
      expect(r.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
      expect(r.headers.get("x-powered-by")).toBeNull();
    } finally {
      server.close();
    }
  });
});
