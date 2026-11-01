import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

const DIAS_CURTOS = ["Seg", "Ter", "Qua", "Qui", "Sex"];
const DIAS_LONGOS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];

const AZUL_PRINCIPAL = rgb(0x15 / 255, 0x65 / 255, 0xc0 / 255);
const AZUL_ESCURO = rgb(0x0d / 255, 0x47 / 255, 0xa1 / 255);
const CINZA_CLARO = rgb(0xec / 255, 0xef / 255, 0xf1 / 255);
const CINZA_ESCURO = rgb(0x60 / 255, 0x7d / 255, 0x8b / 255);
const CINZA_BORDA = rgb(0.7, 0.7, 0.7);
const BRANCO = rgb(1, 1, 1);
const PRETO = rgb(0.1, 0.1, 0.1);
const AMARELO_HA = rgb(1, 0.93, 0.6);

type SlotGrade = {
  diaSemana: number;
  numeroAula: number;
  linha1: string;
  linha2?: string;
  destacado?: boolean;
  texto?: string; // [PDF-MODELOS] texto completo da celula nos outros modelos ("Disciplina (Professor)")
};

type CelulaBloqueada = { diaSemana: number; numeroAula: number; rotulo?: string }; // [ROTULO-BLOQUEIO]

type BlocoGrade = {
  rotulo: string;
  slots: SlotGrade[];
  horariosPorAula?: Record<number, string>;
  celulasBloqueadas?: CelulaBloqueada[];
};

// [PDF-PAISAGEM] (28/10/2026) todos os PDFs da grade em paisagem, 2 quadros por linha (pedido da Simone)
// [PDF-RETRATO] (01/11/2026) opcao em retrato: um quadro por linha, na largura da folha, celulas e letras maiores
const LARGURA = 841.89;
const ALTURA = 595.28;
export type OrientacaoPdf = "paisagem" | "retrato";
type Medidas = { linha: number; cab: number; fonte: number; diasLongos: boolean };
const MEDIDAS_PAISAGEM: Medidas = { linha: 15, cab: 16, fonte: 1, diasLongos: false };
const MEDIDAS_RETRATO: Medidas = { linha: 21, cab: 18, fonte: 1.3, diasLongos: true };
const ESPACO_COLUNAS = 16;
const MARGEM = 30;
const ALTURA_CABECALHO_PAGINA = 46;
const ALTURA_RODAPE = 14;

export function sanitizarTextoPdf(texto: string): string {
  return texto.replace(/[\uFFFD]/g, "").replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}
function truncar(texto: string, max: number): string {
  return texto.length > max ? texto.slice(0, max - 1) + "…" : texto;
}

function desenharCabecalhoPagina(page: PDFPage, fontBold: PDFFont, font: PDFFont, nomeEscola: string, tituloDocumento: string, intervaloData: string) {
  const { width: W, height: H } = page.getSize(); // [PDF-RETRATO]
  page.drawRectangle({ x: 0, y: H - ALTURA_CABECALHO_PAGINA, width: W, height: ALTURA_CABECALHO_PAGINA, color: AZUL_ESCURO });
  page.drawText(sanitizarTextoPdf(nomeEscola), { x: MARGEM, y: H - 20, size: 12, font: fontBold, color: BRANCO });
  page.drawText(sanitizarTextoPdf(tituloDocumento), { x: MARGEM, y: H - 36, size: 9, font, color: rgb(0.85, 0.9, 1) });
  const larguraData = fontBold.widthOfTextAtSize(intervaloData, 10);
  page.drawText(intervaloData, { x: W - MARGEM - larguraData, y: H - 27, size: 10, font: fontBold, color: BRANCO });
}

function desenharPontilhado(page: PDFPage, x: number, y: number, largura: number, altura: number) {
  const cor = CINZA_ESCURO;
  const espacamento = 5;
  for (let offset = -altura; offset < largura; offset += espacamento) {
    const x1 = x + Math.max(offset, 0);
    const y1 = y + Math.max(-offset, 0);
    const diagLen = Math.min(largura - Math.max(offset, 0), altura - Math.max(-offset, 0));
    if (diagLen <= 0) continue;
    const x2 = x1 + diagLen;
    const y2 = y1 + diagLen;
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.6, color: cor, dashArray: [1.5, 1.5] });
  }
}

function alturaDoBloco(bloco: BlocoGrade, alturaLinhaDado: number, alturaLinhaCabecalho: number): number {
  const aulas = [...new Set(bloco.slots.map((s) => s.numeroAula))];
  const numLinhas = Math.max(aulas.length, bloco.horariosPorAula ? Object.keys(bloco.horariosPorAula).length : 0, 5);
  return 6 + alturaLinhaCabecalho + numLinhas * alturaLinhaDado + 18;
}

