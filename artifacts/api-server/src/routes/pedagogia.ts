// [PRESENCA-PEDAGOGIA] (28/10/2026) Area da pedagogia:
//  GET  /pedagogia/presenca?data=AAAA-MM-DD&turno=matutino   lista do dia (aulas da grade oficial + marcacoes)
//  PUT  /pedagogia/presenca                                  salva as marcacoes (status null = desmarcar)
//  GET  /pedagogia/presenca/pdf?data=&turno=                 presenca do dia em PDF
//  GET  /pedagogia/presenca/mes?mes=&ano=[&formato=pdf]      faltas do mes por professor (JSON ou PDF)
//  GET  /pedagogia/agora[?data=&hora=HH:MM]                  em que aula e sala cada professor esta agora
// Leitura: so direcao, coordenacao, secretaria e pedagogia (lib/permissao.ts). Alteracao: as mesmas.
// Sem a migracao 0004 (tabela presencas_professores) a lista abre sem marcacoes e o Salvar avisa.
import { Router, type Request } from "express";
import { z } from "zod";
import { and, eq, gte, lte, sql, ne } from "drizzle-orm";
import {
  db, horariosTable, turmasTable, disciplinasTable, professoresTable, horarioSlotsTable,
  reservasTable, salasTable, licencasTable, calendarioEscolarTable, escolasTable, presencasProfessoresTable,
} from "@workspace/db";
import { getEscolaId } from "../lib/escola-id";
import { acessoDe } from "../lib/acesso";
import { getAuth } from "@clerk/express";
import { projetarIntegral, mapaIntegralDosSlots } from "../lib/turno-integral";
import { carregarAssSoTurma } from "../lib/assincrona-so-turma";
import {
  STATUS, ROTULO_STATUS, ROTULO_TURNO, TURNOS_DIA, montarDia, ondeEstaAgora, resumirMes, chaveMarca, minutosDe,
  type AulaGrade, type Marca, type SlotEsquema, type Status,
} from "../lib/presenca";
import { gerarPdfTabela } from "../lib/pdf-tabela";

const router = Router();
const NOME_DIA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const ROTULO_LICENCA: Record<string, string> = { medica: "Licença médica", maternidade: "Licença maternidade", paternidade: "Licença paternidade", capacitacao: "Capacitação", outros: "Licença" };

/** Tabela ainda nao criada (migracao atrasada): codigo 42P01 do Postgres. */
function semTabela(e: unknown): boolean {
  const c = (e as { code?: string; cause?: { code?: string } })?.code ?? (e as { cause?: { code?: string } })?.cause?.code;
  return c === "42P01";
}

function hojeSP(): { data: string; minutos: number } {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const v = (t: string) => partes.find((p) => p.type === t)?.value ?? "00";
  return { data: `${v("year")}-${v("month")}-${v("day")}`, minutos: Number(v("hour")) * 60 + Number(v("minute")) };
}

async function nomeEscola(escolaId: string): Promise<string> {
  const [e] = await db.select({ n: escolasTable.nomeFantasia }).from(escolasTable).where(eq(escolasTable.id, escolaId));
  return e?.n ?? "Escola";
}

type Dia = {
  dataBR: string; diaSemana: string; aviso: string | null;
  professores: Array<{ id: number; nome: string }>;
  aulas: AulaGrade[]; slots: SlotEsquema[]; licencas: Map<number, string>;
};

