import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

// Cores da marca NexGrade (mesma paleta usada em pdf-grade.ts)
const AZUL_PRINCIPAL = rgb(0x15 / 255, 0x65 / 255, 0xc0 / 255);
const AZUL_ESCURO = rgb(0x0d / 255, 0x47 / 255, 0xa1 / 255);
const CINZA_CLARO = rgb(0xec / 255, 0xef / 255, 0xf1 / 255);
const CINZA_ESCURO = rgb(0x60 / 255, 0x7d / 255, 0x8b / 255);
const CINZA_BORDA = rgb(0.7, 0.7, 0.7);
const BRANCO = rgb(1, 1, 1);
const PRETO = rgb(0.1, 0.1, 0.1);
const AMARELO_HA = rgb(1, 0.93, 0.6);

const TURNO_ROTULO: Record<string, string> = { matutino: "Manhã", vespertino: "Tarde", noturno: "Noite" };

export type ItemCargaProfessor = { turma: string; disciplina: string; aulas: number };
export type PeriodoCargaProfessor = {
  turno: string;
  totalAulas: number;
  haInstitucional: number;
  itens: ItemCargaProfessor[];
};
export type RelatorioProfessor = {
  nome: string;
  totalGeralAulas: number;
  totalGeralHa: number;
  periodos: PeriodoCargaProfessor[];
};

const LARGURA = 595.28; // A4 retrato
const ALTURA = 841.89;
const MARGEM = 36;
const ALTURA_CABECALHO_PAGINA = 46;
const ALTURA_RODAPE = 14;
const LARGURA_UTIL = LARGURA - 2 * MARGEM;

function truncar(texto: string, max: number): string {
  return texto.length > max ? texto.slice(0, max - 1) + "…" : texto;
}

function desenharCabecalhoPagina(page: PDFPage, fontBold: PDFFont, font: PDFFont, nomeEscola: string, intervaloData: string) {
  page.drawRectangle({ x: 0, y: ALTURA - ALTURA_CABECALHO_PAGINA, width: LARGURA, height: ALTURA_CABECALHO_PAGINA, color: AZUL_ESCURO });
  page.drawText(nomeEscola, { x: MARGEM, y: ALTURA - 20, size: 12, font: fontBold, color: BRANCO });
  page.drawText("Relatório de Carga Horária por Professor", { x: MARGEM, y: ALTURA - 36, size: 9, font, color: rgb(0.85, 0.9, 1) });
  const larguraData = fontBold.widthOfTextAtSize(intervaloData, 10);
  page.drawText(intervaloData, { x: LARGURA - MARGEM - larguraData, y: ALTURA - 27, size: 10, font: fontBold, color: BRANCO });
}

// Calcula quantos pontos de altura um professor inteiro (todos os
// períodos dele) vai ocupar, pra decidir se cabe no espaço restante da
// página atual antes de desenhar (evita cortar um professor no meio).
function alturaDoProfessor(rel: RelatorioProfessor): number {
  let altura = 20; // nome + total geral
  for (const periodo of rel.periodos) {
    altura += 16; // subtítulo do período
    altura += 14; // cabeçalho da mini-tabela
    altura += periodo.itens.length * 13; // linhas
    if (periodo.haInstitucional > 0) altura += 13; // linha de HA destacada
    altura += 18; // [FIX] respiro entre períodos -- 6pt colava o texto do
    // próximo período quase em cima da borda da tabela anterior; 18pt dá
    // um espaço visualmente claro entre "Manhã" e "Tarde", por exemplo.
  }
  altura += 14; // respiro entre professores
  return altura;
}

