import { Router } from "express";
import { db } from "@workspace/db";
import {
  professoresTable, turmasTable, disciplinasTable,
  aiConversasTable, aiMensagensTable, disponibilidadeTable, auditLogsTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { getEscolaId } from "../lib/escola-id";
import { gerarAlgoritmo } from "./horarios";
import { limitadorIA } from "../middlewares/rateLimit";

const router = Router();

// Chamadas de chat e execução de ação custam dinheiro de verdade (API
// do Gemini) — limite mais apertado que o resto da API (ver rateLimit.ts).
router.use(["/chat", "/executar-acao"], limitadorIA);

function getUsuarioId(req: any): string | null {
  return req.auth?.userId ?? null;
}

// GET /ai/conversas — lista conversas da escola
router.get("/conversas", async (req, res) => {
  const escolaId = getEscolaId(req);
  const conversas = await db
    .select()
    .from(aiConversasTable)
    .where(eq(aiConversasTable.escolaId, escolaId))
    .orderBy(desc(aiConversasTable.updatedAt));
  res.json(conversas);
});

// POST /ai/conversas — cria nova conversa
router.post("/conversas", async (req, res) => {
  const escolaId = getEscolaId(req);
  const { titulo = "Nova conversa" } = req.body;
  const [conversa] = await db
    .insert(aiConversasTable)
    .values({ escolaId, titulo })
    .returning();
  res.status(201).json(conversa);
});

// DELETE /ai/conversas/:id
router.delete("/conversas/:id", async (req, res) => {
  const escolaId = getEscolaId(req);
  const id = Number(req.params.id);
  await db
    .delete(aiConversasTable)
    .where(and(eq(aiConversasTable.id, id), eq(aiConversasTable.escolaId, escolaId)));
  res.json({ ok: true });
});

// GET /ai/conversas/:id/mensagens
router.get("/conversas/:id/mensagens", async (req, res) => {
  const id = Number(req.params.id);
  const mensagens = await db
    .select()
    .from(aiMensagensTable)
    .where(eq(aiMensagensTable.conversaId, id))
    .orderBy(aiMensagensTable.createdAt);
  res.json(mensagens);
});

// ── AÇÕES QUE O ASSISTENTE PODE PROPOR (RF-IA-01) ─────────────────────
//
// O modelo nunca escreve no banco diretamente. Quando decide que a
// mensagem do usuário pede uma ação (não uma pergunta), o backend
// resolve os nomes mencionados contra os dados reais da escola e devolve
// uma "ação pendente" com um resumo em português — a escrita só
// acontece em POST /ai/executar-acao, depois de confirmação explícita
// do usuário (RF-IA-03). Ambiguidade de nome nunca é adivinhada
// (RF-IA-05): se houver mais de um professor/turma compatível, o
// assistente pede para o usuário especificar.

const DIAS_SEMANA = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

// [TROCADO] Formato de "function declaration" da API NATIVA do Gemini
// -- confirmado por teste manual (Invoke-RestMethod) que o endpoint
// compatível com OpenAI (`/v1beta/openai/...`) retorna 429 mesmo com
// chave válida e modelo existente, enquanto a API nativa
// (`/v1beta/models/...:generateContent`) funciona normalmente com a
// mesma chave. Por isso trocamos pra chamar a API nativa direto via
// fetch, sem SDK e sem a camada de compatibilidade.
const tools = [
  {
    functionDeclarations: [
      {
        name: "definir_disponibilidade",
        description:
          "Marca um professor como disponível ou indisponível em um dia da semana e período/aula específicos.",
        parameters: {
          type: "object" as const,
          properties: {
            professorNome: { type: "string", description: "Nome (ou parte do nome) do professor mencionado pelo usuário" },
            diaSemana: { type: "integer", description: "0=Segunda, 1=Terça, 2=Quarta, 3=Quinta, 4=Sexta, 5=Sábado, 6=Domingo" },
            horarioSlot: { type: "integer", description: "Número do período/aula dentro do dia, começando em 1" },
            disponivel: { type: "boolean", description: "true para marcar como disponível, false para indisponível" },
            motivo: { type: "string", description: "Motivo opcional da indisponibilidade" },
          },
          required: ["professorNome", "diaSemana", "horarioSlot", "disponivel"],
        },
      },
      {
        name: "gerar_horario_turma",
        description: "Gera (ou regenera) automaticamente a grade horária de uma turma específica.",
        parameters: {
          type: "object" as const,
          properties: {
            turmaNome: { type: "string", description: "Nome da turma mencionada pelo usuário" },
            substituir: { type: "boolean", description: "Se true, substitui o horário já existente da turma" },
          },
          required: ["turmaNome"],
        },
      },
    ],
  },
];

type AcaoPendente =
  | { tipo: "definir_disponibilidade"; payload: { professorId: number; diaSemana: number; horarioSlot: number; disponivel: boolean; motivo?: string } }
  | { tipo: "gerar_horario_turma"; payload: { turmaId: number; substituir: boolean } };

const GEMINI_MODEL = "gemini-2.0-flash";

// POST /ai/chat
//
// [TROCADO] Chama a API NATIVA do Gemini direto via fetch (endpoint
// `:generateContent`), não mais via camada de compatibilidade OpenAI
// -- ver comentário acima da lista `tools`. Isso muda o formato de
// mensagens (role "model" em vez de "assistant", conteúdo em
// `parts`/`text`), o system prompt (`systemInstruction` em vez de
// mensagem de role "system") e o parsing de function call (`parts[].
// functionCall` em vez de `tool_calls`).
router.post("/chat", async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(503).json({
      error: "Assistente de IA não configurado. Adicione sua GEMINI_API_KEY nas configurações.",
    });
    return;
  }

  const escolaId = getEscolaId(req);
  const { mensagem, conversaId } = req.body as { mensagem: string; conversaId?: number };

  if (!mensagem?.trim()) {
    res.status(400).json({ error: "Mensagem obrigatória" });
    return;
  }

  const [professores, turmas, disciplinas] = await Promise.all([
    db.select({ nome: professoresTable.nome, id: professoresTable.id })
      .from(professoresTable).where(eq(professoresTable.escolaId, escolaId)),
    db.select({ nome: turmasTable.nome, id: turmasTable.id })
      .from(turmasTable).where(eq(turmasTable.escolaId, escolaId)),
    db.select({ nome: disciplinasTable.nome, cargaSemanal: disciplinasTable.cargaSemanal })
      .from(disciplinasTable).where(eq(disciplinasTable.escolaId, escolaId)),
  ]);

  const systemPrompt = `Você é o Assistente de IA do NexGrade, um sistema de gestão de horários escolares.

CONTEXTO DA ESCOLA:
- Professores cadastrados (${professores.length}): ${professores.map(p => p.nome).slice(0, 10).join(", ")}${professores.length > 10 ? " e mais..." : ""}
- Turmas cadastradas (${turmas.length}): ${turmas.map(t => t.nome).slice(0, 10).join(", ")}${turmas.length > 10 ? " e mais..." : ""}
- Disciplinas (${disciplinas.length}): ${disciplinas.map(d => `${d.nome} (${d.cargaSemanal}x/sem)`).slice(0, 10).join(", ")}

Você pode:
1. Responder perguntas sobre a grade horária e situação da escola
2. Sugerir como distribuir disciplinas ou professores
3. Identificar conflitos e propor soluções
4. Executar duas ações concretas, sempre chamando a função correspondente: marcar disponibilidade de um professor, ou gerar o horário de uma turma. Você NUNCA aplica a ação diretamente — o sistema sempre pede confirmação ao usuário antes.

Seja direto, útil e use linguagem educacional brasileira.`;

  let historico: { role: string; content: string }[] = [];
  if (conversaId) {
    const msgs = await db.select().from(aiMensagensTable)
      .where(eq(aiMensagensTable.conversaId, conversaId))
      .orderBy(aiMensagensTable.createdAt);
    historico = msgs.map(m => ({ role: m.role, content: m.content }));
  }

  let cidAtual = conversaId;
  if (!cidAtual) {
    const titulo = mensagem.slice(0, 60);
    const [c] = await db.insert(aiConversasTable).values({ escolaId, titulo }).returning();
    cidAtual = c.id;
  }
  await db.insert(aiMensagensTable).values({ conversaId: cidAtual, role: "user", content: mensagem });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Conversa-Id", String(cidAtual));

  try {
    // [TROCADO] A API nativa do Gemini usa role "model" pro assistente
    // (não "assistant"), e o conteúdo vai em `parts: [{ text }]`.
    const contents = [
      ...historico.map(h => ({
        role: h.role === "assistant" ? "model" : "user",
        parts: [{ text: h.content }],
      })),
      { role: "user", parts: [{ text: mensagem }] },
    ];

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: systemPrompt }] },
          tools,
        }),
      },
    );

    if (!geminiRes.ok) {
      const corpoErro = await geminiRes.text().catch(() => "(sem corpo)");
      throw new Error(`${geminiRes.status} ${geminiRes.statusText}: ${corpoErro.slice(0, 300)}`);
    }

    const completion = await geminiRes.json() as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string; functionCall?: { name: string; args: Record<string, unknown> } }> };
      }>;
    };

    const parts = completion.candidates?.[0]?.content?.parts ?? [];
    const functionCallPart = parts.find((p) => p.functionCall)?.functionCall;
    const textPart = parts.find((p) => p.text)?.text;

    let respostaTexto: string;
    let acaoPendente: AcaoPendente | null = null;

    if (functionCallPart?.name === "definir_disponibilidade") {
      const args = functionCallPart.args as {
        professorNome: string; diaSemana: number; horarioSlot: number; disponivel: boolean; motivo?: string;
      };
      const termo = args.professorNome.trim().toLowerCase();
      const candidatos = professores.filter(p => p.nome.toLowerCase().includes(termo));

      if (candidatos.length === 0) {
        respostaTexto = `Não encontrei nenhum professor chamado "${args.professorNome}" cadastrado. Verifique o nome e tente novamente.`;
      } else if (candidatos.length > 1) {
        respostaTexto = `Encontrei mais de um professor com esse nome: ${candidatos.map(p => p.nome).join(", ")}. Qual deles você quer dizer? Pode repetir o pedido com o nome completo.`;
      } else {
        const prof = candidatos[0]!;
        const dia = DIAS_SEMANA[args.diaSemana] ?? `dia ${args.diaSemana}`;
        respostaTexto = `Confirma marcar **${prof.nome}** como **${args.disponivel ? "disponível" : "indisponível"}** na ${dia}-feira, ${args.horarioSlot}ª aula${args.motivo ? ` (motivo: ${args.motivo})` : ""}?`;
        acaoPendente = {
          tipo: "definir_disponibilidade",
          payload: { professorId: prof.id, diaSemana: args.diaSemana, horarioSlot: args.horarioSlot, disponivel: args.disponivel, motivo: args.motivo },
        };
      }
    } else if (functionCallPart?.name === "gerar_horario_turma") {
      const args = functionCallPart.args as { turmaNome: string; substituir?: boolean };
      const termo = args.turmaNome.trim().toLowerCase();
      const candidatas = turmas.filter(t => t.nome.toLowerCase().includes(termo));

      if (candidatas.length === 0) {
        respostaTexto = `Não encontrei nenhuma turma chamada "${args.turmaNome}" cadastrada. Verifique o nome e tente novamente.`;
      } else if (candidatas.length > 1) {
        respostaTexto = `Encontrei mais de uma turma com esse nome: ${candidatas.map(t => t.nome).join(", ")}. Qual delas você quer dizer?`;
      } else {
        const turma = candidatas[0]!;
        respostaTexto = `Confirma gerar${args.substituir ? " (substituindo o horário atual d" : " o horário d"}a turma **${turma.nome}**?`;
        acaoPendente = {
          tipo: "gerar_horario_turma",
          payload: { turmaId: turma.id, substituir: args.substituir ?? false },
        };
      }
    } else {
      respostaTexto = textPart ?? "Não consegui gerar uma resposta. Tente reformular a pergunta.";
    }

    await db.insert(aiMensagensTable).values({ conversaId: cidAtual, role: "assistant", content: respostaTexto });

    res.write(`data: ${JSON.stringify({ content: respostaTexto })}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true, conversaId: cidAtual, acaoPendente })}\n\n`);
    res.end();
  } catch (err: any) {
    res.write(`data: ${JSON.stringify({ error: err.message ?? "Erro na IA" })}\n\n`);
    res.end();
  }
});

