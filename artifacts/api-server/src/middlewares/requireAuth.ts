import type { NextFunction, Request, Response } from "express";
import { getAuth } from "@clerk/express";

// RNF-SEG-03: nenhuma rota de negócio deve ser alcançável sem uma sessão
// Clerk válida. `clerkMiddleware()` (aplicado em app.ts) só decodifica o
// token quando ele existe — não bloqueia quem não manda nenhum. Este
// middleware é o bloqueio de fato, aplicado a todo o roteador de API
// exceto o healthcheck (ver app.ts).
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }
  next();
}
