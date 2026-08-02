import { Router } from "express";
import { db } from "@workspace/db";
import {
  professoresTable, turmasTable, disciplinasTable, horariosTable,
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

// [TROCADO 2] O Gemini 2.0/2.5-flash e a API :generateContent (usada
// antes aqui) foram descontinuados pelo Google em 2026 -- ver
// https://ai.google.dev/gemini-api/docs/deprecations. A substituicao
// oficial recomendada pelo proprio erro 404 do Google e a "Interactions
// API" (endpoint /v1beta/interactions), usada pelos modelos da serie
// Gemini 3.x. Isso mudou TRES coisas em cascata:
//   1. Formato de tool declaration: lista plana de objetos
//      { type: "function", name, description, parameters }, em vez de
//      [{ functionDeclarations: [...] }].
//   2. Formato de mensagem: `input` (string ou array de "steps"
//      tipados: user_input / function_result), em vez de `contents`
//      (array de { role, parts }). NAO existe mais role "function" --
//      resultado de function call agora e um step tipo "function_result"
//      com call_id, nao uma mensagem com role especial.
//   3. Formato de resposta: `interaction.steps[]` (cada um com `type`,
//      e para function_call: `name`/`arguments`/`id`), com atalho
//      `interaction.output_text` para o texto final, em vez de
//      `candidates[0].content.parts[]`.
// O antigo mecanismo manual de thought_signature (echo do part inteiro
// de volta pro modelo) tambem sumiu -- a doc da Interactions API diz
// que isso agora e tratado automaticamente pela propria API pros
// modelos da serie Gemini 3.
const tools = [
  {
    type: "function" as const,
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
    type: "function" as const,
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
  // [NOVO] Primeira ferramenta de CONSULTA (só leitura) do assistente --
  // as duas de cima só propõem uma ação futura, essa busca dado real da
  // grade já montada. Diferente delas, o resultado precisa voltar pro
  // Gemini numa segunda chamada (ver pedirRespostaComResultadoFuncao)
  // pra virar texto em português, em vez do backend já saber a resposta
  // de antemão.
  {
    type: "function" as const,
    name: "consultar_janelas_professores",
    description:
      "Consulta quantas 'janelas' (períodos vagos entre duas aulas no mesmo dia) cada professor tem na grade horária já montada. Use quando o usuário perguntar sobre janelas, buracos, tempo ocioso ou distribuição ruim de horário dos professores.",
    parameters: { type: "object" as const, properties: {} },
  },
  {
    type: "function" as const,
    name: "consultar_turmas_sem_horario",
    description:
      "Lista quais turmas ainda não têm nenhuma aula gerada na grade horária. Use quando o usuário perguntar quantas/quais turmas estão sem horário, incompletas ou pendentes de geração.",
    parameters: { type: "object" as const, properties: {} },
  },
  {
    type: "function" as const,
    name: "consultar_distribuicao_semanal",
    description:
      "Consulta quantas aulas estão alocadas em cada dia da semana (e por turno), pra avaliar se a distribuição da grade está equilibrada. Use quando o usuário perguntar sobre a distribuição de aulas na semana, dias mais cheios/vazios, ou balanceamento da grade.",
    parameters: { type: "object" as const, properties: {} },
  },
];

type AcaoPendente =
  | { tipo: "definir_disponibilidade"; payload: { professorId: number; diaSemana: number; horarioSlot: number; disponivel: boolean; motivo?: string } }
  | { tipo: "gerar_horario_turma"; payload: { turmaId: number; substituir: boolean } };

// [NOVO] Mesma lógica de "janela" (buraco entre aulas no mesmo dia) já
// usada visualmente na aba Grade/Modo Experimental do front -- aqui
// calculada uma vez pra escola inteira, pra alimentar a ferramenta de
// consulta do assistente. Considera só do primeiro ao último horário
// ocupado do professor naquele dia (não conta antes/depois como
// janela, só o que está "no meio").
async function calcularJanelasProfessores(escolaId: string) {
  const [slots, profs] = await Promise.all([
    db.select().from(horariosTable).where(eq(horariosTable.escolaId, escolaId)),
    db.select({ id: professoresTable.id, nome: professoresTable.nome })
      .from(professoresTable).where(eq(professoresTable.escolaId, escolaId)),
  ]);

  const porProf = new Map<number, typeof slots>();
  slots.forEach((s) => {
    if (!porProf.has(s.professorId)) porProf.set(s.professorId, []);
    porProf.get(s.professorId)!.push(s);
  });

  return profs
    .map((p) => {
      const slotsProf = porProf.get(p.id) ?? [];
      const porDia = new Map<number, number[]>();
      slotsProf.forEach((s) => {
        if (!porDia.has(s.diaSemana)) porDia.set(s.diaSemana, []);
        porDia.get(s.diaSemana)!.push(s.numeroAula);
      });

      let totalJanelas = 0;
      const detalhePorDia: Record<string, number> = {};
      for (const [dia, aulas] of porDia.entries()) {
        const ordenado = [...aulas].sort((a, b) => a - b);
        const min = ordenado[0]!;
        const max = ordenado[ordenado.length - 1]!;
        const ocupados = new Set(ordenado);
        let janelasDoDia = 0;
        for (let i = min; i <= max; i++) if (!ocupados.has(i)) janelasDoDia++;
        if (janelasDoDia > 0) detalhePorDia[DIAS_SEMANA[dia] ?? `dia ${dia}`] = janelasDoDia;
        totalJanelas += janelasDoDia;
      }

      return { professor: p.nome, totalAulas: slotsProf.length, totalJanelas, detalhePorDia };
    })
    .sort((a, b) => b.totalJanelas - a.totalJanelas);
}

// [NOVO] Mesma lógica já usada em routes/stats.ts pro card "Turmas sem
// Horário" da Visão Geral -- aqui devolve também os NOMES (o card só
// mostrava o número), que é o que o assistente precisa pra responder
// "quais" turmas, não só "quantas".
async function consultarTurmasSemHorario(escolaId: string) {
  const [turmas, horarios] = await Promise.all([
    db.select({ id: turmasTable.id, nome: turmasTable.nome, turno: turmasTable.turno })
      .from(turmasTable).where(eq(turmasTable.escolaId, escolaId)),
    db.select({ turmaId: horariosTable.turmaId }).from(horariosTable).where(eq(horariosTable.escolaId, escolaId)),
  ]);
  const turmasComHorario = new Set(horarios.map((h) => h.turmaId));
  const semHorario = turmas.filter((t) => !turmasComHorario.has(t.id));
  return {
    totalTurmas: turmas.length,
    totalSemHorario: semHorario.length,
    turmasSemHorario: semHorario.map((t) => ({ nome: t.nome, turno: t.turno })),
  };
}

// [NOVO] Total de aulas alocadas por dia da semana e por turno -- pra
// responder se a grade está "equilibrada" (ex: sexta muito mais vazia
// que segunda) sem o usuário precisar abrir a aba Grade e contar na mão.
async function consultarDistribuicaoSemanal(escolaId: string) {
  const [horarios, turmas] = await Promise.all([
    db.select().from(horariosTable).where(eq(horariosTable.escolaId, escolaId)),
    db.select({ id: turmasTable.id, turno: turmasTable.turno }).from(turmasTable).where(eq(turmasTable.escolaId, escolaId)),
  ]);
  const turmaTurno = new Map(turmas.map((t) => [t.id, t.turno]));
  const porDia: Record<string, number> = {};
  const porDiaETurno: Record<string, Record<string, number>> = {};
  horarios.forEach((h) => {
    const dia = DIAS_SEMANA[h.diaSemana] ?? `dia ${h.diaSemana}`;
    const turno = turmaTurno.get(h.turmaId) ?? "desconhecido";
    porDia[dia] = (porDia[dia] ?? 0) + 1;
    porDiaETurno[dia] = porDiaETurno[dia] ?? {};
    porDiaETurno[dia]![turno] = (porDiaETurno[dia]![turno] ?? 0) + 1;
  });
  return { totalAulas: horarios.length, porDia, porDiaETurno };
}

// Formato de um step de function_call na resposta da Interactions API.
type StepFunctionCall = { type: "function_call"; id: string; name: string; arguments: Record<string, unknown> };
// Formato de resposta da Interactions API -- so os campos que usamos.
type InteractionResponse = {
  id: string;
  output_text?: string;
  steps?: Array<
    | StepFunctionCall
    | { type: string; content?: Array<{ type?: string; text?: string }> }
  >;
};

function extrairFunctionCall(interaction: InteractionResponse): StepFunctionCall | undefined {
  return interaction.steps?.find((s): s is StepFunctionCall => s.type === "function_call");
}

function extrairTexto(interaction: InteractionResponse): string | undefined {
  if (interaction.output_text) return interaction.output_text;
  for (const step of interaction.steps ?? []) {
    if ("content" in step && step.content) {
      const textoPart = step.content.find((c) => c.text);
      if (textoPart?.text) return textoPart.text;
    }
  }
  return undefined;
}

// [NOVO] Ferramentas de consulta (leitura) sempre precisam de uma
// SEGUNDA chamada ao Gemini: a primeira só pede "quero chamar essa
// função", essa aqui manda o resultado de volta (via
// previous_interaction_id + step function_result) e pede a resposta
// final em português. Extraído numa função só porque agora são 3
// ferramentas de consulta usando exatamente o mesmo padrão.
async function pedirRespostaComResultadoFuncao(
  apiKey: string,
  previousInteractionId: string,
  functionCall: StepFunctionCall,
  resultado: unknown,
): Promise<string> {
  const res = await chamarGemini(apiKey, {
    previous_interaction_id: previousInteractionId,
    tools,
    input: [
      {
        type: "function_result",
        name: functionCall.name,
        call_id: functionCall.id,
        result: [{ type: "text", text: JSON.stringify(resultado) }],
      },
    ],
  });

  if (!res.ok) {
    const corpoErro = await res.text().catch(() => "(sem corpo)");
    throw new Error(`${res.status} ${res.statusText}: ${corpoErro.slice(0, 300)}`);
  }

  const interaction = (await res.json()) as InteractionResponse;
  return extrairTexto(interaction)
    ?? "Consultei os dados, mas não consegui formular uma resposta. Tente reformular a pergunta.";
}

// [NOVO] Lista de modelos, do preferido pro mais antigo -- se o
// principal devolver 503 (sobrecarga temporária do lado do Google, não
// erro nosso) ou 404 (modelo descontinuado -- acontece com frequência,
// o Google vem desligando modelos), tenta o próximo da lista
// automaticamente antes de desistir. Nomes confirmados em
// https://ai.google.dev/gemini-api/docs/models em 30/07/2026 -- revisar
// essa lista se voltar a dar 404 no futuro (o Google costuma avisar
// deprecação com 2 semanas de antecedência, mas nem sempre a gente
// vê o aviso a tempo).
const GEMINI_MODELOS_FALLBACK = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash-lite"];

// [NOVO] Centraliza a chamada à API do Gemini com fallback de modelo.
// Os dois pontos do arquivo que chamavam `fetch` direto (chat principal
// e a segunda chamada pós-ferramenta) foram trocados por esta função,
// pra não duplicar a lógica de retry duas vezes.
//
// [TROCADO 2] Endpoint mudou de /v1beta/models/{modelo}:generateContent
// (com a chave na query string ?key=) para /v1beta/interactions (com a
// chave no header x-goog-api-key, como documentado nos exemplos REST
// da Interactions API) -- e o nome do modelo agora entra DENTRO do
// corpo da requisição (campo "model"), não mais na URL.
async function chamarGemini(apiKey: string, body: Record<string, unknown>): Promise<Response> {
  let ultimaResposta: Response | null = null;
  let ultimoErro: unknown;

  for (const modelo of GEMINI_MODELOS_FALLBACK) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/interactions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({ ...body, model: modelo }),
        },
      );
      if (res.ok) return res;
      // Só troca de modelo quando o motivo é sobrecarga (503) ou modelo
      // descontinuado (404) -- outros erros (400 de payload malformado,
      // 401 de chave inválida) não seriam resolvidos trocando de
      // modelo, então devolve na hora.
      if (res.status !== 503 && res.status !== 404) return res;
      ultimaResposta = res;
    } catch (err) {
      ultimoErro = err;
    }
  }

  if (ultimaResposta) return ultimaResposta;
  throw ultimoErro instanceof Error ? ultimoErro : new Error("Todos os modelos Gemini indisponíveis no momento.");
}

