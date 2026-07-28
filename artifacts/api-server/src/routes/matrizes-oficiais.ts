import { Router } from "express";
import { MATRIZES_TECNICAS_SEED_PR_2026 } from "../lib/matrizes-tecnicas-seed-pr";
import { MATRIZES_OFICIAIS_SEED_PR } from "../lib/matrizes-oficiais-seed-pr";

// RNF-SEG: essas duas listas (matrizes curriculares oficiais SEED-PR,
// ~5.400 linhas de dado curado a partir de PDFs regulatórios) antes
// viviam em src/lib/*.ts do FRONTEND -- ou seja, iam dentro do
// pacote JS público, baixado por QUALQUER pessoa que criasse uma
// conta gratuita, sem checagem de plano nenhuma. Agora ficam só aqui
// no backend, atrás de requireAuth (já aplicado a toda rota /api por
// app.ts) -- só sai daqui pra quem está de fato logado.
const router = Router();

router.get("/tecnicas", (_req, res) => {
  res.json(MATRIZES_TECNICAS_SEED_PR_2026);
});

router.get("/gerais", (_req, res) => {
  res.json(MATRIZES_OFICIAIS_SEED_PR);
});

export default router;
