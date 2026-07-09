import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
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
// cabeçalho de resposta, e com `credentials: true` isso permite que
// QUALQUER site na internet faça requisições autenticadas (com o
// cookie de sessão do Clerk) contra esta API a partir do navegador de
// um usuário logado — um vetor clássico de CSRF via CORS mal
// configurado. Agora só é permitido: (a) requisições sem cabeçalho
// Origin (mesma origem/ferramentas não-navegador), ou (b) origens
// explicitamente listadas em CORS_ALLOWED_ORIGINS (separadas por
// vírgula) — configurar com o(s) domínio(s) reais do frontend em
// produção e, se necessário, o(s) domínio(s)/portas usados em
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
      callback(new Error(`Origem não permitida pelo CORS: ${origin}`));
    },
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

// Healthcheck fica público (monitoramento de infraestrutura não tem
// sessão de usuário) — montado antes do requireAuth, de propósito.
app.use("/api", healthRouter);

// RNF-SEG-03: a partir daqui, toda rota de negócio exige sessão Clerk
// válida. clerkMiddleware() sozinho não bloqueia requisição sem token —
// requireAuth é o bloqueio de fato. limitadorGeral vem depois de
// requireAuth de propósito: ele usa req.auth.userId como chave, então
// precisa que a sessão já tenha sido resolvida.
app.use("/api", requireAuth, limitadorGeral, router);

// Precisa ser o ÚLTIMO app.use — Express identifica um error handler
// pela assinatura de 4 parâmetros (err, req, res, next).
app.use(errorHandler);

export default app;
