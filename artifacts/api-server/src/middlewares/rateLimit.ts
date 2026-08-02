import rateLimit, { ipKeyGenerator } from "express-rate-limit";

// RNF-SEG: limites de taxa por sessão autenticada (requireAuth já roda
// antes destes limitadores, então toda requisição aqui já tem
// req.auth.userId — usamos isso como chave em vez do IP, que em
// ambientes com proxy/CDN compartilhado (Replit, Vercel etc.) tende a
// ser o mesmo para muitos usuários diferentes).
//
// O fallback pro IP (quando não há usuário autenticado, ex. rota
// pública) precisa passar pelo helper `ipKeyGenerator` — sem isso, o
// express-rate-limit recusa subir (ValidationError ERR_ERL_KEY_GEN_IPV6)
// porque um IPv6 bruto tem várias representações textuais válidas pro
// mesmo endereço, permitindo burlar o limite variando a escrita do IP.
function chavePorUsuario(req: any): string {
  return req.auth?.userId ?? ipKeyGenerator(req.ip ?? "0.0.0.0") ?? "anonimo";
}

// Limite geral, generoso — só existe para conter abuso grosseiro
// (scripts, loops de erro no frontend), não para uso normal.
export const limitadorGeral = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: chavePorUsuario,
  // A checagem "keyGeneratorIpFallback" da lib é um lint baseado em texto
  // (procura o literal "ipKeyGenerator" no `.toString()` da função) — o
  // esbuild minifica e renomeia esse import no build de produção, dando
  // falso positivo mesmo com o código correto. Já verificamos manualmente
  // que `chavePorUsuario` usa `ipKeyGenerator` de verdade (ver acima).
  validate: { keyGeneratorIpFallback: false },
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
  validate: { keyGeneratorIpFallback: false },
  message: { error: "Muitas mensagens ao Assistente de IA em pouco tempo. Aguarde um momento." },
});

// [NOVO] RNF-SEG: limite específico pro onboarding (POST /escolas) --
// rota que cria registro, diferente de uma leitura comum. O limite
// geral (300/min) já cobre abuso grosseiro, mas esse aqui é bem mais
// apertado de propósito: uma conta legítima nunca precisa (re)cadastrar
// a escola dezenas de vezes por minuto -- só um script tentando criar
// cadastros em massa faria isso.
export const limitadorCadastro = rateLimit({
  windowMs: 10 * 60_000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: chavePorUsuario,
  validate: { keyGeneratorIpFallback: false },
  message: { error: "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente." },
});

// [NOVO] RNF-SEG: limite específico pra rotas que servem dado sensível
// e caro de reconstruir (ex: catálogo de matrizes oficiais SEED-PR).
// Mais generoso que o de cadastro (uso normal da tela às vezes chama
// mais de uma vez em sessões diferentes), mas bem mais apertado que o
// geral -- um script tentando raspar o catálogo inteiro repetidamente
// esbarra aqui rápido; uso humano normal nunca chega perto do limite
// (o front já cacheia a resposta por 10 minutos).
export const limitadorConsultaSensivel = rateLimit({
  windowMs: 10 * 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: chavePorUsuario,
  validate: { keyGeneratorIpFallback: false },
  message: { error: "Muitas consultas em pouco tempo. Aguarde alguns minutos e tente novamente." },
});