// POST /ai/chat
//
// [TROCADO 2] Ver comentário grande acima da lista `tools` explicando a
// migração completa pra Interactions API. Resumo do que muda aqui
// especificamente: `contents` (array de mensagens role/parts) virou
// `input` (uma string ou array de steps tipados); não existe mais
// "systemInstruction" documentado pra essa API nova -- pra não
// arriscar um nome de campo incorreto, o contexto da escola (que antes
// ia em systemInstruction) agora é embutido no próprio texto de
// `input`, junto com o histórico da conversa.
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
1. Responder perguntas sobre a grade horária e situação da escola — use consultar_janelas_professores (janelas/buracos de professor), consultar_turmas_sem_horario (turmas sem grade gerada) ou consultar_distribuicao_semanal (equilíbrio de aulas entre os dias) quando a pergunta se encaixar em alguma dessas, em vez de responder de memória.
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
    // [TROCADO 2] Contexto da escola + histórico da conversa + mensagem
    // atual, tudo embutido num texto só (ver comentário acima da rota
    // sobre não arriscar o nome do campo de system prompt). O histórico
    // fica em formato "Usuário: ... / Assistente: ..." simples, que
    // qualquer modelo Gemini lê bem como transcript de conversa.
    const contextoHistorico = historico.length
      ? historico.map(h => `${h.role === "assistant" ? "Assistente" : "Usuário"}: ${h.content}`).join("\n") + "\n"
      : "";
    const inputTexto = `${systemPrompt}\n\n--- CONVERSA ---\n${contextoHistorico}Usuário: ${mensagem}`;

    const geminiRes = await chamarGemini(apiKey, {
      input: inputTexto,
      tools,
    });

    if (!geminiRes.ok) {
      const corpoErro = await geminiRes.text().catch(() => "(sem corpo)");
      throw new Error(`${geminiRes.status} ${geminiRes.statusText}: ${corpoErro.slice(0, 300)}`);
    }

    const interaction = (await geminiRes.json()) as InteractionResponse;
    const functionCall = extrairFunctionCall(interaction);
    const textoDireto = extrairTexto(interaction);

    let respostaTexto: string;
    let acaoPendente: AcaoPendente | null = null;

    if (functionCall?.name === "definir_disponibilidade") {
      const args = functionCall.arguments as {
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
    } else if (functionCall?.name === "gerar_horario_turma") {
      const args = functionCall.arguments as { turmaNome: string; substituir?: boolean };
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
    } else if (functionCall?.name === "consultar_janelas_professores") {
      const janelas = await calcularJanelasProfessores(escolaId);
      respostaTexto = await pedirRespostaComResultadoFuncao(
        apiKey, interaction.id, functionCall, { janelas: janelas.slice(0, 30) },
      );
    } else if (functionCall?.name === "consultar_turmas_sem_horario") {
      const dados = await consultarTurmasSemHorario(escolaId);
      respostaTexto = await pedirRespostaComResultadoFuncao(apiKey, interaction.id, functionCall, dados);
    } else if (functionCall?.name === "consultar_distribuicao_semanal") {
      const dados = await consultarDistribuicaoSemanal(escolaId);
      respostaTexto = await pedirRespostaComResultadoFuncao(apiKey, interaction.id, functionCall, dados);
    } else {
      respostaTexto = textoDireto ?? "Não consegui gerar uma resposta. Tente reformular a pergunta.";
    }

    await db.insert(aiMensagensTable).values({ conversaId: cidAtual, role: "assistant", content: respostaTexto });

    res.write(`data: ${JSON.stringify({ content: respostaTexto })}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true, conversaId: cidAtual, acaoPendente })}\n\n`);
    res.end();
  } catch (err: any) {
    console.error("Erro no assistente de IA:", err.message);
    res.write(`data: ${JSON.stringify({ error: err.message ?? "Erro na IA" })}\n\n`);
    res.end();
  }
});

// ── EXECUÇÃO DA AÇÃO CONFIRMADA (RF-IA-03) ─────────────────────────────
// [NAO MUDOU] Esta rota nunca fala com o Gemini -- so aplica no banco a
// acao que o usuario ja confirmou. Preservada 100% identica.

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
