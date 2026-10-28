// [PDF-MODELOS] (28/10/2026) Outros modelos de impressao da grade, pedidos pela Simone para
// substituir os relatorios que as escolas usavam no sistema anterior. Usam os MESMOS blocos da
// rota de PDF (BlocoGrade), so mudam o desenho:
//   - turmasLadoALado: varias turmas por pagina (paisagem), dias em faixas, celula
//     "Disciplina (Professor)";
//   - professoresCompacto: 4 professores por linha (retrato), celula com a turma, HA e bloqueio;
//   - quadroProfessores: uma linha por professor (paisagem), colunas = dia x aula.
// Funcoes puras sobre os blocos (testadas em __tests__/pdf-grade-quadros.test.ts).
import { PDFDocument, StandardFonts, rgb, degrees, type PDFFont, type PDFPage } from "pdf-lib";
import { sanitizarTextoPdf as sanitizarBase, type BlocoGrade, type SlotGrade } from "./pdf-grade";
// travessao e aspas curvas nao existem na fonte padrao do PDF: troca antes de sanitizar
const sanitizarTextoPdf = (s: string) => sanitizarBase(s.replace(/[\u2013\u2014]/g, "-").replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"'));

const DIAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];
const DIAS_CURTOS = ["Seg", "Ter", "Qua", "Qui", "Sex"];
const AZUL = rgb(0x15 / 255, 0x65 / 255, 0xc0 / 255);
const AZUL_ESCURO = rgb(0x0d / 255, 0x47 / 255, 0xa1 / 255);
const AZUL_CLARO = rgb(0xe3 / 255, 0xf2 / 255, 0xfd / 255);
const CINZA_CLARO = rgb(0xf3 / 255, 0xf5 / 255, 0xf7 / 255);
const CINZA = rgb(0x60 / 255, 0x7d / 255, 0x8b / 255);
const BORDA = rgb(0.72, 0.72, 0.72);
const BRANCO = rgb(1, 1, 1);
const PRETO = rgb(0.1, 0.1, 0.1);
const AMARELO = rgb(1, 0.93, 0.6);
const MARGEM = 24;
const CAB = 40;
const A4: [number, number] = [595.28, 841.89];
const A4_PAISAGEM: [number, number] = [841.89, 595.28];

type Contexto = { doc: PDFDocument; font: PDFFont; bold: PDFFont; escola: string; titulo: string; data: string };

async function novoDoc(escola: string, titulo: string, data: string): Promise<Contexto> {
  const doc = await PDFDocument.create();
  doc.setTitle(`NexGrade — ${titulo}`);
  doc.setProducer("NexGrade (by Nexus Core Tecnologia)");
  return { doc, font: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold), escola, titulo, data };
}

function novaPagina(c: Contexto, tamanho: [number, number], subtitulo?: string): PDFPage {
  const p = c.doc.addPage(tamanho);
  const [w, h] = tamanho;
  p.drawRectangle({ x: 0, y: h - CAB, width: w, height: CAB, color: AZUL_ESCURO });
  p.drawText(sanitizarTextoPdf(c.escola), { x: MARGEM, y: h - 17, size: 11, font: c.bold, color: BRANCO });
  p.drawText(sanitizarTextoPdf(c.titulo + (subtitulo ? " · " + subtitulo : "")), { x: MARGEM, y: h - 31, size: 8.5, font: c.font, color: rgb(0.85, 0.9, 1) });
  const ld = c.bold.widthOfTextAtSize(c.data, 9);
  p.drawText(c.data, { x: w - MARGEM - ld, y: h - 24, size: 9, font: c.bold, color: BRANCO });
  p.drawText("Gerado pelo NexGrade", { x: MARGEM, y: 9, size: 6, font: c.font, color: CINZA });
  return p;
}

