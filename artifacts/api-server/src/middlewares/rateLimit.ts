import rateLimit from "express-rate-limit";

// RNF-SEG: limites de taxa por sessão autenticada (requireAuth já roda
// antes destes limitadores, então toda requisição aqui já tem
// req.auth.userId — usamos isso como chave em vez do IP, que em
// ambientes com proxy/CDN compartilhado (Replit, Vercel etc.) tende a
// ser o mesmo para muitos usuários diferentes).
function chavePorUsuario(req: any): string {
  return req.auth?.userId ?? req.ip ?? "anonimo";
}

// Limite geral, generoso — só existe para conter abuso grosseiro
// (scripts, loops de erro no frontend), não para uso normal.
export const limitadorGeral = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: chavePorUsuario,
  message: { error: "Muitas requisições. Aguarde um momento e tente novamente." },
});

// Limite mais apertado para o Assistente de IA: cada chamada custa
// dinheiro de verdade (API da OpenAI) — sem isso, um usuário (ou um bug
// de loop no frontend) pode gerar uma conta alta rapidamente.
export const limitadorIA = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: chavePorUsuario,
  message: { error: "Muitas mensagens ao Assistente de IA em pouco tempo. Aguarde um momento." },
});
