import { Router } from "express";
import { db } from "@workspace/db";
import { auditLogsTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { getEscolaId } from "../lib/escola-id";

const router = Router();

router.get("/", async (req, res) => {
  const escolaId = getEscolaId(req);
  const entidade = req.query.entidade as string | undefined;
  const limit = req.query.limit ? Number(req.query.limit) : 100;

  let rows = await db.select().from(auditLogsTable)
    .where(eq(auditLogsTable.escolaId, escolaId))
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(limit);

  if (entidade) rows = rows.filter(r => r.entidade === entidade);

  res.json(rows);
});

export default router;
