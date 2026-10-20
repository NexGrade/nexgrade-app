import { Router } from "express";
import { getEscolaId } from "../lib/escola-id";
import { db, recursosTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { alterarTotalRecurso, AlterarRecursoBody, criarRecurso, editarRecurso, garantirRecursos, NovoRecursoBody } from "../lib/reservas-recursos";

// [RECURSOS-CONFIG] (17/10/2026) Equipamentos contados por unidade (carrinho de tablets) e o total de cada um.
// Fica fora de /reservas de proposito: alterar o total e da coordenacao/direcao/secretaria; o gestor de
// reservas so reserva (lib/permissao.ts libera /reservas/* para ele, e este caminho nao).
const router = Router();

router.get("/", async (req, res) => {
  const escolaId = getEscolaId(req);
  await garantirRecursos(escolaId);
  // [RECURSOS-CADASTRO] ?todos=1 inclui os desativados (tela de cadastro)
  const todos = req.query.todos === "1";
  const recursos = (await db.select().from(recursosTable).where(eq(recursosTable.escolaId, escolaId)).orderBy(recursosTable.nome)).filter((r) => todos || r.ativo);
  res.json(recursos.map((r) => ({ id: r.id, nome: r.nome, quantidadeTotal: r.quantidadeTotal, ativo: r.ativo })));
});

// [RECURSOS-CADASTRO] (20/10/2026) novo equipamento por quantidade
router.post("/", async (req, res) => {
  const parsed = NovoRecursoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Informe o nome (2 a 60 letras) e a quantidade total (de 1 a 500)." });
    return;
  }
  const r = await criarRecurso({ escolaId: getEscolaId(req), ...parsed.data });
  res.status(r.status).json(r.body);
});

router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const parsed = AlterarRecursoBody.safeParse(req.body);
  if (!Number.isInteger(id) || !parsed.success) {
    res.status(400).json({ error: "Informe a quantidade total (de 1 a 500)." });
    return;
  }
  const escolaId = getEscolaId(req);
  const { quantidadeTotal, nome, ativo } = parsed.data;
  if (nome !== undefined || ativo !== undefined) {
    const e = await editarRecurso({ escolaId, id, nome, ativo });
    if (e.status !== 200 || quantidadeTotal === undefined) {
      res.status(e.status).json(e.body);
      return;
    }
  }
  const r = await alterarTotalRecurso({ escolaId, id, quantidadeTotal: quantidadeTotal! });
  res.status(r.status).json(r.body);
});

export default router;
