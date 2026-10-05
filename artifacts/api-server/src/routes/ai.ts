import { Router } from "express";
import { db } from "@workspace/db";
import {
  professoresTable, turmasTable, disciplinasTable, horariosTable,
  aiConversasTable, aiMensagensTable, disponibilidadeTable, auditLogsTable,
  reservasTable, salasTable, regrasReservaProfessorTable, horarioSlotsTable,
} from "@workspace/db";
import { eq, and, desc, or, isNull, gte, lte, ne } from "drizzle-orm";
import { z } from "zod";
import { getEscolaId } from "../lib/escola-id";
import { limitadorIA } from "../middlewares/rateLimit";
import { GUIA_NEXGRADE, TOPICOS_GUIA, buscarNoGuia } from "../lib/guia-nexgrade"; // [GUIA-IA]
import { ehHAOutroTurno } from "../lib/ha-contraturno"; // [HA-OUTRO-TURNO]
// [IA-AMPLIADA] gerarAlgoritmo (motor simples antigo) nao e mais usado aqui:
// a geracao de grade saiu do assistente -- ver "gerar_horario_turma" abaixo.

const router = Router();

// Chamadas de chat e execução de ação custam dinheiro de verdade (API
// do Gemini) — limite mais apertado que o resto da API (ver rateLimit.ts).
router.use(["/chat", "/executar-acao"], limitadorIA);

function getUsuarioId(req: any): string | null {
  return req.auth?.userId ?? null;
}

// [IA-SEGURANCA] Confere se a conversa pertence a escola logada. Antes o
// /chat e o /executar-acao aceitavam qualquer conversaId vindo do cliente
// (liam o historico e gravavam mensagens em conversa de outra escola).
async function conversaEhDaEscola(conversaId: number, escolaId: string): Promise<boolean> {
  if (!Number.isInteger(conversaId)) return false;
  const [c] = await db
    .select({ id: aiConversasTable.id })
    .from(aiConversasTable)
    .where(and(eq(aiConversasTable.id, conversaId), eq(aiConversasTable.escolaId, escolaId)));
  return !!c;
}

// [IA-AMPLIADA] Mesmo filtro da Minha Agenda e das Reservas: so a grade
// oficial (ou linhas antigas sem versao) -- nunca rascunho/experimento.
const SO_GRADE_OFICIAL = or(eq(horariosTable.versaoGrade, "oficial"), isNull(horariosTable.versaoGrade));

