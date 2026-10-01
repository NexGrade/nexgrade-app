// [RELATORIO-RESERVAS] (2026-10-01) Relatorio de reservas organizado por professor.
// Fonte unica de dados: o PDF (aqui) e o Excel (montado no frontend a partir de
// GET /api/export/reservas-dados) usam exatamente as mesmas linhas.
// Inclui TODAS as reservas do periodo: confirmadas, pendentes e canceladas.
import { db, reservasTable, professoresTable, salasTable, horariosTable, turmasTable } from "@workspace/db";
import { and, asc, eq, gte, lte, type SQL } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";

export type LinhaReserva = {
  professorId: number;
  professor: string;
  data: string; // AAAA-MM-DD
  diaSemana: number;
  numeroAula: number;
  turno: string | null;
  sala: string;
  titulo: string;
  observacoes: string | null;
  status: string; // confirmada | pendente | cancelada
  prioridade: number;
  criadaEm: string; // ISO
};

export async function buscarReservasParaRelatorio(escolaId: string, inicio?: string, fim?: string): Promise<LinhaReserva[]> {
  const condicoes: SQL[] = [eq(reservasTable.escolaId, escolaId)];
  if (inicio) condicoes.push(gte(reservasTable.data, inicio));
  if (fim) condicoes.push(lte(reservasTable.data, fim));
  const linhas = await db
    .select({
      professorId: reservasTable.professorId,
      professor: professoresTable.nome,
      data: reservasTable.data,
      diaSemana: reservasTable.diaSemana,
      numeroAula: reservasTable.numeroAula,
      turno: turmasTable.turno,
      sala: salasTable.nome,
      titulo: reservasTable.titulo,
      observacoes: reservasTable.observacoes,
      status: reservasTable.status,
      prioridade: reservasTable.prioridadeAplicada,
      criadaEm: reservasTable.createdAt,
    })
    .from(reservasTable)
    .innerJoin(professoresTable, eq(professoresTable.id, reservasTable.professorId))
    .innerJoin(salasTable, eq(salasTable.id, reservasTable.salaId))
    .leftJoin(horariosTable, eq(horariosTable.id, reservasTable.horarioId))
    .leftJoin(turmasTable, eq(turmasTable.id, horariosTable.turmaId))
    .where(and(...condicoes))
    .orderBy(asc(reservasTable.data), asc(reservasTable.numeroAula));
  return linhas
    .map((r) => ({
      ...r,
      turno: r.turno ?? null,
      criadaEm: r.criadaEm instanceof Date ? r.criadaEm.toISOString() : String(r.criadaEm),
    }))
    // padrao do sistema: ordem alfabetica pt-BR; dentro do professor, data e aula
    .sort((a, b) =>
      a.professor.localeCompare(b.professor, "pt-BR") ||
      a.data.localeCompare(b.data) ||
      a.numeroAula - b.numeroAula);
}

// ------------------------------------------------------------------ rotulos
const NOME_DIA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const SIGLA_TURNO: Record<string, string> = { matutino: "M", vespertino: "T", noturno: "N" };
export const ROTULO_STATUS: Record<string, string> = { confirmada: "Confirmada", pendente: "Pendente", cancelada: "Cancelada" };

export function diaDaData(dataISO: string): string {
  const d = new Date(dataISO + "T12:00:00");
  return Number.isNaN(d.getTime()) ? "" : NOME_DIA[d.getDay()];
}
export function dataBR(dataISO: string): string {
  const [a, m, d] = dataISO.split("-");
  return a && m && d ? d + "/" + m + "/" + a : dataISO;
}

// ------------------------------------------------------------------ PDF
const hex = (h: string): RGB => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const AZUL = hex("#1565C0");
const AZUL_ESCURO = hex("#0D47A1");
const CINZA_CLARO = hex("#ECEFF1");
const CINZA_ESCURO = hex("#607D8B");
const CINZA_CANCELADA = hex("#9AA5AB");
const AMBAR = hex("#B26A00");
const BRANCO = rgb(1, 1, 1);
const PRETO = hex("#263238");

