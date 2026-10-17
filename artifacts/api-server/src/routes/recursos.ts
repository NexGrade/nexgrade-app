import { Router } from "express";
import { getEscolaId } from "../lib/escola-id";
import { alterarTotalRecurso, AlterarRecursoBody, garantirRecursos } from "../lib/reservas-recursos";

// [RECURSOS-CONFIG] (17/10/2026) Equipamentos contados por unidade (carrinho de tablets) e o total de cada um.
// Fica fora de /reservas de proposito: alterar o total e da coordenacao/direcao/secretaria; o gestor de
// reservas so reserva (lib/permissao.ts libera /reservas/* para ele, e este caminho nao).
const router = Router();

router.get("/", async (req, res) => {
  const recursos = await garantirRecursos(getEscolaId(req));
  res.json(recursos.map((r) => ({ id: r.id, nome: r.nome, quantidadeTotal: r.quantidadeTotal })));
});

router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const parsed = AlterarRecursoBody.safeParse(req.body);
  if (!Number.isInteger(id) || !parsed.success) {
    res.status(400).json({ error: "Informe a quantidade total (de 1 a 500)." });
    return;
  }
  const r = await alterarTotalRecurso({ escolaId: getEscolaId(req), id, quantidadeTotal: parsed.data.quantidadeTotal });
  res.status(r.status).json(r.body);
});

export default router;