/** Texto dentro da celula: 1 linha se couber; senao 2 linhas com fonte menor; so entao corta. */
function texto(p: PDFPage, s: string, f: PDFFont, x: number, y: number, w: number, h: number, base: number, cor = PRETO, centro = false): void {
  const t = sanitizarTextoPdf(s);
  if (!t) return;
  const cabe = (q: string, tam: number) => f.widthOfTextAtSize(q, tam) <= w - 4;
  const escreve = (q: string, tam: number, yy: number) => {
    const lw = f.widthOfTextAtSize(q, tam);
    p.drawText(q, { x: centro ? x + (w - lw) / 2 : x + 2, y: yy, size: tam, font: f, color: cor });
  };
  if (cabe(t, base)) { escreve(t, base, y + h / 2 - base * 0.35); return; }
  const meio = t.length / 2;
  let corte = -1;
  for (let i = 1; i < t.length - 1; i++) if (t[i] === " " && (corte < 0 || Math.abs(i - meio) < Math.abs(corte - meio))) corte = i;
  if (corte > 0 && h >= 11) {
    const [a, b] = [t.slice(0, corte), t.slice(corte + 1)];
    let tam = Math.min(base, (h - 2) / 2.1);
    while (tam > 4.5 && !(cabe(a, tam) && cabe(b, tam))) tam -= 0.25;
    const cortar = (q: string) => { let r = q; while (r.length > 1 && !cabe(r + "…", tam)) r = r.slice(0, -1); return cabe(q, tam) ? q : r + "…"; };
    escreve(cortar(a), tam, y + h / 2 + 0.6);
    escreve(cortar(b), tam, y + h / 2 - tam + 0.2);
    return;
  }
  let tam = base;
  while (tam > 4.5 && !cabe(t, tam)) tam -= 0.25;
  let r = t;
  while (r.length > 1 && !cabe(r, tam)) r = r.slice(0, -2) + "…";
  escreve(r, tam, y + h / 2 - tam * 0.35);
}

function caixa(p: PDFPage, x: number, y: number, w: number, h: number, cor = BRANCO): void {
  p.drawRectangle({ x, y, width: w, height: h, color: cor, borderColor: BORDA, borderWidth: 0.4 });
}

/** Numeros de aula de um conjunto de blocos (pelo horario do turno e pelas aulas que existem). */
export function aulasDosBlocos(blocos: BlocoGrade[]): number[] {
  const n = new Set<number>();
  for (const b of blocos) {
    Object.keys(b.horariosPorAula ?? {}).forEach((k) => n.add(Number(k)));
    b.slots.forEach((s) => n.add(s.numeroAula));
    (b.celulasBloqueadas ?? []).forEach((s) => n.add(s.numeroAula));
  }
  return [...n].sort((a, b) => a - b);
}

/** Texto da celula no modelo de turmas: "Disciplina (Professor)". */
export function textoTurma(s: SlotGrade): string {
  if (s.texto) return s.texto;
  return s.linha2 ? `${s.linha1} (${s.linha2})` : s.linha1;
}

function horaDe(blocos: BlocoGrade[], aula: number): string {
  for (const b of blocos) { const h = b.horariosPorAula?.[aula]; if (h) return h; }
  return `${aula}ª`;
}

