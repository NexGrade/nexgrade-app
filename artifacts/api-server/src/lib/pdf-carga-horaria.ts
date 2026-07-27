import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

// Mesma paleta da marca usada em pdf-grade.ts e pdf-carga-professor.ts
const AZUL_PRINCIPAL = rgb(0x15 / 255, 0x65 / 255, 0xc0 / 255);
const AZUL_ESCURO = rgb(0x0d / 255, 0x47 / 255, 0xa1 / 255);
const CINZA_CLARO = rgb(0xec / 255, 0xef / 255, 0xf1 / 255);
const CINZA_ESCURO = rgb(0x60 / 255, 0x7d / 255, 0x8b / 255);
const CINZA_BORDA = rgb(0.7, 0.7, 0.7);
const BRANCO = rgb(1, 1, 1);
const PRETO = rgb(0.1, 0.1, 0.1);
const AMARELO_ALERTA = rgb(1, 0.93, 0.6);
const VERDE_OK = rgb(0.85, 0.95, 0.85);

const LARGURA = 595.28; // A4 retrato
const ALTURA = 841.89;
const MARGEM = 36;
const ALTURA_CABECALHO_PAGINA = 46;
const ALTURA_RODAPE = 14;
const LARGURA_UTIL = LARGURA - 2 * MARGEM;

export type ItemCargaHoraria = {
  disciplina: string;
  cargaSemanalExigida: number;
  aulasSemanaGrid: number;
  totalCumprido: number;
  totalExigido: number;
  status: "ok" | "insuficiente" | "nao_gerado";
};
export type TurmaCargaHoraria = {
  turma: string;
  itens: ItemCargaHoraria[];
};

function truncar(texto: string, max: number): string {
  return texto.length > max ? texto.slice(0, max - 1) + "…" : texto;
}

function desenharCabecalhoPagina(page: PDFPage, fontBold: PDFFont, font: PDFFont, nomeEscola: string, ano: number) {
  page.drawRectangle({ x: 0, y: ALTURA - ALTURA_CABECALHO_PAGINA, width: LARGURA, height: ALTURA_CABECALHO_PAGINA, color: AZUL_ESCURO });
  page.drawText(nomeEscola, { x: MARGEM, y: ALTURA - 20, size: 12, font: fontBold, color: BRANCO });
  page.drawText("Carga Horária Cumprida × Exigida por Disciplina e Turma", { x: MARGEM, y: ALTURA - 36, size: 9, font, color: rgb(0.85, 0.9, 1) });
  const rotuloAno = `Ano letivo ${ano}`;
  const larguraAno = fontBold.widthOfTextAtSize(rotuloAno, 10);
  page.drawText(rotuloAno, { x: LARGURA - MARGEM - larguraAno, y: ALTURA - 27, size: 10, font: fontBold, color: BRANCO });
}

function alturaDaTurma(t: TurmaCargaHoraria): number {
  let altura = 20; // nome da turma
  altura += 14; // cabeçalho da mini-tabela
  altura += t.itens.length * 13; // linhas
  altura += 14; // respiro entre turmas
  return altura;
}

function desenharTurma(page: PDFPage, font: PDFFont, fontBold: PDFFont, t: TurmaCargaHoraria, yTopo: number): number {
  let y = yTopo;

  page.drawText(t.turma, { x: MARGEM, y, size: 11, font: fontBold, color: AZUL_ESCURO });
  y -= 18;

  const colDiscX = MARGEM + 8;
  const colDiscLargura = 200;
  const colSemanaX = colDiscX + colDiscLargura;
  const colSemanaLargura = 80;
  const colAnualX = colSemanaX + colSemanaLargura;
  const colAnualLargura = 90;
  const colStatusX = colAnualX + colAnualLargura;
  const colStatusLargura = LARGURA_UTIL - 8 - colDiscLargura - colSemanaLargura - colAnualLargura;
  const larguraTotal = colDiscLargura + colSemanaLargura + colAnualLargura + colStatusLargura;

  page.drawRectangle({ x: colDiscX, y: y - 12, width: larguraTotal, height: 12, color: AZUL_PRINCIPAL });
  page.drawText("Disciplina", { x: colDiscX + 3, y: y - 9, size: 7, font: fontBold, color: BRANCO });
  page.drawText("Aulas/sem.", { x: colSemanaX + 3, y: y - 9, size: 7, font: fontBold, color: BRANCO });
  page.drawText("Cumprido/Exigido (ano)", { x: colAnualX + 3, y: y - 9, size: 7, font: fontBold, color: BRANCO });
  page.drawText("Status", { x: colStatusX + 3, y: y - 9, size: 7, font: fontBold, color: BRANCO });
  y -= 12;

  t.itens.forEach((item, idx) => {
    const corStatus = item.status === "insuficiente" ? AMARELO_ALERTA : item.status === "ok" ? VERDE_OK : (idx % 2 === 0 ? BRANCO : CINZA_CLARO);
    page.drawRectangle({ x: colDiscX, y: y - 13, width: larguraTotal, height: 13, color: corStatus, borderColor: CINZA_BORDA, borderWidth: 0.3 });
    page.drawText(truncar(item.disciplina, 34), { x: colDiscX + 3, y: y - 10, size: 7.5, font, color: PRETO });
    page.drawText(`${item.aulasSemanaGrid} / ${item.cargaSemanalExigida}`, { x: colSemanaX + 3, y: y - 10, size: 7.5, font, color: PRETO });
    page.drawText(`${item.totalCumprido} / ${item.totalExigido}`, { x: colAnualX + 3, y: y - 10, size: 7.5, font, color: PRETO });
    const rotuloStatus = item.status === "ok" ? "OK" : item.status === "insuficiente" ? "Insuficiente" : "Não gerado";
    page.drawText(rotuloStatus, { x: colStatusX + 3, y: y - 10, size: 7.5, font: fontBold, color: PRETO });
    y -= 13;
  });

  return y - 14;
}

export async function gerarPdfCargaHoraria(
  nomeEscola: string,
  ano: number,
  turmas: TurmaCargaHoraria[],
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle("NexGrade — Carga Horária Cumprida x Exigida");
  pdfDoc.setProducer("NexGrade (by Nexus Core Tecnologia)");
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage | null = null;
  let yCursor = 0;

  function novaPagina() {
    page = pdfDoc.addPage([LARGURA, ALTURA]);
    desenharCabecalhoPagina(page, fontBold, font, nomeEscola, ano);
    page.drawText("Gerado pelo NexGrade — checagem antecipada, não substitui conferência oficial de fim de ano", {
      x: MARGEM, y: 10, size: 6.5, font, color: CINZA_ESCURO,
    });
    yCursor = ALTURA - ALTURA_CABECALHO_PAGINA - 20;
  }

  if (turmas.length === 0) {
    novaPagina();
    page!.drawText("Nenhuma turma com disciplinas vinculadas para este ano.", { x: MARGEM, y: yCursor, size: 11, font, color: CINZA_ESCURO });
    return pdfDoc.save();
  }

  for (const turma of turmas) {
    const altura = alturaDaTurma(turma);
    if (!page || yCursor - altura < MARGEM + ALTURA_RODAPE) {
      novaPagina();
    }
    yCursor = desenharTurma(page!, font, fontBold, turma, yCursor);
  }

  return pdfDoc.save();
}
