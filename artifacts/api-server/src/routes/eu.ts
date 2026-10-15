// [ACESSOS-ESCOLA] (15/10/2026) GET /api/eu -- quem esta logado, em quais escolas pode
// entrar e com qual cargo. O frontend usa para montar o seletor de escola e o menu.
// Com a chave desligada, responde { pelobanco: false } e o frontend segue com o Clerk.
import { Router } from "express";
import { acessosPeloBanco, acessoDe, ROTULO_CARGO } from "../lib/acesso";

const router = Router();

router.get("/", (req, res) => {
  if (!acessosPeloBanco()) {
    res.json({ pelobanco: false });
    return;
  }
  const a = acessoDe(req);
  if (!a) {
    res.status(401).json({ error: "Não autenticado." });
    return;
  }
  res.json({
    pelobanco: true,
    email: a.email,
    escolaAtual: a.escolaId,
    nomeEscola: a.nomeEscola,
    cargo: a.cargo,
    rotuloCargo: a.cargo ? ROTULO_CARGO[a.cargo] : null,
    escolas: a.escolas.map((e) => ({ ...e, rotuloCargo: ROTULO_CARGO[e.cargo] })),
  });
});

export default router;