function desenharProfessor(page: PDFPage, font: PDFFont, fontBold: PDFFont, rel: RelatorioProfessor, yTopo: number): number {
  let y = yTopo;

  page.drawText(rel.nome, { x: MARGEM, y, size: 11, font: fontBold, color: AZUL_ESCURO });
  const totalTexto = `${rel.totalGeralAulas} aulas totais${rel.totalGeralHa > 0 ? ` · ${rel.totalGeralHa} HA institucional` : ""}`;
  const larguraTotal = font.widthOfTextAtSize(totalTexto, 9);
  page.drawText(totalTexto, { x: MARGEM + LARGURA_UTIL - larguraTotal, y: y + 1, size: 9, font, color: CINZA_ESCURO });
  y -= 18;

  for (const periodo of rel.periodos) {
    const rotuloTurno = TURNO_ROTULO[periodo.turno] ?? periodo.turno;
    const subtitulo = `${rotuloTurno} — ${periodo.totalAulas} aula${periodo.totalAulas === 1 ? "" : "s"}` +
      (periodo.haInstitucional > 0 ? ` · ${periodo.haInstitucional} HA institucional` : "");
    page.drawText(subtitulo, { x: MARGEM + 8, y, size: 9, font: fontBold, color: PRETO });
    y -= 14;

    // Cabeçalho da mini-tabela (Turma | Disciplina | Aulas)
    const colTurmaX = MARGEM + 8;
    const colTurmaLargura = 90;
    const colDiscX = colTurmaX + colTurmaLargura;
    const colDiscLargura = LARGURA_UTIL - 8 - colTurmaLargura - 50;
    const colAulasX = colDiscX + colDiscLargura;
    const colAulasLargura = 50;

    page.drawRectangle({ x: colTurmaX, y: y - 12, width: colTurmaLargura + colDiscLargura + colAulasLargura, height: 12, color: AZUL_PRINCIPAL });
    page.drawText("Turma", { x: colTurmaX + 3, y: y - 9, size: 7, font: fontBold, color: BRANCO });
    page.drawText("Disciplina", { x: colDiscX + 3, y: y - 9, size: 7, font: fontBold, color: BRANCO });
    page.drawText("Aulas", { x: colAulasX + 3, y: y - 9, size: 7, font: fontBold, color: BRANCO });
    y -= 12;

    periodo.itens.forEach((item, idx) => {
      const corFundo = idx % 2 === 0 ? BRANCO : CINZA_CLARO;
      page.drawRectangle({ x: colTurmaX, y: y - 13, width: colTurmaLargura + colDiscLargura + colAulasLargura, height: 13, color: corFundo, borderColor: CINZA_BORDA, borderWidth: 0.3 });
      page.drawText(truncar(item.turma, 16), { x: colTurmaX + 3, y: y - 10, size: 7.5, font, color: PRETO });
      page.drawText(truncar(item.disciplina, 42), { x: colDiscX + 3, y: y - 10, size: 7.5, font, color: PRETO });
      page.drawText(String(item.aulas), { x: colAulasX + 3, y: y - 10, size: 7.5, font, color: PRETO });
      y -= 13;
    });

    // Linha de HA institucional dentro da tabela, se houver, destacada
    if (periodo.haInstitucional > 0) {
      page.drawRectangle({ x: colTurmaX, y: y - 13, width: colTurmaLargura + colDiscLargura + colAulasLargura, height: 13, color: AMARELO_HA, borderColor: CINZA_BORDA, borderWidth: 0.3 });
      page.drawText("Hora-Atividade institucional", { x: colDiscX + 3, y: y - 10, size: 7.5, font: fontBold, color: PRETO });
      page.drawText(String(periodo.haInstitucional), { x: colAulasX + 3, y: y - 10, size: 7.5, font: fontBold, color: PRETO });
      y -= 13;
    }

    y -= 18;
  }

  return y - 14;
}

export async function gerarPdfCargaProfessores(
  nomeEscola: string,
  intervaloData: string,
  professores: RelatorioProfessor[],
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle("NexGrade — Relatório de Carga Horária por Professor");
  pdfDoc.setProducer("NexGrade (by Nexus Core Tecnologia)");
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage | null = null;
  let yCursor = 0;

  function novaPagina() {
    page = pdfDoc.addPage([LARGURA, ALTURA]);
    desenharCabecalhoPagina(page, fontBold, font, nomeEscola, intervaloData);
    page.drawText("Gerado pelo NexGrade — conferir antes de homologar oficialmente", {
      x: MARGEM, y: 10, size: 6.5, font, color: CINZA_ESCURO,
    });
    yCursor = ALTURA - ALTURA_CABECALHO_PAGINA - 20;
  }

  if (professores.length === 0) {
    novaPagina();
    page!.drawText("Nenhum professor encontrado.", { x: MARGEM, y: yCursor, size: 11, font, color: CINZA_ESCURO });
    return pdfDoc.save();
  }

  for (const professor of professores) {
    const altura = alturaDoProfessor(professor);
    if (!page || yCursor - altura < MARGEM + ALTURA_RODAPE) {
      novaPagina();
    }
    yCursor = desenharProfessor(page!, font, fontBold, professor, yCursor);
  }

  return pdfDoc.save();
}