/** Aulas de verdade do dia (grade oficial, integral no turno real, sem assincronas) com a sala de cada uma. */
async function carregarDia(escolaId: string, dataISO: string): Promise<Dia | { erro: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataISO)) return { erro: "Data inválida." };
  const dow = new Date(`${dataISO}T12:00:00Z`).getUTCDay();
  const [a, m, d] = dataISO.split("-");
  const dataBR = `${d}/${m}/${a}`;
  if (dow === 0 || dow === 6) return { erro: `${dataBR} é ${NOME_DIA[dow]}: não há aula nesse dia.` };
  const diaSemana = dow - 1;
  const [turmasDoBanco, professores, disciplinas, horariosDoBanco, slotsBanco, reservas, licencas, eventos] = await Promise.all([
    db.select().from(turmasTable).where(eq(turmasTable.escolaId, escolaId)),
    db.select({ id: professoresTable.id, nome: professoresTable.nome }).from(professoresTable).where(eq(professoresTable.escolaId, escolaId)),
    db.select({ id: disciplinasTable.id, nome: disciplinasTable.nome, sigla: disciplinasTable.sigla }).from(disciplinasTable).where(eq(disciplinasTable.escolaId, escolaId)),
    db.select().from(horariosTable).where(and(eq(horariosTable.escolaId, escolaId), eq(horariosTable.diaSemana, diaSemana), sql`COALESCE(${horariosTable.versaoGrade}, 'oficial') = 'oficial'`)),
    db.select().from(horarioSlotsTable).where(eq(horarioSlotsTable.escolaId, escolaId)),
    db.select({ professorId: reservasTable.professorId, numeroAula: reservasTable.numeroAula, turno: reservasTable.turno, sala: salasTable.nome })
      .from(reservasTable).innerJoin(salasTable, eq(salasTable.id, reservasTable.salaId))
      .where(and(eq(reservasTable.escolaId, escolaId), eq(reservasTable.data, dataISO), ne(reservasTable.status, "cancelada"))),
    db.select().from(licencasTable).where(and(eq(licencasTable.escolaId, escolaId), lte(licencasTable.dataInicio, dataISO), gte(licencasTable.dataFim, dataISO))),
    db.select().from(calendarioEscolarTable).where(and(eq(calendarioEscolarTable.escolaId, escolaId), eq(calendarioEscolarTable.data, dataISO))),
  ]);
  const { turmas, aulas } = projetarIntegral(turmasDoBanco, horariosDoBanco, mapaIntegralDosSlots(slotsBanco));
  const ehAssSoTurma = await carregarAssSoTurma(escolaId);
  const turmaMap = new Map(turmas.map((t) => [t.id, t]));
  const discMap = new Map(disciplinas.map((x) => [x.id, x]));
  const salaReservada = (professorId: number, numeroAula: number, turno: string) =>
    reservas.find((r) => r.professorId === professorId && r.numeroAula === numeroAula && (!r.turno || r.turno === turno))?.sala;
  const lista: AulaGrade[] = [];
  for (const h of aulas) {
    const t = turmaMap.get(h.turmaId);
    if (!t || h.assincrona || ehAssSoTurma(h, t)) continue; // assincrona nao e presencial
    const disc = discMap.get(h.disciplinaId);
    lista.push({
      professorId: h.professorId, numeroAula: h.numeroAula, turno: t.turno, nivelEnsino: t.nivelEnsino ?? null,
      turma: t.nome, disciplina: disc?.sigla || disc?.nome || "",
      sala: salaReservada(h.professorId, h.numeroAula, t.turno) ?? h.sala ?? "",
    });
  }
  const semAula = eventos.find((e) => !e.diaLetivo && ["feriado", "recesso", "ponto_facultativo", "estudo_planejamento"].includes(e.tipo));
  return {
    dataBR, diaSemana: NOME_DIA[dow]!,
    aviso: semAula ? `Atenção: ${semAula.descricao} — dia sem aula no calendário da escola.` : null,
    professores, aulas: lista,
    slots: slotsBanco.map((s) => ({ turno: s.turno, nivelEnsino: s.nivelEnsino ?? null, numeroAula: s.numeroAula, horaInicio: String(s.horaInicio), duracaoMinutos: s.duracaoMinutos ?? 50, letivo: s.letivo })),
    licencas: new Map(licencas.map((l) => [l.professorId, ROTULO_LICENCA[l.tipo] ?? "Licença"])),
  };
}

