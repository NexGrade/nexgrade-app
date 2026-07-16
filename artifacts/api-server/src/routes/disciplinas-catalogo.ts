import { Router } from "express";
import { db } from "@workspace/db";
import { disciplinasCatalogoTable, disciplinasTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getEscolaId } from "../lib/escola-id";

// [NOVO] Catálogo mestre de disciplinas — compartilhado entre todas as
// escolas (sem escolaId, ver schema/disciplinas-catalogo.ts). Permite
// que uma escola nova selecione disciplinas já com nome/SAE corretos em
// vez de digitar tudo do zero. "Adicionar selecionadas" copia as
// entradas escolhidas do catálogo para disciplinasTable, já escopadas
// para a escola do usuário autenticado.
const router = Router();

router.get("/", async (req, res) => {
  const rows = await db.select().from(disciplinasCatalogoTable).orderBy(disciplinasCatalogoTable.nome);
  res.json(rows);
});

const AdicionarSelecionadasInput = z.object({
  catalogoIds: z.array(z.number().int()).min(1),
});

router.post("/adicionar-selecionadas", async (req, res) => {
  const escolaId = getEscolaId(req);
  const parsed = AdicionarSelecionadasInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const itensCatalogo = await db.select().from(disciplinasCatalogoTable)
    .where(inArray(disciplinasCatalogoTable.id, parsed.data.catalogoIds));

  if (itensCatalogo.length === 0) {
    res.status(404).json({ error: "Nenhum item do catálogo encontrado para os IDs informados" });
    return;
  }

  // Evita duplicar: se a escola já tem uma disciplina com o mesmo
  // codigo_sae (ou, na ausencia de SAE, o mesmo nome normalizado), pula
  // esse item silenciosamente em vez de criar uma copia.
  const disciplinasDaEscola = await db.select().from(disciplinasTable).where(eq(disciplinasTable.escolaId, escolaId));
  const saesExistentes = new Set(disciplinasDaEscola.map(d => d.codigoSae).filter(Boolean));
  const nomesExistentes = new Set(disciplinasDaEscola.map(d => d.nome.trim().toLowerCase()));

  const paraCriar = itensCatalogo.filter(item => {
    if (item.codigoSae && saesExistentes.has(item.codigoSae)) return false;
    if (!item.codigoSae && nomesExistentes.has(item.nome.trim().toLowerCase())) return false;
    return true;
  });
  const jaExistiam = itensCatalogo.length - paraCriar.length;

  if (paraCriar.length === 0) {
    res.json({ criadas: [], jaExistiam });
    return;
  }

  const criadas = await db.insert(disciplinasTable).values(
    paraCriar.map(item => ({
      escolaId,
      nome: item.nome,
      codigoSae: item.codigoSae,
      categoriaCurricularPadrao: item.categoriaCurricularPadrao,
      cargaSemanal: item.cargaSemanalSugerida,
      tipoSalaExigido: item.tipoSalaExigido,
    })),
  ).returning();

  res.status(201).json({ criadas, jaExistiam });
});

export default router;
