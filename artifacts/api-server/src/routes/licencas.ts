import { Router } from "express";
import { db } from "@workspace/db";
import { licencasTable, professoresTable, comunicadosTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { getEscolaId } from "../lib/escola-id";
import { TIPOS_LICENCA, tipoNeutro, comunicadoDaLicenca } from "../lib/licenca-neutra"; // [LICENCA-SEM-DADO-SENSIVEL]

const router = Router();

const LicencaInput = z.object({
  professorId: z.number().int(),
  professorSubstitutoId: z.number().int().optional(),
  dataInicio: z.string(),
  dataFim: z.string(),
  // [LICENCA-SEM-DADO-SENSIVEL] sem motivo (o zod descarta o campo se vier) e sem tipo de saude
  tipo: z.enum(TIPOS_LICENCA).default("afastamento"),
  aprovada: z.boolean().default(false),
});

const LicencaUpdate = LicencaInput.partial();

async function enrichLicenca(licenca: typeof licencasTable.$inferSelect) {
  const [professor, substituto] = await Promise.all([
    db.select().from(professoresTable).where(eq(professoresTable.id, licenca.professorId)).then(r => r[0]),
    licenca.professorSubstitutoId
      ? db.select().from(professoresTable).where(eq(professoresTable.id, licenca.professorSubstitutoId)).then(r => r[0])
      : Promise.resolve(null),
  ]);
  // [LICENCA-SEM-DADO-SENSIVEL] licenca antiga ainda no banco: nao devolve o motivo nem o tipo de saude
  return { ...licenca, tipo: tipoNeutro(licenca.tipo), motivo: null, professor, professorSubstituto: substituto ?? null };
}

router.get("/", async (req, res) => {
  const escolaId = getEscolaId(req);
  const professorId = req.query.professorId ? Number(req.query.professorId) : undefined;
  const ativas = req.query.ativas === "true";

  let rows = await db.select().from(licencasTable)
    .where(eq(licencasTable.escolaId, escolaId))
    .orderBy(licencasTable.dataInicio);

  if (professorId) rows = rows.filter(l => l.professorId === professorId);

  if (ativas) {
    const hoje = new Date().toISOString().split("T")[0]!;
    rows = rows.filter(l => l.dataInicio <= hoje && l.dataFim >= hoje);
  }

  const enriched = await Promise.all(rows.map(enrichLicenca));
  res.json(enriched);
});

router.post("/", async (req, res) => {
  const escolaId = getEscolaId(req);
  const parsed = LicencaInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const professor = await db.select().from(professoresTable)
    .where(and(eq(professoresTable.id, parsed.data.professorId), eq(professoresTable.escolaId, escolaId)))
    .then(r => r[0]);
  if (!professor) {
    res.status(404).json({ error: "Professor não encontrado" });
    return;
  }

  const [licenca] = await db.insert(licencasTable).values({ ...parsed.data, motivo: null, escolaId }).returning();

  const substituto = licenca.professorSubstitutoId
    ? (await db.select().from(professoresTable).where(and(eq(professoresTable.id, licenca.professorSubstitutoId), eq(professoresTable.escolaId, escolaId))))[0]
    : undefined;
  await db.insert(comunicadosTable).values({
    escolaId,
    ...comunicadoDaLicenca(professor.nome, licenca.dataInicio, licenca.dataFim, substituto?.nome ?? null), // [LICENCA-SEM-DADO-SENSIVEL]
    tipo: "licenca",
    professorId: licenca.professorId,
    autorNome: "Sistema",
  });

  const enriched = await enrichLicenca(licenca);
  res.status(201).json(enriched);
});

router.patch("/:id", async (req, res) => {
  const escolaId = getEscolaId(req);
  const id = Number(req.params.id);
  const parsed = LicencaUpdate.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [licenca] = await db.update(licencasTable)
    .set({ ...parsed.data, motivo: null }) // [LICENCA-SEM-DADO-SENSIVEL] apaga o motivo antigo ao editar
    .where(and(eq(licencasTable.id, id), eq(licencasTable.escolaId, escolaId)))
    .returning();
  if (!licenca) {
    res.status(404).json({ error: "Licença não encontrada" });
    return;
  }
  const enriched = await enrichLicenca(licenca);
  res.json(enriched);
});

router.delete("/:id", async (req, res) => {
  const escolaId = getEscolaId(req);
  await db.delete(licencasTable)
    .where(and(eq(licencasTable.id, Number(req.params.id)), eq(licencasTable.escolaId, escolaId)));
  res.status(204).send();
});

export default router;