const TURNOS = ["matutino", "vespertino", "noturno"] as const;
type Turno = (typeof TURNOS)[number];

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
  // [IA-SEGURANCA] so devolve mensagens de conversa da propria escola
  if (!(await conversaEhDaEscola(id, getEscolaId(req)))) {
    res.status(404).json({ error: "Conversa não encontrada" });
    return;
  }
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
        // [IA-AMPLIADA] sem turno, "terça 2ª aula" de professor com aula de
        // manha e de noite era ambiguo (mesmo problema do Bug 4 da HA).
        turno: { type: "string", enum: ["matutino", "vespertino", "noturno"], description: "Turno da aula. Informe se o usuário disse (manhã=matutino, tarde=vespertino, noite=noturno); se não disse, omita." },
      },
      required: ["professorNome", "diaSemana", "horarioSlot", "disponivel"],
    },
  },
  // [IA-AMPLIADA] "gerar_horario_turma" foi RETIRADO do assistente: usava o
  // motor simples antigo (5 aulas fixas, sem HA, sem CP-SAT) e, com
  // substituir=true, podia trocar a grade oficial da turma por uma pior.
  // Geracao de grade agora so pelas telas (CP-SAT) -- o assistente orienta.
  // ── CONSULTAS NOVAS (so leitura, nunca alteram nada) ──────────────────
  {
    type: "function" as const,
    name: "consultar_grade_professor",
    description:
      "Mostra a grade oficial de UM professor: dia, aula, turma, disciplina, turno e se é assíncrona, mais as horas-atividade (HA) dele (HA* = HA em contraturno). Use para 'qual o horário do professor X', 'quando a X dá aula', 'quando é a HA do Y', 'em que turma o Z está na quarta'.",
    parameters: {
      type: "object" as const,
      properties: { professorNome: { type: "string", description: "Nome (ou parte do nome) do professor" } },
      required: ["professorNome"],
    },
  },
  {
    type: "function" as const,
    name: "consultar_grade_turma",
    description:
      "Mostra a grade oficial de UMA turma: dia, aula, disciplina e professor. Use para 'qual o horário da turma X', 'quem dá aula no 2A na terça', 'que aula o 3D tem na 1ª aula de sexta'.",
    parameters: {
      type: "object" as const,
      properties: { turmaNome: { type: "string", description: "Nome da turma (ex.: 2A, 3D TEC)" } },
      required: ["turmaNome"],
    },
  },
  {
    type: "function" as const,
    name: "consultar_professores_livres",
    description:
      "Lista os professores SEM aula e SEM bloqueio (HA, indisponibilidade) num dia/aula/turno — útil para achar quem pode cobrir uma falta ou substituir. Também separa quem está livre mas em HA. Use para 'quem está livre', 'quem pode substituir', 'quem cobre a aula de'.",
    parameters: {
      type: "object" as const,
      properties: {
        diaSemana: { type: "integer", description: "0=Segunda, 1=Terça, 2=Quarta, 3=Quinta, 4=Sexta" },
        numeroAula: { type: "integer", description: "Número da aula no dia, começando em 1" },
        turno: { type: "string", enum: ["matutino", "vespertino", "noturno"], description: "Turno (manhã=matutino, tarde=vespertino, noite=noturno)" },
      },
      required: ["diaSemana", "numeroAula", "turno"],
    },
  },
  {
    type: "function" as const,
    name: "consultar_guia_sistema",
    description:
      "Busca o passo a passo oficial de uma tela ou tarefa do NexGrade (como cadastrar, configurar, gerar, exportar etc.). Use SEMPRE que a pergunta for 'como faço', 'onde fica', 'como cadastro', 'para que serve' alguma coisa do sistema.",
    parameters: {
      type: "object" as const,
      properties: {
        tema: { type: "string", enum: TOPICOS_GUIA, description: "Assunto do guia mais próximo da pergunta" },
      },
      required: ["tema"],
    },
  },
  {
    type: "function" as const,
    name: "consultar_reservas",
    description:
      "Consulta reservas de salas/espaços num período (padrão: hoje até 7 dias), com filtros opcionais de professor e sala. Devolve também o limite semanal e quantas reservas ativas o professor tem na semana. Use para 'reservas da semana', 'o laboratório está livre', 'quantas reservas a professora X ainda pode fazer'.",
    parameters: {
      type: "object" as const,
      properties: {
        dataInicio: { type: "string", description: "Data inicial AAAA-MM-DD (padrão: hoje)" },
        dataFim: { type: "string", description: "Data final AAAA-MM-DD (padrão: 7 dias depois do início)" },
        professorNome: { type: "string", description: "Filtrar por professor (opcional)" },
        salaNome: { type: "string", description: "Filtrar por sala/espaço (opcional)" },
        incluirCanceladas: { type: "boolean", description: "Incluir reservas canceladas (padrão: false)" },
      },
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
  | { tipo: "definir_disponibilidade"; payload: { professorId: number; diaSemana: number; horarioSlot: number; disponivel: boolean; motivo?: string; turno: Turno } };

// ── CONSULTAS DO ASSISTENTE (so leitura) ───────────────────────────────
// [IA-AMPLIADA] Todas filtram por escolaId e so leem a grade OFICIAL.

const nomeDia = (d: number) => DIAS_SEMANA[d] ?? `dia ${d}`;

// Busca por nome igual ao das acoes: ignora maiusculas/acentos e, se
// houver um nome EXATO entre varios parecidos, fica com ele.
function semAcento(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}
function buscarPorNome<T extends { nome: string }>(lista: T[], termo: string): T[] {
  const t = semAcento(termo);
  if (!t) return [];
  const exatos = lista.filter((x) => semAcento(x.nome) === t);
  if (exatos.length === 1) return exatos;
  return lista.filter((x) => semAcento(x.nome).includes(t));
}
// Resposta padrao quando o nome nao bate com exatamente um cadastro.
function resultadoNomeAmbiguo(tipo: string, termo: string, candidatos: Array<{ nome: string }>) {
  return candidatos.length === 0
    ? { erro: `Nenhum(a) ${tipo} encontrado(a) com o nome "${termo}".` }
    : { erro: `Mais de um(a) ${tipo} com esse nome — pergunte ao usuário qual é.`, opcoes: candidatos.slice(0, 15).map((c) => c.nome) };
}

// Linhas da grade oficial da escola, ja com o turno da turma.
async function gradeOficialComTurno(escolaId: string) {
  return db
    .select({
      professorId: horariosTable.professorId,
      turmaId: horariosTable.turmaId,
      disciplinaId: horariosTable.disciplinaId,
      diaSemana: horariosTable.diaSemana,
      numeroAula: horariosTable.numeroAula,
      assincrona: horariosTable.assincrona,
      turno: turmasTable.turno,
    })
    .from(horariosTable)
    .innerJoin(turmasTable, eq(turmasTable.id, horariosTable.turmaId))
    .where(and(eq(horariosTable.escolaId, escolaId), SO_GRADE_OFICIAL));
}

// Mesma logica de "janela" (buraco entre aulas no mesmo dia) da aba
// Grade. [IA-AMPLIADA] Agora por TURNO + dia: professor com aula de manha
// e de noite nao ganha mais "janela" falsa no intervalo entre os turnos.
async function calcularJanelasProfessores(escolaId: string) {
  const [slots, profs] = await Promise.all([
    gradeOficialComTurno(escolaId),
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
      const porTurnoDia = new Map<string, { turno: string; dia: number; aulas: number[] }>();
      slotsProf.forEach((s) => {
        const k = `${s.turno}-${s.diaSemana}`;
        if (!porTurnoDia.has(k)) porTurnoDia.set(k, { turno: s.turno, dia: s.diaSemana, aulas: [] });
        porTurnoDia.get(k)!.aulas.push(s.numeroAula);
      });

      let totalJanelas = 0;
      const detalhe: Record<string, number> = {};
      for (const { turno, dia, aulas } of porTurnoDia.values()) {
        const ordenado = [...new Set(aulas)].sort((a, b) => a - b);
        const min = ordenado[0]!;
        const max = ordenado[ordenado.length - 1]!;
        const ocupados = new Set(ordenado);
        let janelas = 0;
        for (let i = min; i <= max; i++) if (!ocupados.has(i)) janelas++;
        if (janelas > 0) detalhe[`${nomeDia(dia)} (${turno})`] = janelas;
        totalJanelas += janelas;
      }

      return { professor: p.nome, totalAulas: slotsProf.length, totalJanelas, detalhe };
    })
    .sort((a, b) => b.totalJanelas - a.totalJanelas);
}

// Mesma logica do card "Turmas sem Horario" da Visao Geral, com os NOMES.
// [IA-AMPLIADA] so grade oficial e sem turmas fantasma (PAEE).
async function consultarTurmasSemHorario(escolaId: string) {
  const [turmas, horarios] = await Promise.all([
    db.select({ id: turmasTable.id, nome: turmasTable.nome, turno: turmasTable.turno })
      .from(turmasTable).where(and(eq(turmasTable.escolaId, escolaId), eq(turmasTable.fantasma, false))),
    db.select({ turmaId: horariosTable.turmaId }).from(horariosTable)
      .where(and(eq(horariosTable.escolaId, escolaId), SO_GRADE_OFICIAL)),
  ]);
  const turmasComHorario = new Set(horarios.map((h) => h.turmaId));
  const semHorario = turmas.filter((t) => !turmasComHorario.has(t.id));
  return {
    totalTurmas: turmas.length,
    totalSemHorario: semHorario.length,
    turmasSemHorario: semHorario.map((t) => ({ nome: t.nome, turno: t.turno })),
  };
}

// Total de aulas por dia da semana e por turno (so grade oficial).
async function consultarDistribuicaoSemanal(escolaId: string) {
  const horarios = await gradeOficialComTurno(escolaId);
  const porDia: Record<string, number> = {};
  const porDiaETurno: Record<string, Record<string, number>> = {};
  horarios.forEach((h) => {
    const dia = nomeDia(h.diaSemana);
    const turno = h.turno ?? "desconhecido";
    porDia[dia] = (porDia[dia] ?? 0) + 1;
    porDiaETurno[dia] = porDiaETurno[dia] ?? {};
    porDiaETurno[dia]![turno] = (porDiaETurno[dia]![turno] ?? 0) + 1;
  });
  return { totalAulas: horarios.length, porDia, porDiaETurno };
}

// [IA-AMPLIADA] Horario de inicio de cada aula por turno (esquema da escola),
// para a IA poder dizer "2ª aula (08:20)". Matutino pode ter dois esquemas
// (Fundamental/Medio) -- o horario de inicio e o mesmo nas aulas em comum.
async function horaInicioPorTurno(escolaId: string) {
  const slots = await db.select().from(horarioSlotsTable).where(eq(horarioSlotsTable.escolaId, escolaId));
  const mapa = new Map<string, string>();
  for (const s of slots) {
    if ((s as { letivo?: boolean | null }).letivo === false) continue;
    const k = `${s.turno}-${s.numeroAula}`;
    if (!mapa.has(k)) mapa.set(k, String(s.horaInicio ?? "").slice(0, 5));
  }
  return mapa;
}

// Turnos em que o professor tem aula na grade oficial (base do HA*).
async function turnosComAulaOficial(escolaId: string, professorId: number): Promise<Set<string>> {
  const linhas = await db
    .select({ turno: turmasTable.turno })
    .from(horariosTable)
    .innerJoin(turmasTable, eq(turmasTable.id, horariosTable.turmaId))
    .where(and(eq(horariosTable.escolaId, escolaId), eq(horariosTable.professorId, professorId), SO_GRADE_OFICIAL));
  return new Set(linhas.map((l) => l.turno).filter(Boolean));
}

async function consultarGradeProfessor(escolaId: string, professorNome: string) {
  const profs = await db.select({ id: professoresTable.id, nome: professoresTable.nome })
    .from(professoresTable).where(eq(professoresTable.escolaId, escolaId));
  const candidatos = buscarPorNome(profs, professorNome);
  if (candidatos.length !== 1) return resultadoNomeAmbiguo("professor", professorNome, candidatos);
  const prof = candidatos[0]!;

  const [aulas, bloqueios, horas, turnosComAula] = await Promise.all([
    db
      .select({
        diaSemana: horariosTable.diaSemana,
        numeroAula: horariosTable.numeroAula,
        assincrona: horariosTable.assincrona,
        turma: turmasTable.nome,
        turno: turmasTable.turno,
        disciplina: disciplinasTable.nome,
      })
      .from(horariosTable)
      .innerJoin(turmasTable, eq(turmasTable.id, horariosTable.turmaId))
      .innerJoin(disciplinasTable, eq(disciplinasTable.id, horariosTable.disciplinaId))
      .where(and(eq(horariosTable.escolaId, escolaId), eq(horariosTable.professorId, prof.id), SO_GRADE_OFICIAL))
      .orderBy(horariosTable.diaSemana, horariosTable.numeroAula),
    db.select().from(disponibilidadeTable)
      .where(and(eq(disponibilidadeTable.professorId, prof.id), eq(disponibilidadeTable.disponivel, false))),
    horaInicioPorTurno(escolaId),
    turnosComAulaOficial(escolaId, prof.id),
  ]);

  const ha = bloqueios.filter((b) => b.horaAtividadeObrigatoria);
  const outros = bloqueios.filter((b) => !b.horaAtividadeObrigatoria);
  return {
    professor: prof.nome,
    totalAulas: aulas.length,
    aulas: aulas.map((a) => ({
      dia: nomeDia(a.diaSemana),
      aula: a.numeroAula,
      inicio: horas.get(`${a.turno}-${a.numeroAula}`) ?? null,
      turno: a.turno,
      turma: a.turma,
      disciplina: a.disciplina,
      ...(a.assincrona ? { assincrona: true } : {}),
    })),
    horaAtividade: {
      total: ha.length,
      observacao: "HA* = hora-atividade em contraturno (num turno em que o professor não tem aula) ou referente a aulas de outro turno.",
      slots: ha
        .sort((a, b) => a.diaSemana - b.diaSemana || a.horarioSlot - b.horarioSlot)
        .map((h) => ({
          dia: nomeDia(h.diaSemana),
          aula: h.horarioSlot,
          turno: h.turno ?? "sem turno",
          inicio: h.turno ? horas.get(`${h.turno}-${h.horarioSlot}`) ?? null : null,
          rotulo: (h.turno && !turnosComAula.has(h.turno)) || ehHAOutroTurno(h.motivo) ? "HA*" : "HA", // [HA-OUTRO-TURNO]
        })),
    },
    outrasIndisponibilidades: outros.map((o) => ({
      dia: nomeDia(o.diaSemana), aula: o.horarioSlot, turno: o.turno ?? "sem turno", motivo: o.motivo ?? null,
    })),
  };
}

async function consultarGradeTurma(escolaId: string, turmaNome: string) {
  const turmas = await db.select({ id: turmasTable.id, nome: turmasTable.nome, turno: turmasTable.turno })
    .from(turmasTable).where(and(eq(turmasTable.escolaId, escolaId), eq(turmasTable.fantasma, false)));
  const candidatas = buscarPorNome(turmas, turmaNome);
  if (candidatas.length !== 1) return resultadoNomeAmbiguo("turma", turmaNome, candidatas);
  const turma = candidatas[0]!;

  const [aulas, horas] = await Promise.all([
    db
      .select({
        diaSemana: horariosTable.diaSemana,
        numeroAula: horariosTable.numeroAula,
        assincrona: horariosTable.assincrona,
        disciplina: disciplinasTable.nome,
        professor: professoresTable.nome,
      })
      .from(horariosTable)
      .innerJoin(disciplinasTable, eq(disciplinasTable.id, horariosTable.disciplinaId))
      .innerJoin(professoresTable, eq(professoresTable.id, horariosTable.professorId))
      .where(and(eq(horariosTable.escolaId, escolaId), eq(horariosTable.turmaId, turma.id), SO_GRADE_OFICIAL))
      .orderBy(horariosTable.diaSemana, horariosTable.numeroAula),
    horaInicioPorTurno(escolaId),
  ]);

  return {
    turma: turma.nome,
    turno: turma.turno,
    totalAulas: aulas.filter((a) => !a.assincrona).length,
    observacao: "Aulas assíncronas (docência em trio) são do professor, não ocupam a turma presencialmente.",
    aulas: aulas.map((a) => ({
      dia: nomeDia(a.diaSemana),
      aula: a.numeroAula,
      inicio: horas.get(`${turma.turno}-${a.numeroAula}`) ?? null,
      disciplina: a.disciplina,
      professor: a.professor,
      ...(a.assincrona ? { assincrona: true } : {}),
    })),
  };
}

async function consultarProfessoresLivres(escolaId: string, diaSemana: number, numeroAula: number, turno: Turno) {
  const [profs, grade, bloqueios] = await Promise.all([
    db.select({ id: professoresTable.id, nome: professoresTable.nome, ativo: professoresTable.ativo })
      .from(professoresTable).where(eq(professoresTable.escolaId, escolaId)),
    gradeOficialComTurno(escolaId),
    db
      .select({
        professorId: disponibilidadeTable.professorId,
        turno: disponibilidadeTable.turno,
        ha: disponibilidadeTable.horaAtividadeObrigatoria,
        motivo: disponibilidadeTable.motivo,
      })
      .from(disponibilidadeTable)
      .innerJoin(professoresTable, eq(professoresTable.id, disponibilidadeTable.professorId))
      .where(and(
        eq(professoresTable.escolaId, escolaId),
        eq(disponibilidadeTable.diaSemana, diaSemana),
        eq(disponibilidadeTable.horarioSlot, numeroAula),
        eq(disponibilidadeTable.disponivel, false),
      )),
  ]);

  const turnosDoProf = new Map<number, Set<string>>();
  const ocupados = new Set<number>();
  for (const g of grade) {
    if (!turnosDoProf.has(g.professorId)) turnosDoProf.set(g.professorId, new Set());
    turnosDoProf.get(g.professorId)!.add(g.turno);
    if (g.diaSemana === diaSemana && g.numeroAula === numeroAula && g.turno === turno) ocupados.add(g.professorId);
  }
  // Bloqueio do mesmo turno (ou antigo, sem turno) conta.
  const bloqueioPorProf = new Map<number, { ha: boolean; motivo: string | null }>();
  for (const b of bloqueios) {
    if (b.turno && b.turno !== turno) continue;
    const atual = bloqueioPorProf.get(b.professorId);
    bloqueioPorProf.set(b.professorId, { ha: (atual?.ha ?? false) || b.ha, motivo: atual?.motivo ?? b.motivo });
  }

  const livresNoTurno: string[] = [];
  const livresDeOutroTurno: string[] = [];
  const emHA: string[] = [];
  const indisponiveis: Array<{ professor: string; motivo: string | null }> = [];
  for (const p of profs) {
    if (p.ativo === false || ocupados.has(p.id)) continue;
    const bloq = bloqueioPorProf.get(p.id);
    if (bloq?.ha) { emHA.push(p.nome); continue; }
    if (bloq) { indisponiveis.push({ professor: p.nome, motivo: bloq.motivo }); continue; }
    if (turnosDoProf.get(p.id)?.has(turno)) livresNoTurno.push(p.nome);
    else livresDeOutroTurno.push(p.nome);
  }

  return {
    consulta: { dia: nomeDia(diaSemana), aula: numeroAula, turno },
    livresQueJaDaoAulaNesseTurno: livresNoTurno.sort(),
    livresMasSemAulaNesseTurno: livresDeOutroTurno.sort(),
    emHoraAtividade: emHA.sort(),
    indisponiveis,
    observacao: "Prefira sugerir quem já dá aula nesse turno (está na escola). Quem está em HA está livre de turma mas cumprindo hora-atividade.",
  };
}

function dataISO(d: Date) {
  return d.toISOString().slice(0, 10);
}
function hojeSaoPaulo() {
  return new Date(Date.now() - 3 * 60 * 60 * 1000); // UTC-3, so para escolher o "hoje" padrao
}
// Segunda-feira da semana de uma data (AAAA-MM-DD), em UTC.
function segundaDaSemana(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0=domingo
  d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return d;
}

async function consultarReservas(
  escolaId: string,
  args: { dataInicio?: string; dataFim?: string; professorNome?: string; salaNome?: string; incluirCanceladas?: boolean },
) {
  const reData = /^\d{4}-\d{2}-\d{2}$/;
  const inicio = args.dataInicio && reData.test(args.dataInicio) ? args.dataInicio : dataISO(hojeSaoPaulo());
  let fim = args.dataFim && reData.test(args.dataFim) ? args.dataFim : "";
  if (!fim) {
    const f = new Date(`${inicio}T00:00:00Z`);
    f.setUTCDate(f.getUTCDate() + 7);
    fim = dataISO(f);
  }

  const condicoes = [eq(reservasTable.escolaId, escolaId), gte(reservasTable.data, inicio), lte(reservasTable.data, fim)];
  if (!args.incluirCanceladas) condicoes.push(ne(reservasTable.status, "cancelada"));

  let professorFiltro: { id: number; nome: string } | null = null;
  if (args.professorNome) {
    const profs = await db.select({ id: professoresTable.id, nome: professoresTable.nome })
      .from(professoresTable).where(eq(professoresTable.escolaId, escolaId));
    const c = buscarPorNome(profs, args.professorNome);
    if (c.length !== 1) return resultadoNomeAmbiguo("professor", args.professorNome, c);
    professorFiltro = c[0]!;
    condicoes.push(eq(reservasTable.professorId, professorFiltro.id));
  }
  if (args.salaNome) {
    const salas = await db.select({ id: salasTable.id, nome: salasTable.nome })
      .from(salasTable).where(eq(salasTable.escolaId, escolaId));
    const c = buscarPorNome(salas, args.salaNome);
    if (c.length !== 1) return resultadoNomeAmbiguo("sala", args.salaNome, c);
    condicoes.push(eq(reservasTable.salaId, c[0]!.id));
  }

  const linhas = await db
    .select({
      data: reservasTable.data,
      diaSemana: reservasTable.diaSemana,
      numeroAula: reservasTable.numeroAula,
      titulo: reservasTable.titulo,
      status: reservasTable.status,
      sala: salasTable.nome,
      professor: professoresTable.nome,
    })
    .from(reservasTable)
    .innerJoin(salasTable, eq(salasTable.id, reservasTable.salaId))
    .innerJoin(professoresTable, eq(professoresTable.id, reservasTable.professorId))
    .where(and(...condicoes))
    .orderBy(reservasTable.data, reservasTable.numeroAula)
    .limit(200);

  // Limite semanal do professor (regra da coordenacao; vale para todos).
  let limite: Record<string, unknown> | undefined;
  if (professorFiltro) {
    const seg = segundaDaSemana(inicio);
    const sex = new Date(seg); sex.setUTCDate(sex.getUTCDate() + 6);
    const [regra, naSemana] = await Promise.all([
      db.select().from(regrasReservaProfessorTable).where(and(
        eq(regrasReservaProfessorTable.escolaId, escolaId),
        eq(regrasReservaProfessorTable.professorId, professorFiltro.id),
      )).then((r) => r[0]),
      db.select({ id: reservasTable.id }).from(reservasTable).where(and(
        eq(reservasTable.escolaId, escolaId),
        eq(reservasTable.professorId, professorFiltro.id),
        ne(reservasTable.status, "cancelada"),
        gte(reservasTable.data, dataISO(seg)),
        lte(reservasTable.data, dataISO(sex)),
      )),
    ]);
    const limiteSemanal = regra?.limiteSemanal ?? 2;
    limite = {
      semanaDe: dataISO(seg),
      limiteSemanal,
      reservasAtivasNaSemana: naSemana.length,
      restantes: Math.max(0, limiteSemanal - naSemana.length),
      prioridade: regra?.prioridade ?? 3,
    };
  }

  return {
    periodo: { inicio, fim },
    total: linhas.length,
    reservas: linhas.map((r) => ({
      data: r.data, dia: nomeDia(r.diaSemana), aula: r.numeroAula, sala: r.sala,
      professor: r.professor, titulo: r.titulo, status: r.status,
    })),
    ...(limite ? { limiteDoProfessor: limite } : {}),
  };
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

  // [IA-SEGURANCA] conversaId vindo do cliente so vale se for da escola
  if (conversaId != null && !(await conversaEhDaEscola(Number(conversaId), escolaId))) {
    res.status(404).json({ error: "Conversa não encontrada" });
    return;
  }

  const [professores, turmas, disciplinas] = await Promise.all([
    db.select({ nome: professoresTable.nome, id: professoresTable.id })
      .from(professoresTable).where(eq(professoresTable.escolaId, escolaId)),
    db.select({ nome: turmasTable.nome, id: turmasTable.id, turno: turmasTable.turno })
      .from(turmasTable).where(and(eq(turmasTable.escolaId, escolaId), eq(turmasTable.fantasma, false))),
    db.select({ nome: disciplinasTable.nome })
      .from(disciplinasTable).where(eq(disciplinasTable.escolaId, escolaId)),
  ]);

  // [IA-AMPLIADA] Antes so iam os 10 primeiros nomes de cada lista; agora a
  // lista inteira (com teto de seguranca), para a IA reconhecer qualquer
  // professor/turma citado. Disciplinas so como contagem (a consulta
  // detalhada vem das funcoes).
  const lista = (nomes: string[], teto: number) =>
    nomes.slice(0, teto).join(", ") + (nomes.length > teto ? ` e mais ${nomes.length - teto}` : "");
  const hoje = hojeSaoPaulo();
  const diaHoje = DIAS_SEMANA[(hoje.getUTCDay() + 6) % 7];

  const systemPrompt = `Você é o Assistente de IA do NexGrade, sistema de gestão de horários escolares usado por escolas estaduais do Paraná (SEED-PR). Você ajuda a direção e a coordenação nas dúvidas do dia a dia.

HOJE: ${dataISO(hoje)} (${diaHoje}).
Dias: 0=Segunda, 1=Terça, 2=Quarta, 3=Quinta, 4=Sexta. Turnos: matutino (manhã), vespertino (tarde), noturno (noite).

CONTEXTO DA ESCOLA:
- Professores (${professores.length}): ${lista(professores.map((p) => p.nome), 150)}
- Turmas (${turmas.length}): ${lista(turmas.map((t) => `${t.nome} [${t.turno}]`), 80)}
- Disciplinas cadastradas: ${disciplinas.length}

REGRAS IMPORTANTES:
1. Para qualquer pergunta sobre dados da escola, CHAME a função de consulta adequada — nunca responda de memória nem invente horários:
   - consultar_grade_professor: horário de um professor, quando dá aula, quando é a HA dele.
   - consultar_grade_turma: horário de uma turma, quem dá aula em que dia/aula.
   - consultar_professores_livres: quem está livre / pode substituir num dia, aula e turno (se faltar o turno, pergunte).
   - consultar_reservas: reservas de salas/espaços, se um espaço está livre, quantas reservas um professor ainda pode fazer.
   - consultar_janelas_professores, consultar_turmas_sem_horario, consultar_distribuicao_semanal: análises da grade.
2. Ação: você só pode PROPOR marcar disponibilidade/indisponibilidade de um professor (definir_disponibilidade). O sistema sempre pede confirmação antes de gravar. Hora-atividade (HA) não pode ser alterada por você.
3. Você NÃO gera nem altera a grade. Se pedirem para gerar/refazer horário, explique: menu Horário → selecionar a turma → "Gerar via CP-SAT" (ou gerar o turno inteiro pelo Modo Experimental e depois promover para oficial). Isso garante HA, regras SEED-PR e menos janelas.
4. HA = hora-atividade; HA* = hora-atividade em contraturno (num turno em que o professor não tem aula). Aula assíncrona (docência em trio) é do professor e não ocupa a turma presencialmente.
5. Se um nome for ambíguo, pergunte qual é — nunca adivinhe.

COMO USAR O NEXGRADE (dúvidas de "como faço", "onde fica", "como cadastro"):
- Chame consultar_guia_sistema com o assunto e responda em passos numerados, usando exatamente os nomes de menus e botões que vierem no guia.
- Assuntos do guia: ${TOPICOS_GUIA.map((k) => `${k} (${GUIA_NEXGRADE[k]!.titulo})`).join("; ")}.
- Se a pergunta envolver mais de um assunto (ex.: cadastrar professor E marcar disponibilidade), consulte o principal e cite o outro passo resumido, oferecendo detalhar.
Se o guia não cobrir o que foi perguntado, diga que não tem certeza em vez de inventar um caminho.

Seja direto e claro, em português do Brasil. Use tabelas curtas quando listar horários.`;

  let historico: { role: string; content: string }[] = [];
  if (conversaId) {
    const msgs = await db.select().from(aiMensagensTable)
      .where(eq(aiMensagensTable.conversaId, conversaId))
      .orderBy(aiMensagensTable.createdAt);
    // [IA-AMPLIADA] so as ultimas 20 mensagens -- conversa longa nao estoura o limite/custo
    historico = msgs.slice(-20).map(m => ({ role: m.role, content: m.content }));
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
    // sobre não arriscar o nome do campo de system prompt).
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
    const responderCom = (dados: unknown) =>
      pedirRespostaComResultadoFuncao(apiKey, interaction.id, functionCall!, dados);

    if (functionCall?.name === "definir_disponibilidade") {
      const args = functionCall.arguments as {
        professorNome: string; diaSemana: number; horarioSlot: number; disponivel: boolean; motivo?: string; turno?: string;
      };
      const candidatos = buscarPorNome(professores, args.professorNome ?? "");

      if (candidatos.length === 0) {
        respostaTexto = `Não encontrei nenhum professor chamado "${args.professorNome}" cadastrado. Verifique o nome e tente novamente.`;
      } else if (candidatos.length > 1) {
        respostaTexto = `Encontrei mais de um professor com esse nome: ${candidatos.map(p => p.nome).join(", ")}. Qual deles você quer dizer? Pode repetir o pedido com o nome completo.`;
      } else {
        const prof = candidatos[0]!;
        const dia = DIAS_SEMANA[args.diaSemana] ?? `dia ${args.diaSemana}`;
        // [IA-AMPLIADA] Turno: o informado; senao, o unico turno em que o
        // professor da aula; se ele tem aula em mais de um, pergunta.
        let turno: Turno | null = (TURNOS as readonly string[]).includes(args.turno ?? "") ? (args.turno as Turno) : null;
        if (!turno) {
          const turnosProf = [...(await turnosComAulaOficial(escolaId, prof.id))].filter((t): t is Turno =>
            (TURNOS as readonly string[]).includes(t));
          if (turnosProf.length === 1) turno = turnosProf[0]!;
        }
        if (!turno) {
          respostaTexto = `${prof.nome} tem aula em mais de um turno (ou ainda não tem aula na grade). Em qual turno é a ${args.horarioSlot}ª aula de ${dia.toLowerCase()}: manhã, tarde ou noite?`;
        } else {
          // [IA-SEGURANCA] HA obrigatoria nao e alterada pelo assistente
          const [existente] = await db.select().from(disponibilidadeTable).where(and(
            eq(disponibilidadeTable.professorId, prof.id),
            eq(disponibilidadeTable.diaSemana, args.diaSemana),
            eq(disponibilidadeTable.horarioSlot, args.horarioSlot),
            eq(disponibilidadeTable.turno, turno),
          ));
          if (existente?.horaAtividadeObrigatoria) {
            respostaTexto = `Esse horário (${dia}, ${args.horarioSlot}ª aula, ${turno}) é **hora-atividade (HA)** de ${prof.nome}. Por segurança, o assistente não altera HA — faça pela tela **Disponibilidade**.`;
          } else {
            respostaTexto = `Confirma marcar **${prof.nome}** como **${args.disponivel ? "disponível" : "indisponível"}** na ${dia}-feira, ${args.horarioSlot}ª aula do turno **${turno}**${args.motivo ? ` (motivo: ${args.motivo})` : ""}?`;
            acaoPendente = {
              tipo: "definir_disponibilidade",
              payload: { professorId: prof.id, diaSemana: args.diaSemana, horarioSlot: args.horarioSlot, disponivel: args.disponivel, motivo: args.motivo, turno },
            };
          }
        }
      }
    } else if (functionCall?.name === "consultar_janelas_professores") {
      const janelas = await calcularJanelasProfessores(escolaId);
      respostaTexto = await responderCom({ janelas: janelas.slice(0, 30) });
    } else if (functionCall?.name === "consultar_turmas_sem_horario") {
      respostaTexto = await responderCom(await consultarTurmasSemHorario(escolaId));
    } else if (functionCall?.name === "consultar_distribuicao_semanal") {
      respostaTexto = await responderCom(await consultarDistribuicaoSemanal(escolaId));
    } else if (functionCall?.name === "consultar_grade_professor") {
      const a = functionCall.arguments as { professorNome?: string };
      respostaTexto = await responderCom(await consultarGradeProfessor(escolaId, a.professorNome ?? ""));
    } else if (functionCall?.name === "consultar_grade_turma") {
      const a = functionCall.arguments as { turmaNome?: string };
      respostaTexto = await responderCom(await consultarGradeTurma(escolaId, a.turmaNome ?? ""));
    } else if (functionCall?.name === "consultar_professores_livres") {
      const a = functionCall.arguments as { diaSemana?: number; numeroAula?: number; turno?: string };
      const turnoOk = (TURNOS as readonly string[]).includes(a.turno ?? "");
      respostaTexto = turnoOk && Number.isInteger(a.diaSemana) && Number.isInteger(a.numeroAula)
        ? await responderCom(await consultarProfessoresLivres(escolaId, a.diaSemana!, a.numeroAula!, a.turno as Turno))
        : "Para ver quem está livre, preciso do dia, do número da aula e do turno (manhã, tarde ou noite).";
    } else if (functionCall?.name === "consultar_guia_sistema") {
      const a = functionCall.arguments as { tema?: string };
      const trechos = buscarNoGuia(a.tema ?? "");
      respostaTexto = await responderCom(trechos.length
        ? { guia: trechos }
        : { erro: "Assunto não encontrado no guia.", assuntosDisponiveis: TOPICOS_GUIA });
    } else if (functionCall?.name === "consultar_reservas") {
      respostaTexto = await responderCom(await consultarReservas(escolaId, functionCall.arguments as Parameters<typeof consultarReservas>[1]));
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
// Esta rota nunca fala com o Gemini -- so aplica no banco a acao que o
// usuario ja confirmou. Alteracoes so para org:admin (filtro global
// exigirAdminParaAlterar em routes/index.ts).
// [IA-AMPLIADA] mudancas: turno obrigatorio na disponibilidade, HA
// protegida, conversaId conferido e "gerar_horario_turma" desativado.

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
      turno: z.enum(TURNOS),
    }),
  }),
  // Mantido so para responder com mensagem clara a botoes antigos que
  // ainda estejam na tela de alguma conversa anterior.
  z.object({
    tipo: z.literal("gerar_horario_turma"),
    conversaId: z.number().int().optional(),
    payload: z.unknown(),
  }),
]);

