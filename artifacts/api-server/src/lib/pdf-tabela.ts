// [PRESENCA-PEDAGOGIA] (28/10/2026) PDF simples de tabela (A4 retrato), usado pelos relatorios
// da presenca dos professores: cabecalho com a escola e o titulo, tabela com quebra de pagina
// (repete os titulos das colunas) e rodape com a data em que foi gerado.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { sanitizarTextoPdf } from "./pdf-grade";

const LARGURA = 595.28, ALTURA = 841.89, MARGEM = 28;
const AZUL = rgb(0.12, 0.2, 0.42), BRANCO = rgb(1, 1, 1), CINZA = rgb(0.45, 0.45, 0.45);
const BORDA = rgb(0.75, 0.75, 0.75), ZEBRA = rgb(0.96, 0.96, 0.97), DESTAQUE = rgb(1, 0.92, 0.92);

export type ColunaTabela = { titulo: string; peso: number; alinhar?: "centro" };
export type LinhaTabela = { celulas: string[]; destaque?: boolean; grupo?: boolean; cabecalho?: boolean };

/** a fonte padrao do PDF nao tem travessao nem aspas curvas: troca antes de sanitizar */
function limpar(t: string): string {
  return String(t ?? "").replace(/[\u2013\u2014]/g, "-").replace(/[\u201c\u201d]/g, '"').replace(/[\u2018\u2019]/g, "'");
}

function caber(t: string, f: PDFFont, tam: number, larg: number): string {
  let s = sanitizarTextoPdf(limpar(t));
  if (f.widthOfTextAtSize(s, tam) <= larg) return s;
  while (s.length > 1 && f.widthOfTextAtSize(s + "...", tam) > larg) s = s.slice(0, -1);
  return s + "...";
}

export async function gerarPdfTabela(o: {
  escola: string; titulo: string; subtitulo?: string; colunas: ColunaTabela[]; linhas: LinhaTabela[];
  rodapeExtra?: string; vazio?: string;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`NexGrade — ${o.titulo}`);
  pdf.setProducer("NexGrade (by Nexus Core Tecnologia)");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const gerado = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const util = LARGURA - 2 * MARGEM;
  const somaPesos = o.colunas.reduce((s, c) => s + c.peso, 0);
  const larguras = o.colunas.map((c) => (c.peso / somaPesos) * util);
  const H_LINHA = 15, H_CAB = 16, TAM = 7.8;

  let page: PDFPage, y = 0;
  const cabecalhoColunas = () => {
    let x = MARGEM;
    page.drawRectangle({ x: MARGEM, y: y - H_CAB, width: util, height: H_CAB, color: AZUL });
    o.colunas.forEach((c, i) => {
      page.drawText(caber(c.titulo, bold, TAM, larguras[i]! - 6), { x: x + 3, y: y - H_CAB + 5, size: TAM, font: bold, color: BRANCO });
      x += larguras[i]!;
    });
    y -= H_CAB;
  };
  const nova = () => {
    page = pdf.addPage([LARGURA, ALTURA]);
    page.drawRectangle({ x: 0, y: ALTURA - 50, width: LARGURA, height: 50, color: AZUL });
    page.drawText(caber(o.escola, bold, 12, util), { x: MARGEM, y: ALTURA - 22, size: 12, font: bold, color: BRANCO });
    page.drawText(caber(o.titulo, font, 9.5, util), { x: MARGEM, y: ALTURA - 38, size: 9.5, font, color: rgb(0.85, 0.9, 1) });
    y = ALTURA - 62;
    if (o.subtitulo) { page.drawText(caber(o.subtitulo, font, 8.5, util), { x: MARGEM, y: y - 8, size: 8.5, font, color: CINZA }); y -= 18; }
    page.drawText(sanitizarTextoPdf(`Gerado pelo NexGrade em ${gerado}${o.rodapeExtra ? " · " + o.rodapeExtra : ""}`), { x: MARGEM, y: 14, size: 6.5, font, color: CINZA });
    cabecalhoColunas();
  };
  nova();
  if (!o.linhas.length) {
    page!.drawText(sanitizarTextoPdf(o.vazio ?? "Nenhum registro."), { x: MARGEM, y: y - 18, size: 10, font, color: CINZA });
    return pdf.save();
  }
  o.linhas.forEach((l, idx) => {
    if (y - H_LINHA < MARGEM + 12) nova();
    if (l.cabecalho) { // segunda tabela na mesma folha, com os titulos dela
      y -= 8;
      page.drawRectangle({ x: MARGEM, y: y - H_CAB, width: util, height: H_CAB, color: AZUL });
      let xc = MARGEM;
      l.celulas.forEach((t, i) => { page.drawText(caber(t, bold, TAM, larguras[i]! - 6), { x: xc + 3, y: y - H_CAB + 5, size: TAM, font: bold, color: BRANCO }); xc += larguras[i]!; });
      y -= H_CAB;
      return;
    }
    const fundo = l.destaque ? DESTAQUE : l.grupo ? rgb(0.9, 0.93, 0.98) : idx % 2 ? ZEBRA : BRANCO;
    page.drawRectangle({ x: MARGEM, y: y - H_LINHA, width: util, height: H_LINHA, color: fundo, borderColor: BORDA, borderWidth: 0.4 });
    if (l.grupo) { // titulo de secao: uma linha so, na largura toda
      page.drawText(caber(l.celulas[0] ?? "", bold, TAM, util - 6), { x: MARGEM + 3, y: y - H_LINHA + 4.5, size: TAM, font: bold, color: rgb(0.1, 0.1, 0.1) });
      y -= H_LINHA;
      return;
    }
    let x = MARGEM;
    l.celulas.forEach((t, i) => {
      const f = l.grupo || i === 0 ? bold : font;
      const larg = larguras[i]! - 6;
      const txt = caber(t, f, TAM, larg);
      const tx = o.colunas[i]?.alinhar === "centro" ? x + larguras[i]! / 2 - f.widthOfTextAtSize(txt, TAM) / 2 : x + 3;
      page.drawText(txt, { x: tx, y: y - H_LINHA + 4.5, size: TAM, font: f, color: rgb(0.1, 0.1, 0.1) });
      if (i > 0) page.drawLine({ start: { x, y }, end: { x, y: y - H_LINHA }, thickness: 0.4, color: BORDA });
      x += larguras[i]!;
    });
    y -= H_LINHA;
  });
  return pdf.save();
}
