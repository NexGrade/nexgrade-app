import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

const DIAS_CURTOS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];

// Cores da marca NexGrade (ver manual de identidade)
const AZUL_PRINCIPAL = rgb(0x15 / 255, 0x65 / 255, 0xc0 / 255);
const AZUL_ESCURO = rgb(0x0d / 255, 0x47 / 255, 0xa1 / 255);
const CINZA_CLARO = rgb(0xec / 255, 0xef / 255, 0xf1 / 255);
const CINZA_ESCURO = rgb(0x60 / 255, 0x7d / 255, 0x8b / 255);
const BRANCO = rgb(1, 1, 1);
const AMARELO_HA = rgb(1, 0.96, 0.75); // destaque suave para Hora-Atividade

type SlotGrade = {
  diaSemana: number;
  numeroAula: number;
  linha1: string;
  linha2?: string;
  destacado?: boolean; // usado na visão por professor para marcar Hora-Atividade
};

type PaginaGrade = {
  titulo: string;
  subtitulo?: string;
  slots: SlotGrade[];
};

const LARGURA = 841.89; // A4 paisagem
const ALTURA = 595.28;
const MARGEM = 36;

function truncar(texto: string, max: number): string {
  return texto.length > max ? texto.slice(0, max - 1) + "…" : texto;
}

function desenharCabecalho(page: PDFPage, fontBold: PDFFont, titulo: string, subtitulo: string | undefined) {
  page.drawRectangle({ x: 0, y: ALTURA - 70, width: LARGURA, height: 70, color: AZUL_ESCURO });
  page.drawText("NexGrade", { x: MARGEM, y: ALTURA - 30, size: 16, font: fontBold, color: BRANCO });
  page.drawText(titulo, { x: MARGEM, y: ALTURA - 52, size: 13, font: fontBold, color: BRANCO });
  if (subtitulo) {
    page.drawText(subtitulo, { x: LARGURA - MARGEM - fontBold.widthOfTextAtSize(subtitulo, 9), y: ALTURA - 30, size: 9, font: fontBold, color: CINZA_CLARO });
  }
}

function desenharGrade(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  slots: SlotGrade[],
) {
  const aulas = [...new Set(slots.map((s) => s.numeroAula))].sort((a, b) => a - b);
  if (aulas.length === 0) {
    page.drawText("Nenhuma aula gerada ainda para esta grade.", {
      x: MARGEM, y: ALTURA - 110, size: 11, font, color: CINZA_ESCURO,
    });
    return;
  }

  const topoTabela = ALTURA - 95;
  const colAulaLargura = 60;
  const colDiaLargura = (LARGURA - 2 * MARGEM - colAulaLargura) / 5;
  const alturaLinha = Math.min(48, (topoTabela - MARGEM) / (aulas.length + 1));

  // Cabeçalho das colunas (dias da semana)
  page.drawRectangle({ x: MARGEM, y: topoTabela - alturaLinha, width: colAulaLargura, height: alturaLinha, color: AZUL_PRINCIPAL });
  page.drawText("Aula", { x: MARGEM + 14, y: topoTabela - alturaLinha / 2 - 4, size: 10, font: fontBold, color: BRANCO });
  DIAS_CURTOS.forEach((dia, i) => {
    const x = MARGEM + colAulaLargura + i * colDiaLargura;
    page.drawRectangle({ x, y: topoTabela - alturaLinha, width: colDiaLargura, height: alturaLinha, color: AZUL_PRINCIPAL });
    const larguraTexto = fontBold.widthOfTextAtSize(dia, 10);
    page.drawText(dia, { x: x + colDiaLargura / 2 - larguraTexto / 2, y: topoTabela - alturaLinha / 2 - 4, size: 10, font: fontBold, color: BRANCO });
  });

  // Linhas — uma por número de aula
  aulas.forEach((numeroAula, linhaIdx) => {
    const y = topoTabela - alturaLinha * (linhaIdx + 2);
    const corFundoLinha = linhaIdx % 2 === 0 ? BRANCO : CINZA_CLARO;

    page.drawRectangle({ x: MARGEM, y, width: colAulaLargura, height: alturaLinha, color: corFundoLinha, borderColor: CINZA_ESCURO, borderWidth: 0.5 });
    page.drawText(String(numeroAula), { x: MARGEM + colAulaLargura / 2 - 4, y: y + alturaLinha / 2 - 4, size: 10, font: fontBold, color: AZUL_ESCURO });

    DIAS_CURTOS.forEach((_, diaSemana) => {
      const x = MARGEM + colAulaLargura + diaSemana * colDiaLargura;
      const slot = slots.find((s) => s.numeroAula === numeroAula && s.diaSemana === diaSemana);
      const corFundo = slot?.destacado ? AMARELO_HA : corFundoLinha;
      page.drawRectangle({ x, y, width: colDiaLargura, height: alturaLinha, color: corFundo, borderColor: CINZA_ESCURO, borderWidth: 0.5 });
      if (slot) {
        const maxChars = Math.floor(colDiaLargura / 4.3);
        page.drawText(truncar(slot.linha1, maxChars), {
          x: x + 6, y: y + alturaLinha / 2 + (slot.linha2 ? 4 : -3), size: 8.5, font: fontBold, color: rgb(0.15, 0.15, 0.15),
        });
        if (slot.linha2) {
          page.drawText(truncar(slot.linha2, maxChars), {
            x: x + 6, y: y + alturaLinha / 2 - 9, size: 8, font, color: CINZA_ESCURO,
          });
        }
      }
    });
  });
}

/**
 * Gera um PDF com uma página por item de `paginas`, cada uma com a grade
 * semanal (dia x aula) daquele item. Usado tanto para "visão por turma"
 * quanto "visão por professor" — o chamador monta os `slots` de acordo.
 */
export async function gerarPdfGrade(paginas: PaginaGrade[]): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle("NexGrade — Grade Horária");
  pdfDoc.setProducer("NexGrade (by NexCore Tecnologia)");

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  for (const pagina of paginas) {
    const page = pdfDoc.addPage([LARGURA, ALTURA]);
    desenharCabecalho(page, fontBold, pagina.titulo, pagina.subtitulo);
    desenharGrade(page, font, fontBold, pagina.slots);
    page.drawText("Gerado pelo NexGrade — conferir antes de homologar oficialmente", {
      x: MARGEM, y: 16, size: 7, font, color: CINZA_ESCURO,
    });
  }

  if (paginas.length === 0) {
    const page = pdfDoc.addPage([LARGURA, ALTURA]);
    desenharCabecalho(page, fontBold, "Nenhum dado encontrado", undefined);
  }

  return pdfDoc.save();
}

export type { PaginaGrade, SlotGrade };
