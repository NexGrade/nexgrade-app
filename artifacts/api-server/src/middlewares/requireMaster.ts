import type { NextFunction, Request, Response } from "express";
import { getAuth } from "@clerk/express";

// RF-MASTER: o Painel Master opera FORA do isolamento por escola de
// propósito — é quem administra todas as escolas da plataforma. Por
// isso não usa getEscolaId nem depende de organização Clerk nenhuma;
// em vez disso, uma allowlist explícita de userId do Clerk (variável de
// ambiente MASTER_USER_IDS, separada por vírgula) decide quem é
// administrador da plataforma. Simples de propósito: trocar isso por
// um papel de verdade no banco é um passo natural quando houver mais
// de uma pessoa administrando a plataforma, mas não antes disso.
function masterUserIds(): string[] {
  return (process.env.MASTER_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export function isMaster(req: Request): boolean {
  const { userId } = getAuth(req);
  if (!userId) return false;
  return masterUserIds().includes(userId);
}

export function requireMaster(req: Request, res: Response, next: NextFunction): void {
  if (!isMaster(req)) {
    res.status(403).json({ error: "Acesso restrito à administração da plataforma" });
    return;
  }
  next();
}
