import type { NextFunction, Request, Response } from "express";
import { logger } from "../lib/logger";

// RNF-SEG: handler de erro global — precisa ser o ÚLTIMO middleware
// registrado em app.ts (regra do Express: 4 parâmetros = error handler).
// Garante duas coisas que antes dependiam de nada vazar por acidente:
// (1) o erro completo (com stack) vai para o log estruturado do
// servidor, nunca para a resposta; (2) o cliente sempre recebe uma
// mensagem genérica e um id de correlação (req.id, já gerado pelo
// pino-http) para o suporte localizar o erro no log sem expor detalhe
// interno nenhum.
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const reqId = (req as any).id;
  logger.error({ err, reqId, url: req.originalUrl, method: req.method }, "Erro não tratado na requisição");

  if (res.headersSent) {
    return;
  }

  res.status(500).json({
    error: "Erro interno no servidor. Se o problema persistir, informe o suporte.",
    requestId: reqId,
  });
}
