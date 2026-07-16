import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

const DIAS_CURTOS = ["Seg", "Ter", "Qua", "Qui", "Sex"];

// Cores da marca NexGrade (ver manual de identidade)
const AZUL_PRINCIPAL = rgb(0x15 / 255, 0x65 / 255, 0xc0 / 255);
const AZUL_ESCURO = rgb(0x0d / 255, 0x47 / 255, 0xa1 / 255);
const CINZA_CLARO = rgb(0xec / 255, 0xef / 255, 0xf1 / 255);
const CINZA_ESCURO = rgb(0x60 / 255, 0x7d / 255, 0x8b / 255);
const CINZA_BORDA = rgb(0.7, 0.7, 0.7);
const BRANCO = rgb(1, 1, 1);
const PRETO = rgb(0.1, 0.1, 0.1);
const AMARELO_HA = rgb(1, 0.93, 0.6); // destaque mais forte para HA, igual ao usado no Urânia

type SlotGrade = {
  diaSemana: number;
  numeroAula: number;
  linha1: string;
  linha2?: string;
  destacado?: boolean; // usado para marcar Hora-Atividade
};

// [NOVO] Um "bloco" é uma mini-grade compacta (uma turma, ou um
// professor) — várias cabem na mesma página, empilhadas, igual ao
// formato real do Urânia (confirmado nos PDFs de referência
// 06_TURMAS/PROFESSORES_*.pdf: 4 turmas por página, sem cabeçalho
// próprio por bloco além do rótulo "Turma: 8MA").
type BlocoGrade = {
  rotulo: string; // "Turma: 8MA" ou "ALINE"
  slots: SlotGrade[];
  horariosPorAula?: Record<number, string>;
};

const LARGURA = 595.28; // A4 retrato (mais blocos por pagina)
const ALTURA = 841.89;
const MARGEM = 30;
const ALTURA_CABECALHO_PAGINA = 46;
const ALTURA_RODAPE = 14;

function truncar(texto: string, max: number): string {
  return texto.length > max ? texto.slice(0, max - 1) + "…" : texto;
}

function desenharCabecalhoPagina(page: PDFPage, fontBold: PDFFont, font: PDFFont, nomeEscola: string, tituloDocumento: string, intervaloData: string) {
  page.drawRectangle({ x: 0, y: ALTURA - ALTURA_CABECALHO_PAGINA, width: LARGURA, height: ALTURA_CABECALHO_PAGINA, color: AZUL_ESCURO });
  page.drawText(nomeEscola, { x: MARGEM, y: ALTURA - 20, size: 12, font: fontBold, color: BRANCO });
  page.drawText(tituloDocumento, { x: MARGEM, y: ALTURA - 36, size: 9, font, color: rgb(0.85, 0.9, 1) });
  const larguraData = fontBold.widthOfTextAtSize(intervaloData, 10);
  page.drawText(intervaloData, { x: LARGURA - MARGEM - larguraData, y: ALTURA - 27, size: 10, font: fontBold, color: BRANCO });
}

// Calcula a altura (em pontos) que um bloco vai ocupar, para decidir se
// cabe no espaço restante da página atual.
function alturaDoBloco(bloco: BlocoGrade, alturaLinhaDado: number, alturaLinhaCabecalho: number): number {
  const aulas = [...new Set(bloco.slots.map((s) => s.numeroAula))];
  const numLinhas = Math.max(aulas.length, bloco.horariosPorAula ? Object.keys(bloco.horariosPorAula).length : 0, 5);
  return 14 /* rótulo */ + alturaLinhaCabecalho + numLinhas * alturaLinhaDado + 10 /* espaço entre blocos */;
}