// ── EXECUÇÃO DA AÇÃO CONFIRMADA (RF-IA-03) ─────────────────────────────

const ExecutarAcaoInput = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("definir_disponibilidade"),
    conversaId: z.number().int().optional(),
    payload: z.object({
      professorId: z.number().int(),
      diaSemana: z.number().int().min(0).max(6),
      horarioSlot: z.number().int().min(1),
      disponivel: z.boolean(),
      motivo: z.string().optional(),
    }),
  }),
  z.object({
    tipo: z.literal("gerar_horario_turma"),
    conversaId: z.number().int().optional(),
    payload: z.object({
      turmaId: z.number().int(),
      substituir: z.boolean().default(false),
    }),
  }),
]);

router.post("/executar-acao", async (req, res) => {
  const escolaId = getEscolaId(req);
  const usuarioId = getUsuarioId(req);
  const parsed = ExecutarAcaoInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (parsed.data.tipo === "definir_disponibilidade") {
    const { professorId, diaSemana, horarioSlot, disponivel, motivo } = parsed.data.payload;

    const professor = await db.select().from(professoresTable)
      .where(and(eq(professoresTable.id, professorId), eq(professoresTable.escolaId, escolaId)))
      .then(r => r[0]);
    if (!professor) {
      res.status(404).json({ error: "Professor não encontrado" });
      return;
    }

    const existente = await db.select().from(disponibilidadeTable)
      .where(and(
        eq(disponibilidadeTable.professorId, professorId),
        eq(disponibilidadeTable.diaSemana, diaSemana),
        eq(disponibilidadeTable.horarioSlot, horarioSlot),
      ))
      .then(r => r[0]);

    const registro = existente
      ? (await db.update(disponibilidadeTable)
          .set({ disponivel, motivo })
          .where(eq(disponibilidadeTable.id, existente.id))
          .returning())[0]
      : (await db.insert(disponibilidadeTable)
          .values({ professorId, diaSemana, horarioSlot, disponivel, motivo })
          .returning())[0];

    await db.insert(auditLogsTable).values({
      escolaId,
      entidade: "disponibilidade_professores",
      entidadeId: registro!.id,
      acao: existente ? "alteracao" : "criacao",
      dadosAnteriores: existente ?? null,
      dadosNovos: registro,
      usuarioId,
      usuarioNome: "Assistente de IA (confirmado pelo usuário)",
    });

    const mensagem = `✅ ${professor.nome} marcado(a) como ${disponivel ? "disponível" : "indisponível"} na ${DIAS_SEMANA[diaSemana]}-feira, ${horarioSlot}ª aula.`;
    if (parsed.data.conversaId) {
      await db.insert(aiMensagensTable).values({ conversaId: parsed.data.conversaId, role: "assistant", content: mensagem });
    }

    res.json({ mensagem, resultado: registro });
    return;
  }

  // gerar_horario_turma
  const { turmaId, substituir } = parsed.data.payload;
  try {
    const resultado = await gerarAlgoritmo({
      escolaId,
      turmaId,
      aulaspordia: 5,
      substituir,
      reduzirJanelas: false,
      fatorPedagogico: false,
      experimental: false,
    });

    await db.insert(auditLogsTable).values({
      escolaId,
      entidade: "horarios",
      entidadeId: turmaId,
      acao: "criacao",
      dadosAnteriores: null,
      dadosNovos: { slotsGerados: resultado.slotsGerados, conflitos: resultado.conflitos },
      usuarioId,
      usuarioNome: "Assistente de IA (confirmado pelo usuário)",
    });

    const mensagem = `✅ Horário gerado: ${resultado.slotsGerados} aula(s) alocada(s)${resultado.conflitos.length ? `, com ${resultado.conflitos.length} aviso(s) — confira a página de conflitos.` : "."}`;
    if (parsed.data.conversaId) {
      await db.insert(aiMensagensTable).values({ conversaId: parsed.data.conversaId, role: "assistant", content: mensagem });
    }

    res.json({ mensagem, resultado });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Erro ao gerar horário" });
  }
});

export default router;
