import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { usuariosTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getEscolaId } from "../lib/escola-id";

const router = Router();

const UsuarioInput = z.object({
  clerkId: z.string(),
  nome: z.string().min(2),
  email: z.string(),
  perfil: z.enum(["direcao", "coordenacao", "professor", "secretaria"]).default("coordenacao"),
});

const UsuarioUpdate = z.object({
  nome: z.string().optional(),
  perfil: z.enum(["direcao", "coordenacao", "professor", "secretaria"]).optional(),
  ativo: z.boolean().optional(),
});

router.get("/me", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }
  const usuario = await db.select().from(usuariosTable).where(eq(usuariosTable.clerkId, userId)).then(r => r[0]);
  if (!usuario) {
    res.status(404).json({ error: "Usuário não cadastrado" });
    return;
  }
  res.json(usuario);
});

router.get("/", async (req, res) => {
  const escolaId = getEscolaId(req);
  const usuarios = await db.select().from(usuariosTable)
    .where(eq(usuariosTable.escolaId, escolaId))
    .orderBy(usuariosTable.nome);
  res.json(usuarios);
});

router.post("/", async (req, res) => {
  const escolaId = getEscolaId(req);
  const parsed = UsuarioInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const existing = await db.select().from(usuariosTable).where(eq(usuariosTable.clerkId, parsed.data.clerkId)).then(r => r[0]);
  if (existing) {
    res.status(409).json({ error: "Usuário já cadastrado" });
    return;
  }
  const [usuario] = await db.insert(usuariosTable).values({ ...parsed.data, escolaId }).returning();
  res.status(201).json(usuario);
});

router.patch("/:id", async (req, res) => {
  const escolaId = getEscolaId(req);
  const id = Number(req.params.id);
  const parsed = UsuarioUpdate.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [usuario] = await db.update(usuariosTable)
    .set(parsed.data)
    .where(and(eq(usuariosTable.id, id), eq(usuariosTable.escolaId, escolaId)))
    .returning();
  if (!usuario) {
    res.status(404).json({ error: "Usuário não encontrado" });
    return;
  }
  res.json(usuario);
});

export default router;