// Helvetica (WinAnsi) nao desenha caracteres fora do Latin-1: troca aspas e
// tracos tipograficos e remove o resto (ex.: emoji) em vez de quebrar o PDF.
function seguro(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
}
function caber(texto: string, fonte: PDFFont, tam: number, largura: number): string {
  let t = seguro(texto);
  if (fonte.widthOfTextAtSize(t, tam) <= largura) return t;
  while (t.length > 1 && fonte.widthOfTextAtSize(t + "...", tam) > largura) t = t.slice(0, -1);
  return t + "...";
}

const LARG = 595.28, ALT = 841.89, MARGEM = 36;
const COLUNAS = [
  { titulo: "Data", w: 58 },
  { titulo: "Dia", w: 30 },
  { titulo: "Aula", w: 40 },
  { titulo: "Sala", w: 100 },
  { titulo: "Título", w: 203 },
  { titulo: "Status", w: 62 },
  { titulo: "Prior.", w: 30 },
];
const ALT_LINHA = 14;

export async function gerarPdfReservasPorProfessor(
  nomeEscola: string,
  periodo: { inicio?: string; fim?: string },
  linhas: LinhaReserva[],
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const fonte = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const textoPeriodo = periodo.inicio || periodo.fim
    ? "Período: " + (periodo.inicio ? dataBR(periodo.inicio) : "início") + " a " + (periodo.fim ? dataBR(periodo.fim) : "hoje")
    : "Período: todas as reservas";
  const geradoEm = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  let pagina!: PDFPage;
  let y = 0;
  const texto = (t: string, x: number, yy: number, tam: number, f: PDFFont = fonte, cor: RGB = PRETO) =>
    pagina.drawText(seguro(t), { x, y: yy, size: tam, font: f, color: cor });

  const novaPagina = (primeira: boolean) => {
    pagina = pdf.addPage([LARG, ALT]);
    y = ALT - MARGEM;
    if (primeira) {
      pagina.drawRectangle({ x: 0, y: ALT - 70, width: LARG, height: 70, color: AZUL_ESCURO });
      texto(nomeEscola, MARGEM, ALT - 30, 14, negrito, BRANCO);
      texto("Relatório de Reservas por Professor", MARGEM, ALT - 48, 11, fonte, BRANCO);
      texto(textoPeriodo + "   ·   Gerado em " + geradoEm, MARGEM, ALT - 62, 8, fonte, BRANCO);
      y = ALT - 90;
    } else {
      texto(nomeEscola + " — Relatório de Reservas por Professor", MARGEM, ALT - 28, 8, fonte, CINZA_ESCURO);
      y = ALT - 44;
    }
  };

  const cabecalhoTabela = () => {
    pagina.drawRectangle({ x: MARGEM, y: y - ALT_LINHA + 3, width: LARG - 2 * MARGEM, height: ALT_LINHA, color: CINZA_CLARO });
    let x = MARGEM + 3;
    for (const c of COLUNAS) { texto(c.titulo, x, y - 7, 7.5, negrito, CINZA_ESCURO); x += c.w; }
    y -= ALT_LINHA;
  };

  const barraProfessor = (nome: string, resumo: string, continua: boolean) => {
    pagina.drawRectangle({ x: MARGEM, y: y - 16, width: LARG - 2 * MARGEM, height: 18, color: AZUL });
    texto(caber(nome + (continua ? " (continuação)" : ""), negrito, 9.5, 300), MARGEM + 6, y - 11, 9.5, negrito, BRANCO);
    if (!continua) {
      const w = fonte.widthOfTextAtSize(seguro(resumo), 7.5);
      texto(resumo, LARG - MARGEM - 6 - w, y - 10.5, 7.5, fonte, BRANCO);
    }
    y -= 22;
  };

  const garantir = (altura: number, nome: string, resumo: string) => {
    if (y - altura >= MARGEM + 20) return false;
    novaPagina(false);
    barraProfessor(nome, resumo, true);
    cabecalhoTabela();
    return true;
  };

  novaPagina(true);

  if (linhas.length === 0) {
    texto("Nenhuma reserva no período.", MARGEM, y - 10, 10, fonte, CINZA_ESCURO);
  }

  // agrupa por professor (linhas ja chegam ordenadas por professor)
  const grupos: Array<{ nome: string; itens: LinhaReserva[] }> = [];
  for (const l of linhas) {
    const g = grupos[grupos.length - 1];
    if (g && g.nome === l.professor && g.itens[0].professorId === l.professorId) g.itens.push(l);
    else grupos.push({ nome: l.professor, itens: [l] });
  }

  const contar = (itens: LinhaReserva[], s: string) => itens.filter((i) => i.status === s).length;

  for (const g of grupos) {
    const resumo = g.itens.length + (g.itens.length === 1 ? " reserva" : " reservas") +
      "  ·  " + contar(g.itens, "confirmada") + " confirm.  ·  " + contar(g.itens, "pendente") + " pend.  ·  " + contar(g.itens, "cancelada") + " canc.";
    // barra + cabecalho + pelo menos 1 linha na mesma pagina
    if (y - (22 + 2 * ALT_LINHA) < MARGEM + 20) novaPagina(false);
    barraProfessor(g.nome, resumo, false);
    cabecalhoTabela();

    g.itens.forEach((r, idx) => {
      garantir(ALT_LINHA, g.nome, resumo);
      if (idx % 2 === 1) pagina.drawRectangle({ x: MARGEM, y: y - ALT_LINHA + 3, width: LARG - 2 * MARGEM, height: ALT_LINHA, color: hex("#F7F9FA") });
      const cancelada = r.status === "cancelada";
      const cor = cancelada ? CINZA_CANCELADA : PRETO;
      const corStatus = cancelada ? CINZA_CANCELADA : r.status === "pendente" ? AMBAR : AZUL;
      const aula = r.numeroAula + "ª" + (r.turno && SIGLA_TURNO[r.turno] ? " " + SIGLA_TURNO[r.turno] : "");
      const valores = [
        dataBR(r.data), diaDaData(r.data), aula, r.sala, r.titulo,
        ROTULO_STATUS[r.status] ?? r.status, String(r.prioridade),
      ];
      let x = MARGEM + 3;
      valores.forEach((v, i) => {
        const f = i === 5 ? negrito : fonte;
        texto(caber(v, f, 7.5, COLUNAS[i].w - 5), x, y - 7, 7.5, f, i === 5 ? corStatus : cor);
        x += COLUNAS[i].w;
      });
      if (cancelada) {
        const tw = fonte.widthOfTextAtSize(caber(r.titulo, fonte, 7.5, COLUNAS[4].w - 5), 7.5);
        const xt = MARGEM + 3 + COLUNAS.slice(0, 4).reduce((s, c) => s + c.w, 0);
        pagina.drawLine({ start: { x: xt, y: y - 4.5 }, end: { x: xt + tw, y: y - 4.5 }, thickness: 0.5, color: CINZA_CANCELADA });
      }
      y -= ALT_LINHA;
    });
    y -= 10;
  }

  // resumo geral
  if (linhas.length > 0) {
    if (y - 60 < MARGEM + 20) novaPagina(false);
    pagina.drawRectangle({ x: MARGEM, y: y - 52, width: LARG - 2 * MARGEM, height: 54, color: CINZA_CLARO });
    texto("Resumo geral", MARGEM + 8, y - 14, 10, negrito, AZUL_ESCURO);
    texto(
      linhas.length + " reservas de " + grupos.length + (grupos.length === 1 ? " professor" : " professores"),
      MARGEM + 8, y - 30, 8.5, fonte, PRETO,
    );
    texto(
      "Confirmadas: " + contar(linhas, "confirmada") + "     Pendentes: " + contar(linhas, "pendente") + "     Canceladas: " + contar(linhas, "cancelada"),
      MARGEM + 8, y - 44, 8.5, fonte, PRETO,
    );
  }

  // rodape: pagina X de N
  const paginas = pdf.getPages();
  paginas.forEach((p, i) => {
    const t = "Página " + (i + 1) + " de " + paginas.length + "  ·  NexGrade";
    const w = fonte.widthOfTextAtSize(seguro(t), 7);
    p.drawText(seguro(t), { x: LARG - MARGEM - w, y: 18, size: 7, font: fonte, color: CINZA_ESCURO });
  });

  return pdf.save();
}