function desenharBloco(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  bloco: BlocoGrade,
  yTopo: number,
  larguraDisponivel: number,
  x0: number = MARGEM,
  m: Medidas = MEDIDAS_PAISAGEM,
): number {
  const alturaLinhaCabecalho = m.cab;
  const alturaLinhaDado = m.linha;
  const colAulaLargura = (bloco.horariosPorAula ? 40 : 32) * (m.fonte > 1 ? 1.15 : 1);
  const colDiaLargura = (larguraDisponivel - colAulaLargura) / 5;

  page.drawText(bloco.rotulo, { x: x0, y: yTopo, size: m.fonte > 1 ? 11.5 : 9.5, font: fontBold, color: AZUL_ESCURO });
  let y = yTopo - 6;

  const aulasNumeros = bloco.horariosPorAula
    ? Object.keys(bloco.horariosPorAula).map(Number).sort((a, b) => a - b)
    : [...new Set(bloco.slots.map((s) => s.numeroAula))].sort((a, b) => a - b);

  page.drawRectangle({ x: x0, y: y - alturaLinhaCabecalho, width: colAulaLargura, height: alturaLinhaCabecalho, color: AZUL_PRINCIPAL });
  page.drawText("Hor", { x: x0 + 5, y: y - alturaLinhaCabecalho / 2 - 3, size: 7.5 * m.fonte, font: fontBold, color: BRANCO });
  (m.diasLongos ? DIAS_LONGOS : DIAS_CURTOS).forEach((dia, i) => {
    const x = x0 + colAulaLargura + i * colDiaLargura;
    page.drawRectangle({ x, y: y - alturaLinhaCabecalho, width: colDiaLargura, height: alturaLinhaCabecalho, color: AZUL_PRINCIPAL });
    const larguraTexto = fontBold.widthOfTextAtSize(dia, 8 * m.fonte);
    page.drawText(dia, { x: x + colDiaLargura / 2 - larguraTexto / 2, y: y - alturaLinhaCabecalho / 2 - 3, size: 8 * m.fonte, font: fontBold, color: BRANCO });
  });
  y -= alturaLinhaCabecalho;

  aulasNumeros.forEach((numeroAula, linhaIdx) => {
    const yLinha = y - alturaLinhaDado * (linhaIdx + 1);
    const corFundoLinha = linhaIdx % 2 === 0 ? BRANCO : CINZA_CLARO;

    page.drawRectangle({ x: x0, y: yLinha, width: colAulaLargura, height: alturaLinhaDado, color: corFundoLinha, borderColor: CINZA_BORDA, borderWidth: 0.4 });
    const horaReal = bloco.horariosPorAula?.[numeroAula];
    const rotuloAula = horaReal ?? String(numeroAula);
    const larguraRotulo = font.widthOfTextAtSize(rotuloAula, 7.5 * m.fonte);
    page.drawText(rotuloAula, { x: x0 + colAulaLargura / 2 - larguraRotulo / 2, y: yLinha + alturaLinhaDado / 2 - 3, size: 7.5 * m.fonte, font, color: AZUL_ESCURO });

    DIAS_CURTOS.forEach((_, diaSemana) => {
      const x = x0 + colAulaLargura + diaSemana * colDiaLargura;
      const slot = bloco.slots.find((s) => s.numeroAula === numeroAula && s.diaSemana === diaSemana);
      const corFundo = slot?.destacado ? AMARELO_HA : corFundoLinha;
      page.drawRectangle({ x, y: yLinha, width: colDiaLargura, height: alturaLinhaDado, color: corFundo, borderColor: CINZA_BORDA, borderWidth: 0.4 });
      if (slot) {
        // [PDF-CABE-NA-CELULA] mede a largura real: 1 linha se couber; senao 2 linhas e fonte menor; so entao reticencias
        desenharTextoNaCelula(page, slot.linha2 ? [slot.linha1, slot.linha2] : [slot.linha1], slot.linha2 ? font : fontBold, x, yLinha, colDiaLargura - 6, alturaLinhaDado, (slot.linha2 ? 6.5 : 7) * m.fonte);
      } else {
        const bloqueada = bloco.celulasBloqueadas?.find(
          (c) => c.diaSemana === diaSemana && c.numeroAula === numeroAula,
        );
        // [ROTULO-BLOQUEIO] atividade com nome (PAEE, COORD, LAB...) sai escrita, como no sistema anterior;
        // bloqueio sem nome continua com a hachura pontilhada.
        if (bloqueada?.rotulo) desenharTextoNaCelula(page, [sanitizarTextoPdf(bloqueada.rotulo)], font, x, yLinha, colDiaLargura - 6, alturaLinhaDado, 7 * m.fonte);
        else if (bloqueada) desenharPontilhado(page, x, yLinha, colDiaLargura, alturaLinhaDado);
      }
    });
  });

  return yTopo - alturaDoBloco(bloco, alturaLinhaDado, alturaLinhaCabecalho);
}

