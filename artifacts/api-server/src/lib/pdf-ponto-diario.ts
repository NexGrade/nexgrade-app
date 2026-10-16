// [PONTO-DIARIO] (15/10/2026) Relatorio de ponto de UM dia: uma linha por professor, uma
// coluna por aula do turno (TURMA/SIGLA, H.A., atividade fora de sala ou traco de
// indisponivel), mais Entrada, Saida e Observacao para preencher a mao. A4 paisagem.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { sanitizarTextoPdf } from "./pdf-grade";

export type CelulaPonto = { texto: string; tipo: "aula" | "ha" | "atividade" | "indisponivel" | "livre" };
export type LinhaPonto = { professor: string; celulas: CelulaPonto[]; aulas: number; ha: number };
export type TurnoPonto = { turno: string; rotulo: string; colunas: Array<{ numeroAula: number; hora: string }>; linhas: LinhaPonto[] };
export type PontoDiario = { escola: string; data: string; dataBR: string; diaSemana: string; aviso: string | null; turnos: TurnoPonto[] };

const LARGURA = 841.89;
const ALTURA = 595.28;
const MARGEM = 26;
const AZUL_ESCURO = rgb(0x0d / 255, 0x47 / 255, 0xa1 / 255);
const AZUL_CLARO = rgb(0xe3 / 255, 0xf2 / 255, 0xfd / 255);
const CINZA_BORDA = rgb(0.72, 0.75, 0.78);
const CINZA_TEXTO = rgb(0.38, 0.45, 0.5);
const CINZA_ZEBRA = rgb(0.97, 0.98, 0.985);
const PRETO = rgb(0.12, 0.12, 0.12);
const BRANCO = rgb(1, 1, 1);
const AMARELO_HA = rgb(1, 0.95, 0.75);
const LILAS_ATIV = rgb(0.93, 0.92, 0.98);
const VERMELHO_AVISO = rgb(0.72, 0.11, 0.11);

function caber(texto: string, f: PDFFont, tamanho: number, largura: number): string {
  let t = sanitizarTextoPdf(texto);
  if (f.widthOfTextAtSize(t, tamanho) <= largura) return t;
  while (t.length > 1 && f.widthOfTextAtSize(t + "…", tamanho) > largura) t = t.slice(0, -1);
  return t + "…";
}

