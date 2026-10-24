// [ESPACOS-LIVRES] (24/10/2026) Quadro da semana (segunda a sexta), por periodo e aula: o que esta
// reservado (espaco/equipamento e professor) e os espacos livres. O gestor de reservas baixa o PDF e
// manda no grupo dos professores. Leitura so da equipe (traz nome de professor).
// Livre = espaco ativo sem reserva (pendente ou confirmada) e sem bloqueio naquela aula e periodo.
// Reserva antiga sem periodo (turno nulo) ocupa a aula em todos os periodos.
import { db, horarioSlotsTable, professoresTable, recursosTable, reservasRecursosTable, reservasTable, salasTable } from "@workspace/db";
import { and, eq, gte, lte, ne } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { ocupacaoDoDia } from "./ocupacao-reservas";

const ORDEM_TURNO = ["matutino", "vespertino", "noturno"];
const NOME_TURNO: Record<string, string> = { matutino: "Manhã", vespertino: "Tarde", noturno: "Noite" };
const NOME_DIA = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];
const ehSalaTablets = (nome: string) => /^tablets?$/i.test(nome.trim());
// [ESPACOS-LIVRES-ABREV] mesmas abreviacoes do mapa de ocupacao (lib/reservas-formato.ts do portal)
// "Laboratório de Informática - 01 Bloco 1" -> "Lab. Info. 01 B1"; "Simone Vitoriano de Barros" -> "Simone Barros"
export const abreviarEspaco = (nome: string) =>
  nome
    .replace(/^Laborat[óo]rio\s+(de\s+|da\s+|do\s+)?/i, "Lab. ")
    .replace(/Inform[áa]tica/gi, "Info.")
    .replace(/Ci[êe]ncias/gi, "Ciên.")
    .replace(/Biblioteca/gi, "Bibl.")
    .replace(/Audit[óo]rio/gi, "Audit.")
    .replace(/\bBloco\s+(\d+)/gi, "B$1")
    .replace(/Poliesportiva/gi, "Poli.")
    .replace(/Programa[çc][ãa]o/gi, "Prog.")
    .replace(/\s+-\s+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
export const abreviarProfessor = (nome: string) => {
  const p = nome.replace(/\(.*?\)/g, "").trim().split(/\s+/);
  return p.length > 2 ? `${p[0]} ${p[p.length - 1]}` : p.join(" ");
};

export type EspacosLivresSemana = {
  inicio: string;
  fim: string;
  dias: string[]; // AAAA-MM-DD, segunda a sexta
  espacos: Array<{ id: number; nome: string }>;
  turnos: Array<{
    turno: string;
    // livres[dia] = ids dos espacos livres; reservadas[dia] = "Espaco - Professor" (pendente marcada)
    aulas: Array<{ numeroAula: number; horaInicio: string; livres: number[][]; reservadas: Array<Array<{ texto: string; pendente: boolean }>> }>;
  }>;
};

const somaDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export function segundaDaSemana(iso: string): string {
  const dow = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return somaDias(iso, dow === 0 ? 1 : dow === 6 ? 2 : 1 - dow); // fim de semana -> proxima semana
}

export async function espacosLivresDaSemana(escolaId: string, dataQualquer: string): Promise<EspacosLivresSemana> {
  const inicio = segundaDaSemana(dataQualquer);
  const dias = Array.from({ length: 5 }, (_, i) => somaDias(inicio, i));
  const [salas, slots, ocupacoes, resEspacos, resEquip] = await Promise.all([
    db.select({ id: salasTable.id, nome: salasTable.nome }).from(salasTable)
      .where(and(eq(salasTable.escolaId, escolaId), eq(salasTable.ativa, true))),
    db.select({ turno: horarioSlotsTable.turno, numeroAula: horarioSlotsTable.numeroAula, horaInicio: horarioSlotsTable.horaInicio, letivo: horarioSlotsTable.letivo })
      .from(horarioSlotsTable).where(eq(horarioSlotsTable.escolaId, escolaId)),
    Promise.all(dias.map((d) => ocupacaoDoDia(escolaId, d))),
    db.select({ data: reservasTable.data, numeroAula: reservasTable.numeroAula, turno: reservasTable.turno, status: reservasTable.status, nome: salasTable.nome, professor: professoresTable.nome })
      .from(reservasTable)
      .innerJoin(salasTable, eq(salasTable.id, reservasTable.salaId))
      .innerJoin(professoresTable, eq(professoresTable.id, reservasTable.professorId))
      .where(and(eq(reservasTable.escolaId, escolaId), gte(reservasTable.data, inicio), lte(reservasTable.data, dias[4]!), ne(reservasTable.status, "cancelada"))),
    db.select({ data: reservasRecursosTable.data, numeroAula: reservasRecursosTable.numeroAula, turno: reservasRecursosTable.turno, status: reservasRecursosTable.status, nome: recursosTable.nome, quantidade: reservasRecursosTable.quantidade, professor: professoresTable.nome })
      .from(reservasRecursosTable)
      .innerJoin(recursosTable, eq(recursosTable.id, reservasRecursosTable.recursoId))
      .innerJoin(professoresTable, eq(professoresTable.id, reservasRecursosTable.professorId))
      .where(and(eq(reservasRecursosTable.escolaId, escolaId), gte(reservasRecursosTable.data, inicio), lte(reservasRecursosTable.data, dias[4]!), ne(reservasRecursosTable.status, "cancelada"))),
  ]);
  const reservasNaAula = (dia: string, turno: string, numeroAula: number) => [
    ...resEspacos.filter((r) => String(r.data).slice(0, 10) === dia && r.numeroAula === numeroAula && (r.turno === turno || r.turno === null))
      .map((r) => ({ texto: `${abreviarEspaco(r.nome)}: ${abreviarProfessor(r.professor)}`, pendente: r.status === "pendente" })),
    ...resEquip.filter((r) => String(r.data).slice(0, 10) === dia && r.numeroAula === numeroAula && r.turno === turno)
      .map((r) => ({ texto: `${abreviarEspaco(r.nome)} (${r.quantidade}): ${abreviarProfessor(r.professor)}`, pendente: r.status === "pendente" })),
  ].sort((a, b) => a.texto.localeCompare(b.texto, "pt-BR"));
  const espacos = salas.filter((s) => !ehSalaTablets(s.nome)).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  // aulas letivas de cada periodo (o mesmo numero em niveis diferentes vira uma linha, com a hora mais cedo)
  const porTurno = new Map<string, Map<number, string>>();
  for (const s of slots) {
    if (s.letivo === false) continue;
    const m = porTurno.get(s.turno) ?? new Map<number, string>();
    const h = String(s.horaInicio ?? "").slice(0, 5);
    if (!m.has(s.numeroAula) || h < m.get(s.numeroAula)!) m.set(s.numeroAula, h);
    porTurno.set(s.turno, m);
  }

  const turnos = ORDEM_TURNO.filter((t) => porTurno.has(t)).map((turno) => ({
    turno,
    aulas: [...porTurno.get(turno)!.entries()].sort((a, b) => a[0] - b[0]).map(([numeroAula, horaInicio]) => ({
      numeroAula,
      horaInicio,
      livres: ocupacoes.map((oc) => {
        const ocupadas = new Set(oc.ocupacao
          .filter((o) => o.numeroAula === numeroAula && (o.turno === turno || o.turno === null))
          .map((o) => o.salaId));
        return espacos.filter((e) => !ocupadas.has(e.id)).map((e) => e.id);
      }),
      reservadas: dias.map((d) => reservasNaAula(d, turno, numeroAula)),
    })),
  }));
  return { inicio, fim: dias[4]!, dias, espacos, turnos };
}

// ------------------------------------------------------------------ PDF
const hex = (h: string): RGB => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const AZUL_ESCURO = hex("#0D47A1");
const AZUL = hex("#1565C0");
const CINZA_CLARO = hex("#ECEFF1");
const CINZA_ESCURO = hex("#607D8B");
const VERDE = hex("#2E7D32");
const AMBAR = hex("#B26A00");
const VERMELHO = hex("#C62828");
const BRANCO = rgb(1, 1, 1);
const PRETO = hex("#263238");

function seguro(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
}
// quebra uma lista de nomes em linhas que cabem na largura
function quebrar(itens: string[], fonte: PDFFont, tam: number, largura: number): string[] {
  const linhas: string[] = [];
  let atual = "";
  for (const it of itens.map(seguro)) {
    const tent = atual ? atual + ", " + it : it;
    if (!atual || fonte.widthOfTextAtSize(tent, tam) <= largura) atual = tent;
    else { linhas.push(atual + ","); atual = it; }
  }
  if (atual) linhas.push(atual);
  // um item sozinho maior que a largura: quebra por palavra
  return linhas.flatMap((l) => {
    if (fonte.widthOfTextAtSize(l, tam) <= largura) return [l];
    const out: string[] = [];
    let cur = "";
    for (const w of l.split(" ")) {
      const t = cur ? cur + " " + w : w;
      if (!cur || fonte.widthOfTextAtSize(t, tam) <= largura) cur = t;
      else { out.push(cur); cur = w; }
    }
    if (cur) out.push(cur);
    return out;
  });
}
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export async function gerarPdfEspacosLivres(nomeEscola: string, s: EspacosLivresSemana): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const fonte = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const LARG = 841.89, ALT = 595.28, M = 28;
  const COL_AULA = 56;
  const COL_DIA = (LARG - 2 * M - COL_AULA) / 5;
  const TAM = 7.5, ENTRE = 9.5;
  const nomeDe = new Map(s.espacos.map((e) => [e.id, abreviarEspaco(e.nome)]));
  const geradoEm = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  let pagina!: PDFPage;
  let y = 0;
  const texto = (t: string, x: number, yy: number, tam: number, f: PDFFont = fonte, cor: RGB = PRETO) =>
    pagina.drawText(seguro(t), { x, y: yy, size: tam, font: f, color: cor });

  const novaPagina = (turno: string, continua: boolean) => {
    pagina = pdf.addPage([LARG, ALT]);
    pagina.drawRectangle({ x: 0, y: ALT - 58, width: LARG, height: 58, color: AZUL_ESCURO });
    texto(nomeEscola, M, ALT - 24, 13, negrito, BRANCO);
    texto(`Reservas e espaços livres da semana — ${NOME_TURNO[turno] ?? turno}${continua ? " (continuação)" : ""}`, M, ALT - 40, 10.5, fonte, BRANCO);
    texto(`Semana de ${ddmm(s.inicio)} a ${ddmm(s.fim)}   ·   situação em ${geradoEm} (pode mudar com novas reservas)`, M, ALT - 52, 7.5, fonte, BRANCO);
    y = ALT - 72;
    // cabecalho da tabela
    pagina.drawRectangle({ x: M, y: y - 16, width: LARG - 2 * M, height: 18, color: CINZA_CLARO });
    texto("Aula", M + 4, y - 11, 8, negrito, CINZA_ESCURO);
    s.dias.forEach((d, i) => texto(`${NOME_DIA[i]} ${ddmm(d)}`, M + COL_AULA + i * COL_DIA + 4, y - 11, 8, negrito, CINZA_ESCURO));
    y -= 18;
  };

  if (s.espacos.length === 0 || s.turnos.length === 0) {
    pagina = pdf.addPage([LARG, ALT]);
    texto(nomeEscola, M, ALT - 40, 13, negrito);
    texto(s.espacos.length === 0 ? "Nenhum espaço ativo cadastrado." : "Nenhum horário de aula cadastrado.", M, ALT - 60, 10, fonte, CINZA_ESCURO);
    return pdf.save();
  }

  for (const t of s.turnos) {
    novaPagina(t.turno, false);
    t.aulas.forEach((a, idx) => {
      // cada celula: reservas (uma por linha, em azul; pendente com "(aguardando)") e depois os livres
      type Linha = { t: string; cor: RGB; f: PDFFont };
      const celulas: Linha[][] = a.livres.map((ids, d) => {
        const ls: Linha[] = [];
        for (const r of a.reservadas[d] ?? []) for (const l of quebrar([r.texto + (r.pendente ? " (aguard.)" : "")], fonte, TAM, COL_DIA - 8)) ls.push({ t: l, cor: r.pendente ? AMBAR : AZUL, f: negrito });
        if (ids.length === 0) ls.push({ t: "Nenhum livre", cor: VERMELHO, f: negrito });
        else if (ids.length === s.espacos.length) ls.push({ t: "Livres: todos", cor: VERDE, f: negrito });
        else quebrar(["Livres: " + (nomeDe.get(ids[0]!) ?? "?"), ...ids.slice(1).map((id) => nomeDe.get(id) ?? "?")], fonte, TAM, COL_DIA - 8).forEach((l) => ls.push({ t: l, cor: VERDE, f: fonte }));
        return ls;
      });
      const alt = Math.max(2, ...celulas.map((c) => c.length)) * ENTRE + 6;
      if (y - alt < M + 24) novaPagina(t.turno, true);
      if (idx % 2 === 1) pagina.drawRectangle({ x: M, y: y - alt, width: LARG - 2 * M, height: alt, color: hex("#F7F9FA") });
      texto(`${a.numeroAula}ª`, M + 4, y - 11, 9, negrito, AZUL);
      if (a.horaInicio) texto(a.horaInicio, M + 4, y - 21, 7, fonte, CINZA_ESCURO);
      celulas.forEach((c, i) => {
        const x = M + COL_AULA + i * COL_DIA + 4;
        c.forEach((l, k) => texto(l.t, x, y - 11 - k * ENTRE, TAM, l.f, l.cor));
        if (i > 0) pagina.drawLine({ start: { x: x - 4, y }, end: { x: x - 4, y: y - alt }, thickness: 0.3, color: CINZA_CLARO });
      });
      pagina.drawLine({ start: { x: M, y: y - alt }, end: { x: LARG - M, y: y - alt }, thickness: 0.4, color: CINZA_CLARO });
      y -= alt;
    });
  }

  const paginas = pdf.getPages();
  paginas.forEach((p, i) => {
    const t = seguro(`Azul = reservado  ·  laranja = aguardando confirmação  ·  verde = livre (sem reserva e sem bloqueio).   ·   Página ${i + 1} de ${paginas.length}  ·  NexGrade`);
    const w = fonte.widthOfTextAtSize(t, 7);
    p.drawText(t, { x: LARG - M - w, y: 14, size: 7, font: fonte, color: CINZA_ESCURO });
  });
  return pdf.save();
}