router.post("/executar-acao", async (req, res) => {
  const escolaId = getEscolaId(req);
  const usuarioId = getUsuarioId(req);
  const parsed = ExecutarAcaoInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ação inválida ou desatualizada. Peça de novo ao assistente." });
    return;
  }

  if (parsed.data.tipo === "gerar_horario_turma") {
    res.status(410).json({
      error: "Gerar horário pelo assistente foi desativado. Use Horário → selecione a turma → \"Gerar via CP-SAT\".",
    });
    return;
  }

  // [IA-SEGURANCA] so grava mensagem em conversa da propria escola
  const conversaId = parsed.data.conversaId != null && (await conversaEhDaEscola(parsed.data.conversaId, escolaId))
    ? parsed.data.conversaId
    : null;

  const { professorId, diaSemana, horarioSlot, disponivel, motivo, turno } = parsed.data.payload;

  const professor = await db.select().from(professoresTable)
    .where(and(eq(professoresTable.id, professorId), eq(professoresTable.escolaId, escolaId)))
    .then(r => r[0]);
  if (!professor) {
    res.status(404).json({ error: "Professor não encontrado" });
    return;
  }

  // Mesma chave da tela Disponibilidade: professor + dia + aula + TURNO
  // (indice unico no banco). Antes faltava o turno.
  const existente = await db.select().from(disponibilidadeTable)
    .where(and(
      eq(disponibilidadeTable.professorId, professorId),
      eq(disponibilidadeTable.diaSemana, diaSemana),
      eq(disponibilidadeTable.horarioSlot, horarioSlot),
      eq(disponibilidadeTable.turno, turno),
    ))
    .then(r => r[0]);

  // [IA-SEGURANCA] confere de novo na hora de gravar (a HA pode ter sido
  // recalculada entre a pergunta e o clique em Confirmar).
  if (existente?.horaAtividadeObrigatoria) {
    res.status(409).json({ error: "Esse horário é hora-atividade (HA). Altere pela tela Disponibilidade." });
    return;
  }

  const registro = existente
    ? (await db.update(disponibilidadeTable)
        .set({ disponivel, motivo })
        .where(eq(disponibilidadeTable.id, existente.id))
        .returning())[0]
    : (await db.insert(disponibilidadeTable)
        .values({ professorId, diaSemana, horarioSlot, disponivel, motivo, turno })
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

  const mensagem = `✅ ${professor.nome} marcado(a) como ${disponivel ? "disponível" : "indisponível"} na ${DIAS_SEMANA[diaSemana]}-feira, ${horarioSlot}ª aula (${turno}).`;
  if (conversaId) {
    await db.insert(aiMensagensTable).values({ conversaId, role: "assistant", content: mensagem });
  }

  res.json({ mensagem, resultado: registro });
});

export default router;