export async function gerarPdfPontoDiario(p: PontoDiario): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`NexGrade — Ponto diário ${p.dataBR}`);
  pdf.setProducer("NexGrade (by Nexus Core Tecnologia)");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const paginas: PDFPage[] = [];
  function novaPagina(turno: TurnoPonto | null): { page: PDFPage; y: number } {
    const page = pdf.addPage([LARGURA, ALTURA]);
    paginas.push(page);
    page.drawRectangle({ x: 0, y: ALTURA - 44, width: LARGURA, height: 44, color: AZUL_ESCURO });
    page.drawText(caber(p.escola, bold, 12, 480), { x: MARGEM, y: ALTURA - 20, size: 12, font: bold, color: BRANCO });
    page.drawText(`Ponto diário${turno ? " · " + turno.rotulo : ""}`, { x: MARGEM, y: ALTURA - 35, size: 9, font, color: rgb(0.85, 0.9, 1) });
    const dataTxt = `${p.diaSemana}, ${p.dataBR}`;
    page.drawText(dataTxt, { x: LARGURA - MARGEM - bold.widthOfTextAtSize(dataTxt, 12), y: ALTURA - 27, size: 12, font: bold, color: BRANCO });
    let y = ALTURA - 58;
    if (p.aviso) {
      page.drawText(caber(p.aviso, bold, 9, LARGURA - 2 * MARGEM), { x: MARGEM, y, size: 9, font: bold, color: VERMELHO_AVISO });
      y -= 14;
    }
    return { page, y };
  }

  if (!p.turnos.some((t) => t.linhas.length)) {
    const { page, y } = novaPagina(null);
    page.drawText("Nenhum professor com aula ou hora-atividade neste dia.", { x: MARGEM, y: y - 10, size: 11, font, color: CINZA_TEXTO });
  }

  for (const turno of p.turnos) {
    if (!turno.linhas.length) continue;
    const larguraUtil = LARGURA - 2 * MARGEM;
    const wProf = 128, wEnt = 58, wSai = 58, wSit = 100, wAss = 92;
    const n = Math.max(1, turno.colunas.length);
    const wAula = (larguraUtil - wProf - wEnt - wSai - wSit - wAss) / n;
    const hCab = 26, hLinha = 23;
    const xs: number[] = [MARGEM, MARGEM + wProf];
    for (let i = 0; i < n; i++) xs.push(xs[xs.length - 1]! + wAula);
    { const x0 = xs[xs.length - 1]!; xs.push(x0 + wEnt, x0 + wEnt + wSai, x0 + wEnt + wSai + wSit, MARGEM + larguraUtil); }
    const xSit = xs[xs.length - 3]!;

    let { page, y } = novaPagina(turno);
    const cabecalho = () => {
      page.drawRectangle({ x: MARGEM, y: y - hCab, width: larguraUtil, height: hCab, color: AZUL_CLARO, borderColor: CINZA_BORDA, borderWidth: 0.6 });
      const titulos: Array<[string, string?]> = [["Professor"], ...turno.colunas.map((c) => [`${c.numeroAula}ª aula`, c.hora] as [string, string]), ["Hora entrada"], ["Hora saída"], ["Situação"], ["Assinatura"]];
      titulos.forEach(([t1, t2], i) => {
        const x0 = xs[i]!, w = xs[i + 1]! - x0;
        if (i > 0) page.drawLine({ start: { x: x0, y }, end: { x: x0, y: y - hCab }, thickness: 0.6, color: CINZA_BORDA });
        const l1 = caber(t1, bold, 8, w - 4);
        const x1 = i === 0 ? x0 + 5 : x0 + (w - bold.widthOfTextAtSize(l1, 8)) / 2;
        page.drawText(l1, { x: x1, y: t2 ? y - 11 : y - 16, size: 8, font: bold, color: AZUL_ESCURO });
        if (t2) page.drawText(t2, { x: x0 + (w - font.widthOfTextAtSize(t2, 7)) / 2, y: y - 21, size: 7, font, color: CINZA_TEXTO });
      });
      y -= hCab;
    };
    cabecalho();

    turno.linhas.forEach((linha, idx) => {
      if (y - hLinha < 30) {
        ({ page, y } = novaPagina(turno));
        cabecalho();
      }
      const yb = y - hLinha;
      if (idx % 2 === 1) page.drawRectangle({ x: MARGEM, y: yb, width: larguraUtil, height: hLinha, color: CINZA_ZEBRA });
      page.drawText(caber(linha.professor, bold, 8.5, wProf - 8), { x: MARGEM + 5, y: yb + 8, size: 8.5, font: bold, color: PRETO });
      linha.celulas.forEach((c, i) => {
        const x0 = xs[i + 1]!, w = wAula;
        if (c.tipo === "ha") page.drawRectangle({ x: x0 + 1.5, y: yb + 2, width: w - 3, height: hLinha - 4, color: AMARELO_HA });
        if (c.tipo === "atividade") page.drawRectangle({ x: x0 + 1.5, y: yb + 2, width: w - 3, height: hLinha - 4, color: LILAS_ATIV });
        if (c.tipo === "indisponivel") {
          page.drawLine({ start: { x: x0 + 6, y: yb + hLinha / 2 }, end: { x: x0 + w - 6, y: yb + hLinha / 2 }, thickness: 0.7, color: CINZA_TEXTO, dashArray: [2, 2] });
          return;
        }
        if (!c.texto) return;
        const f = c.tipo === "aula" ? font : bold;
        let tam = 7.5;
        while (tam > 5.5 && f.widthOfTextAtSize(sanitizarTextoPdf(c.texto), tam) > w - 4) tam -= 0.25;
        const t = caber(c.texto, f, tam, w - 4);
        page.drawText(t, { x: x0 + (w - f.widthOfTextAtSize(t, tam)) / 2, y: yb + 8.5, size: tam, font: f, color: c.tipo === "aula" ? PRETO : CINZA_TEXTO });
      });
      // situacao: quadradinhos para marcar a mao
      {
        const rotulos = ["P", "F", "AT", "ATR"];
        const larg = rotulos.reduce((s2, r) => s2 + 7 + 2 + font.widthOfTextAtSize(r, 6.5) + 5, -5);
        let x = xSit + (wSit - larg) / 2;
        for (const r of rotulos) {
          page.drawRectangle({ x, y: yb + 8, width: 7, height: 7, borderColor: CINZA_TEXTO, borderWidth: 0.7 });
          page.drawText(r, { x: x + 9, y: yb + 8.6, size: 6.5, font, color: CINZA_TEXTO });
          x += 7 + 2 + font.widthOfTextAtSize(r, 6.5) + 5;
        }
      }
      // grade da linha
      page.drawRectangle({ x: MARGEM, y: yb, width: larguraUtil, height: hLinha, borderColor: CINZA_BORDA, borderWidth: 0.6 });
      for (let i = 1; i < xs.length - 1; i++) page.drawLine({ start: { x: xs[i]!, y }, end: { x: xs[i]!, y: yb }, thickness: 0.6, color: CINZA_BORDA });
      y = yb;
    });

    if (y > 44) {
      const tot = turno.linhas.length;
      page.drawText(`${tot} professor(es) · H.A. = hora-atividade · atividade fora de sala com o código da escola · traço = sem expediente · P = presente, F = falta, AT = atestado, ATR = atraso`, { x: MARGEM, y: y - 12, size: 7, font, color: CINZA_TEXTO });
    }
  }

  paginas.forEach((page, i) => {
    page.drawText(`Gerado pelo NexGrade em ${agora}`, { x: MARGEM, y: 12, size: 7, font, color: CINZA_TEXTO });
    const pg = `Página ${i + 1} de ${paginas.length}`;
    page.drawText(pg, { x: LARGURA - MARGEM - font.widthOfTextAtSize(pg, 7), y: 12, size: 7, font, color: CINZA_TEXTO });
  });
  return pdf.save();
}