// ---------------------------------------------------------------- turmas lado a lado
export async function gerarPdfTurmasLadoALado(escola: string, titulo: string, data: string, blocos: BlocoGrade[], porPagina = 5): Promise<Uint8Array> {
  const c = await novoDoc(escola, titulo, data);
  const [W, H] = A4_PAISAGEM;
  if (!blocos.length) { novaPagina(c, A4_PAISAGEM).drawText("Nenhum dado encontrado.", { x: MARGEM, y: H - CAB - 30, size: 11, font: c.font, color: CINZA }); return c.doc.save(); }
  for (let i = 0; i < blocos.length; i += porPagina) {
    const grupo = blocos.slice(i, i + porPagina);
    const p = novaPagina(c, A4_PAISAGEM);
    const aulas = aulasDosBlocos(grupo);
    const colDia = 22, colHora = 34;
    const colTurma = (W - 2 * MARGEM - colDia - colHora) / porPagina;
    const topo = H - CAB - 10;
    const cabH = 16, gap = 3;
    const linhaH = Math.min(17, (topo - MARGEM - 8 - cabH - gap * 5) / (5 * aulas.length));
    // cabecalho com o nome das turmas
    caixa(p, MARGEM, topo - cabH, colDia + colHora, cabH, AZUL);
    texto(p, "Dia / Hora", c.bold, MARGEM, topo - cabH, colDia + colHora, cabH, 7, BRANCO, true);
    grupo.forEach((b, k) => {
      const x = MARGEM + colDia + colHora + k * colTurma;
      caixa(p, x, topo - cabH, colTurma, cabH, AZUL);
      texto(p, b.rotulo.replace(/^Turma:\s*/, ""), c.bold, x, topo - cabH, colTurma, cabH, 9, BRANCO, true);
    });
    let y = topo - cabH - gap;
    for (let d = 0; d < 5; d++) {
      const alturaDia = linhaH * aulas.length;
      caixa(p, MARGEM, y - alturaDia, colDia, alturaDia, AZUL_CLARO);
      const rot = DIAS_CURTOS[d]!;
      p.drawText(rot, { x: MARGEM + colDia / 2 + 3, y: y - alturaDia / 2 - c.bold.widthOfTextAtSize(rot, 8) / 2, size: 8, font: c.bold, color: AZUL_ESCURO, rotate: degrees(90) });
      aulas.forEach((a, li) => {
        const yl = y - linhaH * (li + 1);
        const fundo = li % 2 ? CINZA_CLARO : BRANCO;
        caixa(p, MARGEM + colDia, yl, colHora, linhaH, fundo);
        texto(p, horaDe(grupo, a), c.font, MARGEM + colDia, yl, colHora, linhaH, 6.5, AZUL_ESCURO, true);
        grupo.forEach((b, k) => {
          const x = MARGEM + colDia + colHora + k * colTurma;
          const s = b.slots.find((q) => q.diaSemana === d && q.numeroAula === a);
          caixa(p, x, yl, colTurma, linhaH, s?.destacado ? AMARELO : fundo);
          if (s) texto(p, textoTurma(s), c.font, x, yl, colTurma, linhaH, 7, PRETO, true);
          else texto(p, "-", c.font, x, yl, colTurma, linhaH, 7, CINZA, true);
        });
      });
      y -= alturaDia + gap;
    }
  }
  return c.doc.save();
}

// ---------------------------------------------------------------- professores compacto
function celulaProfessor(b: BlocoGrade, d: number, a: number): { t: string; cor: ReturnType<typeof rgb> | null; vazio: boolean } {
  const s = b.slots.find((q) => q.diaSemana === d && q.numeroAula === a);
  if (s) return { t: s.linha1, cor: s.destacado ? AMARELO : null, vazio: false };
  const bl = (b.celulasBloqueadas ?? []).find((q) => q.diaSemana === d && q.numeroAula === a);
  if (bl) return { t: bl.rotulo ?? "----", cor: CINZA_CLARO, vazio: false };
  return { t: "", cor: null, vazio: true };
}

export async function gerarPdfProfessoresCompacto(escola: string, titulo: string, data: string, blocos: BlocoGrade[], colunas = 4): Promise<Uint8Array> {
  const c = await novoDoc(escola, titulo, data);
  const [W, H] = A4;
  const espaco = 8;
  const larg = (W - 2 * MARGEM - espaco * (colunas - 1)) / colunas;
  const colHor = 16, colDia = (larg - colHor) / 5, linhaH = 11, tituloH = 12;
  let p: PDFPage | null = null, y = 0;
  if (!blocos.length) { novaPagina(c, A4).drawText("Nenhum dado encontrado.", { x: MARGEM, y: H - CAB - 30, size: 11, font: c.font, color: CINZA }); return c.doc.save(); }
  for (let i = 0; i < blocos.length; i += colunas) {
    const linha = blocos.slice(i, i + colunas);
    const aulas = aulasDosBlocos(linha);
    const altura = tituloH + linhaH * (aulas.length + 1) + 10;
    if (!p || y - altura < MARGEM) { p = novaPagina(c, A4); y = H - CAB - 10; }
    linha.forEach((b, k) => {
      const x0 = MARGEM + k * (larg + espaco);
      texto(p!, b.rotulo, c.bold, x0, y - tituloH, larg, tituloH, 7.5, AZUL_ESCURO);
      let yy = y - tituloH;
      caixa(p!, x0, yy - linhaH, colHor, linhaH, AZUL);
      texto(p!, "Hor", c.bold, x0, yy - linhaH, colHor, linhaH, 5.5, BRANCO, true);
      DIAS_CURTOS.forEach((dn, d) => { const x = x0 + colHor + d * colDia; caixa(p!, x, yy - linhaH, colDia, linhaH, AZUL); texto(p!, dn, c.bold, x, yy - linhaH, colDia, linhaH, 6, BRANCO, true); });
      yy -= linhaH;
      aulas.forEach((a, li) => {
        const yl = yy - linhaH * (li + 1);
        caixa(p!, x0, yl, colHor, linhaH, CINZA_CLARO);
        texto(p!, `${a}ª`, c.font, x0, yl, colHor, linhaH, 6, AZUL_ESCURO, true);
        for (let d = 0; d < 5; d++) {
          const x = x0 + colHor + d * colDia;
          const cel = celulaProfessor(b, d, a);
          caixa(p!, x, yl, colDia, linhaH, cel.cor ?? BRANCO);
          if (!cel.vazio) texto(p!, cel.t, c.font, x, yl, colDia, linhaH, 6, PRETO, true);
        }
      });
    });
    y -= altura;
  }
  return c.doc.save();
}