async function carregarMarcas(escolaId: string, dataISO: string, turno?: string): Promise<{ marcas: Array<typeof presencasProfessoresTable.$inferSelect>; semTabela: boolean }> {
  try {
    const marcas = await db.select().from(presencasProfessoresTable).where(and(
      eq(presencasProfessoresTable.escolaId, escolaId), eq(presencasProfessoresTable.data, dataISO),
      ...(turno ? [eq(presencasProfessoresTable.turno, turno)] : []),
    ));
    return { marcas, semTabela: false };
  } catch (e) {
    if (semTabela(e)) return { marcas: [], semTabela: true };
    throw e;
  }
}

const marcaDe = (m: typeof presencasProfessoresTable.$inferSelect): Marca => ({
  status: m.status as Status, substitutoId: m.substitutoId ?? null, substitutoNome: m.substitutoNome ?? null, observacao: m.observacao ?? null,
});

async function montarPresenca(escolaId: string, dataISO: string, turno: string) {
  if (!(TURNOS_DIA as readonly string[]).includes(turno)) return { erro: "Escolha o turno (manhã, tarde ou noite)." };
  const dia = await carregarDia(escolaId, dataISO);
  if ("erro" in dia) return dia;
  const { marcas, semTabela } = await carregarMarcas(escolaId, dataISO, turno);
  const mapa = new Map(marcas.map((m) => [chaveMarca(m.professorId, m.numeroAula), marcaDe(m)]));
  const professores = montarDia(dia.professores, dia.aulas, dia.slots, mapa, dia.licencas, turno);
  return {
    data: dataISO, dataBR: dia.dataBR, diaSemana: dia.diaSemana, aviso: dia.aviso, turno, rotuloTurno: ROTULO_TURNO[turno] ?? turno,
    semTabela, professores,
    substitutos: [...dia.professores].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
  };
}

router.get("/presenca", async (req, res) => {
  const r = await montarPresenca(getEscolaId(req), String(req.query.data ?? ""), String(req.query.turno ?? ""));
  if ("erro" in r) { res.status(400).json({ error: r.erro }); return; }
  res.json(r);
});

const MarcaInput = z.object({
  professorId: z.number().int(),
  numeroAula: z.number().int().min(0).max(20),
  status: z.enum(STATUS).nullable(),
  substitutoId: z.number().int().nullable().optional(),
  substitutoNome: z.string().max(120).nullable().optional(),
  observacao: z.string().max(500).nullable().optional(),
});
const SalvarInput = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  turno: z.enum(TURNOS_DIA),
  marcas: z.array(MarcaInput).max(2000),
});

function quemRegistrou(req: Request): string | null {
  return acessoDe(req)?.email ?? getAuth(req).userId ?? null;
}

router.put("/presenca", async (req, res) => {
  const escolaId = getEscolaId(req);
  const p = SalvarInput.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: "Dados inválidos: " + p.error.issues.map((i) => i.message).join("; ") }); return; }
  const { data, turno, marcas } = p.data;
  const ids = new Set((await db.select({ id: professoresTable.id }).from(professoresTable).where(eq(professoresTable.escolaId, escolaId))).map((x) => x.id));
  const fora = marcas.find((m) => !ids.has(m.professorId) || (m.substitutoId != null && !ids.has(m.substitutoId)));
  if (fora) { res.status(400).json({ error: "Professor que não é desta escola." }); return; }
  const quem = quemRegistrou(req);
  try {
    let gravadas = 0, apagadas = 0;
    await db.transaction(async (tx) => {
      for (const m of marcas) {
        const onde = and(
          eq(presencasProfessoresTable.escolaId, escolaId), eq(presencasProfessoresTable.data, data), eq(presencasProfessoresTable.turno, turno),
          eq(presencasProfessoresTable.numeroAula, m.numeroAula), eq(presencasProfessoresTable.professorId, m.professorId),
        );
        if (m.status === null) { await tx.delete(presencasProfessoresTable).where(onde); apagadas++; continue; }
        const substituto = m.status === "substituido";
        const valores = {
          status: m.status,
          substitutoId: substituto ? (m.substitutoId ?? null) : null,
          substitutoNome: substituto ? (m.substitutoNome?.trim() || null) : null,
          observacao: m.observacao?.trim() || null,
          registradoPor: quem,
        };
        await tx.insert(presencasProfessoresTable)
          .values({ escolaId, data, turno, numeroAula: m.numeroAula, professorId: m.professorId, ...valores })
          .onConflictDoUpdate({
            target: [presencasProfessoresTable.escolaId, presencasProfessoresTable.data, presencasProfessoresTable.turno, presencasProfessoresTable.numeroAula, presencasProfessoresTable.professorId],
            set: { ...valores, atualizadoEm: new Date() },
          });
        gravadas++;
      }
    });
    res.json({ ok: true, gravadas, apagadas });
  } catch (e) {
    if (semTabela(e)) { res.status(503).json({ error: "A lista de presença ainda não está pronta no banco (falta a atualização do sistema). Avise o suporte NexGrade." }); return; }
    throw e;
  }
});

