import rateLimit, { ipKeyGenerator } from "express-rate-limit";

// RNF-SEG: limites de taxa por sessao autenticada (requireAuth ja roda
// antes destes limitadores, entao toda requisicao aqui ja tem
// req.auth.userId -- usamos isso como chave em vez do IP, que em
// ambientes com proxy/CDN compartilhado (Replit, Vercel etc.) tende a
// ser o mesmo para muitos usuarios diferentes).
//
// [CORRIGIDO] O fallback pra IP (usado em chamadas que passam por aqui
// antes de req.auth.userId existir, ex.: onboarding) precisa passar pelo
// helper ipKeyGenerator -- a partir do express-rate-limit 8.x, usar
// req.ip puro num keyGenerator customizado lanca
// ERR_ERL_KEY_GEN_IPV6, porque enderecos IPv6 tem varias representacoes
// equivalentes que poderiam ser usadas pra burlar o limite se nao forem
// normalizados. ipKeyGenerator cuida dessa normalizacao (ver
// Options.ipv6Subnet na documentacao da lib).
function chavePorUsuario(req: any): string {
  return req.auth?.userId ?? ipKeyGenerator(req.ip ?? "0.0.0.0") ?? "anonimo";
}

// Limite geral, generoso -- so existe para conter abuso grosseiro
// (scripts, loops de erro no frontend), nao para uso normal.
export const limitadorGeral = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: chavePorUsuario,
  message: { error: "Muitas requisicoes. Aguarde um momento e tente novamente." },
});

// Limite mais apertado para o Assistente de IA: cada chamada custa
// dinheiro de verdade (API da OpenAI) -- sem isso, um usuario (ou um bug
// de loop no frontend) pode gerar uma conta alta rapidamente.
export const limitadorIA = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: chavePorUsuario,
  message: { error: "Muitas mensagens ao Assistente de IA em pouco tempo. Aguarde um momento." },
});