// [PDF-CABE-NA-CELULA] Texto de celula sempre dentro da celula, medindo a largura real com a fonte do PDF.
function cortarParaCaber(texto: string, f: PDFFont, tamanho: number, largura: number): string {
  if (f.widthOfTextAtSize(texto, tamanho) <= largura) return texto;
  let t = texto;
  while (t.length > 1 && f.widthOfTextAtSize(t + "…", tamanho) > largura) t = t.slice(0, -1);
  return t + "…";
}
function dividirEmDuas(t: string): string[] {
  const meio = t.length / 2; let melhor = -1;
  for (let j = 1; j < t.length - 1; j++) if ((t[j] === "/" || t[j] === " ") && (melhor < 0 || Math.abs(j - meio) < Math.abs(melhor - meio))) melhor = j;
  if (melhor < 0) return [t];
  return [t.slice(0, t[melhor] === "/" ? melhor + 1 : melhor).trim(), t.slice(melhor + 1).trim()];
}
function desenharTextoNaCelula(page: PDFPage, linhas: string[], f: PDFFont, x: number, yLinha: number, largura: number, altura: number, tamanhoBase: number): void {
  const MIN = 5;
  const junto = linhas.join("/");
  if (f.widthOfTextAtSize(junto, tamanhoBase) <= largura) {
    page.drawText(junto, { x: x + 3, y: yLinha + altura / 2 - 3, size: tamanhoBase, font: f, color: PRETO });
    return;
  }
  const partes = linhas.length > 1 ? linhas : dividirEmDuas(linhas[0]);
  if (partes.length === 2 && altura >= 2 * MIN + 2) {
    let tam = Math.min(tamanhoBase, (altura - 3) / 2);
    while (tam > MIN && Math.max(...partes.map((q) => f.widthOfTextAtSize(q, tam))) > largura) tam -= 0.25;
    const meio = yLinha + altura / 2;
    page.drawText(cortarParaCaber(partes[0], f, tam, largura), { x: x + 3, y: meio + 1, size: tam, font: f, color: PRETO });
    page.drawText(cortarParaCaber(partes[1], f, tam, largura), { x: x + 3, y: meio - tam, size: tam, font: f, color: PRETO });
    return;
  }
  let tam = tamanhoBase;
  while (tam > MIN && f.widthOfTextAtSize(junto, tam) > largura) tam -= 0.25;
  page.drawText(cortarParaCaber(junto, f, tam, largura), { x: x + 3, y: yLinha + altura / 2 - 3, size: tam, font: f, color: PRETO });
}
export async function gerarPdfGradeCompacta(
  nomeEscola: string,
  tituloDocumento: string,
  intervaloData: string,
  blocos: BlocoGrade[],
  orientacao: OrientacaoPdf = "paisagem",
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`NexGrade — ${tituloDocumento}`);
  pdfDoc.setProducer("NexGrade (by Nexus Core Tecnologia)");
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // [PDF-RETRATO] retrato: folha em pe, um quadro por linha na largura toda
  const retrato = orientacao === "retrato";
  const [W, H] = retrato ? [ALTURA, LARGURA] : [LARGURA, ALTURA];
  const porLinha = retrato ? 1 : 2;
  const m = retrato ? MEDIDAS_RETRATO : MEDIDAS_PAISAGEM;
  const larguraDisponivel = (W - 2 * MARGEM - (porLinha - 1) * ESPACO_COLUNAS) / porLinha;
  let page: PDFPage | null = null;
  let yCursor = 0;

  function novaPagina() {
    page = pdfDoc.addPage([W, H]);
    desenharCabecalhoPagina(page, fontBold, font, nomeEscola, tituloDocumento, intervaloData);
    page.drawText("Gerado pelo NexGrade — conferir antes de homologar oficialmente", {
      x: MARGEM, y: 10, size: 6.5, font, color: CINZA_ESCURO,
    });
    yCursor = H - ALTURA_CABECALHO_PAGINA - (retrato ? 22 : 16);
  }

  if (blocos.length === 0) {
    novaPagina();
    page!.drawText("Nenhum dado encontrado.", { x: MARGEM, y: yCursor, size: 11, font, color: CINZA_ESCURO });
    return pdfDoc.save();
  }

  // paisagem: dois quadros lado a lado (a linha tem a altura do maior); retrato: um por linha
  for (let i = 0; i < blocos.length; i += porLinha) {
    const par = blocos.slice(i, i + porLinha);
    const altura = Math.max(...par.map((b) => alturaDoBloco(b, m.linha, m.cab))) + (retrato ? 10 : 0);
    if (!page || yCursor - altura < MARGEM + ALTURA_RODAPE) {
      novaPagina();
    }
    par.forEach((b, k) => desenharBloco(page!, font, fontBold, b, yCursor, larguraDisponivel, MARGEM + k * (larguraDisponivel + ESPACO_COLUNAS), m));
    yCursor -= altura;
  }

  return pdfDoc.save();
}

export type { BlocoGrade, SlotGrade };
