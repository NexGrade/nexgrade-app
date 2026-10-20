import type { NextFunction, Request, Response } from "express";

// [CABECALHOS-SEGURANCA] (20/10/2026) Cabecalhos que mandam o navegador se proteger nas respostas da API:
// - Strict-Transport-Security: so abre por HTTPS (1 ano, inclusive subdominios);
// - X-Content-Type-Options: nao "adivinha" o tipo do arquivo (evita arquivo disfarcado);
// - X-Frame-Options + frame-ancestors: ninguem coloca a resposta dentro de outra pagina (clickjacking);
// - Referrer-Policy: nao vaza o endereco completo para outros sites;
// - Permissions-Policy: a API nao usa camera, microfone nem localizacao.
// O proxy do Clerk (/api/__clerk) e montado antes e nao passa por aqui, de proposito.
export function cabecalhosSeguranca(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Content-Security-Policy", "frame-ancestors 'none'");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
}
