import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import router from "./routes";
import healthRouter from "./routes/health";
import { logger } from "./lib/logger";
import { requireAuth } from "./middlewares/requireAuth";
import { limitadorGeral } from "./middlewares/rateLimit";
import { errorHandler } from "./middlewares/errorHandler";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

// RNF-SEG-01/03: `origin: true` refletia qualquer origem de volta no
// cabeÃ§alho de resposta, e com `credentials: true` isso permite que
// QUALQUER site na internet faÃ§a requisiÃ§Ãµes autenticadas (com o
// cookie de sessÃ£o do Clerk) contra esta API a partir do navegador de
// um usuÃ¡rio logado â€” um vetor clÃ¡ssico de CSRF via CORS mal
// configurado. Agora sÃ³ Ã© permitido: (a) requisiÃ§Ãµes sem cabeÃ§alho
// Origin (mesma origem/ferramentas nÃ£o-navegador), ou (b) origens
// explicitamente listadas em CORS_ALLOWED_ORIGINS (separadas por
// vÃ­rgula) â€” configurar com o(s) domÃ­nio(s) reais do frontend em
// produÃ§Ã£o e, se necessÃ¡rio, o(s) domÃ­nio(s)/portas usados em
// desenvolvimento local.
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origem nÃ£o permitida pelo CORS: ${origin}`));
    },
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  clerkMiddleware(),
);

// Healthcheck fica pÃºblico (monitoramento de infraestrutura nÃ£o tem
// sessÃ£o de usuÃ¡rio) â€” montado antes do requireAuth, de propÃ³sito.
app.use("/api", healthRouter);

// RNF-SEG-03: a partir daqui, toda rota de negÃ³cio exige sessÃ£o Clerk
// vÃ¡lida. clerkMiddleware() sozinho nÃ£o bloqueia requisiÃ§Ã£o sem token â€”
// requireAuth Ã© o bloqueio de fato. limitadorGeral vem depois de
// requireAuth de propÃ³sito: ele usa req.auth.userId como chave, entÃ£o
// precisa que a sessÃ£o jÃ¡ tenha sido resolvida.
app.use("/api", requireAuth, limitadorGeral, router);

// Precisa ser o ÃšLTIMO app.use â€” Express identifica um error handler
// pela assinatura de 4 parÃ¢metros (err, req, res, next).
app.use(errorHandler);

export default app;