// ---------------------------------------------------------------- quadro geral de professores
export async function gerarPdfQuadroProfessores(escola: string, titulo: string, data: string, blocos: BlocoGrade[]): Promise<Uint8Array> {
  const c = await novoDoc(escola, titulo, data);
  const [W, H] = A4_PAISAGEM;
  if (!blocos.length) { novaPagina(c, A4_PAISAGEM).drawText("Nenhum dado encontrado.", { x: MARGEM, y: H - CAB - 30, size: 11, font: c.font, color: CINZA }); return c.doc.save(); }
  const aulas = aulasDosBlocos(blocos);
  const colNome = 112;
  const colAula = (W - 2 * MARGEM - colNome) / (5 * aulas.length);
  const linhaH = 12.5, cab1 = 13, cab2 = 11;
  let p: PDFPage | null = null, y = 0;
  const cabecalho = () => {
    p = novaPagina(c, A4_PAISAGEM);
    y = H - CAB - 10;
    caixa(p, MARGEM, y - cab1 - cab2, colNome, cab1 + cab2, AZUL);
    texto(p, "Professor", c.bold, MARGEM, y - cab1 - cab2, colNome, cab1 + cab2, 8, BRANCO);
    for (let d = 0; d < 5; d++) {
      const x = MARGEM + colNome + d * aulas.length * colAula;
      caixa(p, x, y - cab1, aulas.length * colAula, cab1, AZUL);
      texto(p, DIAS[d]!, c.bold, x, y - cab1, aulas.length * colAula, cab1, 8, BRANCO, true);
      aulas.forEach((a, k) => {
        caixa(p!, x + k * colAula, y - cab1 - cab2, colAula, cab2, AZUL_CLARO);
        texto(p!, `${a}ª`, c.bold, x + k * colAula, y - cab1 - cab2, colAula, cab2, 6, AZUL_ESCURO, true);
      });
    }
    y -= cab1 + cab2;
  };
  blocos.forEach((b, i) => {
    if (!p || y - linhaH < MARGEM + 6) cabecalho();
    const fundo = i % 2 ? CINZA_CLARO : BRANCO;
    caixa(p!, MARGEM, y - linhaH, colNome, linhaH, fundo);
    texto(p!, b.rotulo, c.bold, MARGEM, y - linhaH, colNome, linhaH, 6.5);
    for (let d = 0; d < 5; d++) {
      aulas.forEach((a, k) => {
        const x = MARGEM + colNome + (d * aulas.length + k) * colAula;
        const cel = celulaProfessor(b, d, a);
        caixa(p!, x, y - linhaH, colAula, linhaH, cel.cor ?? fundo);
        if (!cel.vazio) texto(p!, cel.t, c.font, x, y - linhaH, colAula, linhaH, 5.8, PRETO, true);
      });
      // linha mais grossa entre os dias
      const xd = MARGEM + colNome + d * aulas.length * colAula;
      p!.drawLine({ start: { x: xd, y: y - linhaH }, end: { x: xd, y }, thickness: 1, color: AZUL_ESCURO });
    }
    y -= linhaH;
  });
  return c.doc.save();
}
