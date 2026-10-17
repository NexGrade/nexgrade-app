import { Router, type Request } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { comunicadosTable, db, professoresTable } from "@workspace/db";
import { getEscolaId } from "../lib/escola-id";
import { dadosAgenda } from "../lib/agenda-professor";
import { ocupacaoDoDia, ocupacaoDoMes } from "../lib/ocupacao-reservas";
import { criarLoteReservas, LoteReservaBody } from "../lib/reservas-lote";
import { criarReservasRecursos, ocupacaoRecursosDoDia, ReservaRecursoBody } from "../lib/reservas-recursos";

// [RESERVA-GESTOR] (17/10/2026) O gestor de reservas (e a coordenacao) agenda para um professor
// direto no portal: mesmo fluxo do app do professor (dia, periodo, aulas, espacos, tablets), mas
// a reserva ja nasce CONFIRMADA, sem fila de aprovacao. Escrita liberada so para quem administra
// reservas (lib/permissao.ts trata tudo em /reservas/* como alteracao de reserva).
const router = Router();

async function professorDaEscola(req: Request, professorId: unknown) {
  const id = Number(professorId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const [professor] = await db
    .select()
    .from(professoresTable)
    .where(and(eq(professoresTable.id, id), eq(professoresTable.escolaId, getEscolaId(req)), eq(professoresTable.ativo, true)));
  return professor ?? null;
}

const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

// grade do professor escolhido (aulas por dia/turno e horario de cada aula), como na Minha Agenda
router.get("/horario", async (req, res) => {
  const professor = await professorDaEscola(req, req.query.professorId);
  if (!professor) {
    res.status(404).json({ error: "Professor não encontrado." });
    return;
  }
  const { aulas, horasAtividade, horarios } = await dadosAgenda(professor, getEscolaId(req));
  res.json({ aulas, horasAtividade, horarios });
});

router.get("/ocupacao", async (req, res) => {
  const q = req.query.data;
  const data = typeof q === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : null;
  if (!data) {
    res.status(400).json({ error: "Informe a data (AAAA-MM-DD)." });
    return;
  }
  res.json(await ocupacaoDoDia(getEscolaId(req), data));
});

router.get("/ocupacao-mes", async (req, res) => {
  const salaId = Number(req.query.salaId);
  const mes = typeof req.query.mes === "string" && /^\d{4}-\d{2}$/.test(req.query.mes) ? req.query.mes : null;
  if (!Number.isInteger(salaId) || salaId <= 0 || !mes) {
    res.status(400).json({ error: "Informe o espaço (salaId) e o mês (AAAA-MM)." });
    return;
  }
  res.json(await ocupacaoDoMes(getEscolaId(req), salaId, mes));
});

router.get("/recursos/ocupacao", async (req, res) => {
  const q = req.query.data;
  const data = typeof q === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : null;
  if (!data) {
    res.status(400).json({ error: "Informe a data (AAAA-MM-DD)." });
    return;
  }
  res.json(await ocupacaoRecursosDoDia(getEscolaId(req), data));
});

async function avisarProfessor(escolaId: string, professorId: number, titulo: string, data: string, quantas: number) {
  await db.insert(comunicadosTable).values({
    escolaId,
    titulo: "Reserva agendada pela coordenação",
    mensagem: `A coordenação reservou para você "${titulo}" em ${dataBR(data)} (${quantas} ${quantas === 1 ? "reserva confirmada" : "reservas confirmadas"}).`,
    tipo: "reserva",
    professorId,
    autorNome: "Coordenação",
  });
}

router.post("/lote", async (req, res) => {
  const parsed = LoteReservaBody.extend({ professorId: z.number().int() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Pedido de reserva incompleto." });
    return;
  }
  const professor = await professorDaEscola(req, parsed.data.professorId);
  if (!professor) {
    res.status(404).json({ error: "Professor não encontrado." });
    return;
  }
  const escolaId = getEscolaId(req);
  const r = await criarLoteReservas({ escolaId, professor, corpo: parsed.data, aprovarDireto: true });
  if (r.status === 201) await avisarProfessor(escolaId, professor.id, parsed.data.titulo, parsed.data.data, Number(r.body.criadas));
  res.status(r.status).json(r.body);
});

router.post("/recursos", async (req, res) => {
  const parsed = ReservaRecursoBody.extend({ professorId: z.number().int() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Pedido de reserva incompleto." });
    return;
  }
  const professor = await professorDaEscola(req, parsed.data.professorId);
  if (!professor) {
    res.status(404).json({ error: "Professor não encontrado." });
    return;
  }
  const escolaId = getEscolaId(req);
  const r = await criarReservasRecursos({ escolaId, professor, corpo: parsed.data });
  if (r.status === 201) await avisarProfessor(escolaId, professor.id, parsed.data.titulo, parsed.data.data, Number(r.body.criadas));
  res.status(r.status).json(r.body);
});

export default router;