function rotuloMarca(m: Marca | null): string {
  if (!m) return "—";
  return ROTULO_STATUS[m.status];
}

router.get("/presenca/pdf", async (req, res) => {
  const escolaId = getEscolaId(req);
  const data = String(req.query.data ?? ""), turno = String(req.query.turno ?? "");
  const r = await montarPresenca(escolaId, data, turno);
  if ("erro" in r) { res.status(400).json({ error: r.erro }); return; }
  const nomes = new Map(r.substitutos.map((s) => [s.id, s.nome]));
  const linhas = r.professores.flatMap((p) => p.aulas.map((a, i) => ({
    destaque: a.marca?.status === "falta",
    celulas: [
      i === 0 ? p.nome + (p.licenca ? ` (${p.licenca})` : "") : "",
      `${a.numeroAula}ª ${a.hora}`, a.turmas, a.sala || "—", rotuloMarca(a.marca),
      a.marca?.status === "substituido" ? (a.marca.substitutoId != null ? nomes.get(a.marca.substitutoId) ?? "" : a.marca.substitutoNome ?? "") : "",
      a.marca?.observacao ?? "",
    ],
  })));
  const marcadas = r.professores.reduce((s, p) => s + p.aulas.filter((a) => a.marca).length, 0);
  const total = r.professores.reduce((s, p) => s + p.aulas.length, 0);
  const bytes = await gerarPdfTabela({
    escola: await nomeEscola(escolaId),
    titulo: `Presença dos professores — ${r.rotuloTurno} — ${r.diaSemana}, ${r.dataBR}`,
    subtitulo: `${marcadas} de ${total} aula(s) marcada(s)${r.aviso ? " · " + r.aviso : ""}`,
    colunas: [{ titulo: "Professor", peso: 24 }, { titulo: "Aula", peso: 9 }, { titulo: "Turma", peso: 12 }, { titulo: "Sala", peso: 11 }, { titulo: "Situação", peso: 11 }, { titulo: "Substituto", peso: 15 }, { titulo: "Observação", peso: 18 }],
    linhas, vazio: "Nenhuma aula neste turno.",
  });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="presenca_${data}_${turno}.pdf"`);
  res.send(Buffer.from(bytes));
});

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

router.get("/presenca/mes", async (req, res) => {
  const escolaId = getEscolaId(req);
  const mes = Number(req.query.mes), ano = Number(req.query.ano);
  if (!(mes >= 1 && mes <= 12) || !(ano >= 2020 && ano <= 2100)) { res.status(400).json({ error: "Mês ou ano inválido." }); return; }
  const ini = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fim = `${ano}-${String(mes).padStart(2, "0")}-${String(new Date(Date.UTC(ano, mes, 0)).getUTCDate()).padStart(2, "0")}`;
  const professores = await db.select({ id: professoresTable.id, nome: professoresTable.nome }).from(professoresTable).where(eq(professoresTable.escolaId, escolaId));
  const nomes = new Map(professores.map((p) => [p.id, p.nome]));
  let registros: Array<typeof presencasProfessoresTable.$inferSelect> = [], faltaTabela = false;
  try {
    registros = await db.select().from(presencasProfessoresTable).where(and(
      eq(presencasProfessoresTable.escolaId, escolaId), gte(presencasProfessoresTable.data, ini), lte(presencasProfessoresTable.data, fim),
    )).orderBy(presencasProfessoresTable.data, presencasProfessoresTable.turno, presencasProfessoresTable.numeroAula);
  } catch (e) { if (semTabela(e)) faltaTabela = true; else throw e; }
  const resumo = resumirMes(registros.map((x) => ({ professorId: x.professorId, status: x.status as Status, substitutoId: x.substitutoId ?? null })), nomes);
  const detalhes = registros.filter((x) => x.status !== "presente").map((x) => ({
    data: x.data, dataBR: x.data.split("-").reverse().join("/"), turno: ROTULO_TURNO[x.turno] ?? x.turno, aula: x.numeroAula,
    professor: nomes.get(x.professorId) ?? `#${x.professorId}`, situacao: ROTULO_STATUS[x.status as Status] ?? x.status,
    substituto: x.substitutoId != null ? nomes.get(x.substitutoId) ?? "" : x.substitutoNome ?? "", observacao: x.observacao ?? "",
  }));
  const titulo = `Faltas do mês por professor — ${MESES[mes - 1]} de ${ano}`;
  if (req.query.formato !== "pdf") { res.json({ mes, ano, titulo, semTabela: faltaTabela, resumo, detalhes }); return; }
  const linhas = [
    ...resumo.map((r) => ({ destaque: r.falta > 0, celulas: [r.professor, String(r.presente), String(r.falta), String(r.atraso), String(r.substituido), String(r.substituiu)] })),
    ...(detalhes.length ? [
      { grupo: true, celulas: ["Ocorrências do mês (faltas, atrasos e substituições)", "", "", "", "", ""] },
      { cabecalho: true, celulas: ["Professor", "Data", "Aula", "Situação", "Substituto", "Observação"] },
    ] : []),
    ...detalhes.map((d) => ({ destaque: d.situacao === "Falta", celulas: [d.professor, d.dataBR, `${d.turno} ${d.aula}ª`, d.situacao, d.substituto, d.observacao] })),
  ];
  const bytes = await gerarPdfTabela({
    escola: await nomeEscola(escolaId), titulo,
    subtitulo: "Contagem por aula marcada na lista de presença. \"Substituiu\" = aulas que o professor deu no lugar de outro.",
    colunas: [{ titulo: "Professor", peso: 30 }, { titulo: "Presente", peso: 10, alinhar: "centro" }, { titulo: "Falta", peso: 10, alinhar: "centro" }, { titulo: "Atraso", peso: 10, alinhar: "centro" }, { titulo: "Substituído", peso: 14, alinhar: "centro" }, { titulo: "Substituiu", peso: 14, alinhar: "centro" }],
    linhas, vazio: "Nenhuma marcação de presença neste mês.",
  });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="faltas_professores_${mes}_${ano}.pdf"`);
  res.send(Buffer.from(bytes));
});

router.get("/agora", async (req, res) => {
  const escolaId = getEscolaId(req);
  const agora = hojeSP();
  const data = typeof req.query.data === "string" && req.query.data ? req.query.data : agora.data;
  const minutos = typeof req.query.hora === "string" && /^\d{1,2}:\d{2}$/.test(req.query.hora) ? minutosDe(req.query.hora) : agora.minutos;
  const dia = await carregarDia(escolaId, data);
  if ("erro" in dia) { res.json({ data, hora: `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`, aviso: dia.erro, emAula: [], proximas: [], livres: [] }); return; }
  const { marcas } = await carregarMarcas(escolaId, data);
  const mapa = new Map(marcas.map((m) => [`${m.turno}|${chaveMarca(m.professorId, m.numeroAula)}`, marcaDe(m)]));
  const r = ondeEstaAgora(dia.professores, dia.aulas, dia.slots, mapa, minutos);
  res.json({ data, dataBR: dia.dataBR, diaSemana: dia.diaSemana, hora: `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`, aviso: dia.aviso, ...r });
});

export default router;