function desenharBloco(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  bloco: BlocoGrade,
  yTopo: number,
  larguraDisponivel: number,
): number {
  const alturaLinhaCabecalho = 16;
  const alturaLinhaDado = 15;
  const colAulaLargura = bloco.horariosPorAula ? 40 : 32;
  const colDiaLargura = (larguraDisponivel - colAulaLargura) / 5;

  // Rótulo do bloco ("Turma: 8MA" ou nome do professor)
  page.drawText(bloco.rotulo, { x: MARGEM, y: yTopo, size: 9.5, font: fontBold, color: AZUL_ESCURO });
  let y = yTopo - 14;

  const aulasNumeros = bloco.horariosPorAula
    ? Object.keys(bloco.horariosPorAula).map(Number).sort((a, b) => a - b)
    : [...new Set(bloco.slots.map((s) => s.numeroAula))].sort((a, b) => a - b);

  // Cabeçalho da mini-tabela (Hor | Seg | Ter | Qua | Qui | Sex)
  page.drawRectangle({ x: MARGEM, y: y - alturaLinhaCabecalho, width: colAulaLargura, height: alturaLinhaCabecalho, color: AZUL_PRINCIPAL });
  page.drawText("Hor", { x: MARGEM + 5, y: y - alturaLinhaCabecalho / 2 - 3, size: 7.5, font: fontBold, color: BRANCO });
  DIAS_CURTOS.forEach((dia, i) => {
    const x = MARGEM + colAulaLargura + i * colDiaLargura;
    page.drawRectangle({ x, y: y - alturaLinhaCabecalho, width: colDiaLargura, height: alturaLinhaCabecalho, color: AZUL_PRINCIPAL });
    const larguraTexto = fontBold.widthOfTextAtSize(dia, 8);
    page.drawText(dia, { x: x + colDiaLargura / 2 - larguraTexto / 2, y: y - alturaLinhaCabecalho / 2 - 3, size: 8, font: fontBold, color: BRANCO });
  });
  y -= alturaLinhaCabecalho;

  aulasNumeros.forEach((numeroAula, linhaIdx) => {
    const yLinha = y - alturaLinhaDado * (linhaIdx + 1);
    const corFundoLinha = linhaIdx % 2 === 0 ? BRANCO : CINZA_CLARO;

    page.drawRectangle({ x: MARGEM, y: yLinha, width: colAulaLargura, height: alturaLinhaDado, color: corFundoLinha, borderColor: CINZA_BORDA, borderWidth: 0.4 });
    const horaReal = bloco.horariosPorAula?.[numeroAula];
    const rotuloAula = horaReal ?? String(numeroAula);
    const larguraRotulo = font.widthOfTextAtSize(rotuloAula, 7.5);
    page.drawText(rotuloAula, { x: MARGEM + colAulaLargura / 2 - larguraRotulo / 2, y: yLinha + alturaLinhaDado / 2 - 3, size: 7.5, font, color: AZUL_ESCURO });

    DIAS_CURTOS.forEach((_, diaSemana) => {
      const x = MARGEM + colAulaLargura + diaSemana * colDiaLargura;
      const slot = bloco.slots.find((s) => s.numeroAula === numeroAula && s.diaSemana === diaSemana);
      const corFundo = slot?.destacado ? AMARELO_HA : corFundoLinha;
      page.drawRectangle({ x, y: yLinha, width: colDiaLargura, height: alturaLinhaDado, color: corFundo, borderColor: CINZA_BORDA, borderWidth: 0.4 });
      if (slot) {
        const maxChars = Math.floor(colDiaLargura / 3.6);
        if (slot.linha2) {
          // Célula combinada em uma linha só: "TURMA/SIGLA" (visão por
          // professor) -- formato real do Urânia.
          const texto = truncar(`${slot.linha1}/${slot.linha2}`, maxChars);
          page.drawText(texto, { x: x + 3, y: yLinha + alturaLinhaDado / 2 - 3, size: 6.5, font, color: PRETO });
        } else {
          const texto = truncar(slot.linha1, maxChars);
          page.drawText(texto, { x: x + 3, y: yLinha + alturaLinhaDado / 2 - 3, size: 7, font: fontBold, color: PRETO });
        }
      }
    });
  });

  return yTopo - alturaDoBloco(bloco, alturaLinhaDado, alturaLinhaCabecalho);
}

/**
 * Gera um PDF no formato compacto multi-bloco por página (padrão real
 * do Urânia): vários blocos (turmas ou professores) empilhados na mesma
 * página, sem cabeçalho individual por bloco além de um rótulo curto.
 * `nomeEscola` e `intervaloData` aparecem só no cabeçalho de cada
 * página, uma vez.
 */
export async function gerarPdfGradeCompacta(
  nomeEscola: string,
  tituloDocumento: string,
  intervaloData: string,
  blocos: BlocoGrade[],
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`NexGrade — ${tituloDocumento}`);
  pdfDoc.setProducer("NexGrade (by Nexus Core Tecnologia)");
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const larguraDisponivel = LARGURA - 2 * MARGEM;
  let page: PDFPage | null = null;
  let yCursor = 0;

  function novaPagina() {
    page = pdfDoc.addPage([LARGURA, ALTURA]);
    desenharCabecalhoPagina(page, fontBold, font, nomeEscola, tituloDocumento, intervaloData);
    page.drawText("Gerado pelo NexGrade — conferir antes de homologar oficialmente", {
      x: MARGEM, y: 10, size: 6.5, font, color: CINZA_ESCURO,
    });
    yCursor = ALTURA - ALTURA_CABECALHO_PAGINA - 16;
  }

  if (blocos.length === 0) {
    novaPagina();
    page!.drawText("Nenhum dado encontrado.", { x: MARGEM, y: yCursor, size: 11, font, color: CINZA_ESCURO });
    return pdfDoc.save();
  }

  for (const bloco of blocos) {
    const altura = alturaDoBloco(bloco, 15, 16);
    if (!page || yCursor - altura < MARGEM + ALTURA_RODAPE) {
      novaPagina();
    }
    yCursor = desenharBloco(page!, font, fontBold, bloco, yCursor, larguraDisponivel);
  }

  return pdfDoc.save();
}

export type { BlocoGrade, SlotGrade };

