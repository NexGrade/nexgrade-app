// [CALENDARIO-ASSINCRONAS] (06/11/2026) PDF do calendario trimestral das aulas assincronas (A4 deitado): uma turma por
// pagina (continua na seguinte se precisar), uma linha por semana do trimestre, os 5 dias nas colunas. Em cada dia as
// assincronas com aula, horario, disciplina e professor responsavel; na coluna da semana, quem esta presencial na Hibrida.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { sanitizarTextoPdf } from "./pdf-grade";
import type { CalendarioTurma } from "./agenda-assincronas";

const LARGURA = 841.89, ALTURA = 595.28, MARGEM = 24;
const AZUL = rgb(0.12, 0.2, 0.42), BRANCO = rgb(1, 1, 1), CINZA = rgb(0.45, 0.45, 0.45);
const BORDA = rgb(0.75, 0.75, 0.75), ZEBRA = rgb(0.96, 0.96, 0.97), SEM_AULA = rgb(0.92, 0.92, 0.92), ROXO = rgb(0.35, 0.2, 0.55);
const DIAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];
const ROTULO_TURNO: Record<string, string> = { matutino: "Manhã", vespertino: "Tarde", noturno: "Noite" };

const limpar = (t: string) => sanitizarTextoPdf(String(t ?? "").replace(/[–—]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'"));
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Quebra o texto em linhas que cabem na largura (palavra longa demais e cortada). */
export function quebrar(texto: string, f: PDFFont, tam: number, larg: number): string[] {
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of limpar(texto).split(/\s+/).filter(Boolean)) {
    const tent = atual ? `${atual} ${palavra}` : palavra;
    if (f.widthOfTextAtSize(tent, tam) <= larg) { atual = tent; continue; }
    if (atual) linhas.push(atual);
    let p = palavra;
    while (f.widthOfTextAtSize(p, tam) > larg && p.length > 1) p = p.slice(0, -1);
    atual = p;
  }
  if (atual) linhas.push(atual);
  return linhas.length ? linhas : [""];
}

export async function gerarPdfCalendarioAssincronas(o: {
  escola: string; titulo: string; subtitulo: string; turmas: CalendarioTurma[]; vazio: string;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`NexGrade — ${o.titulo}`);
  pdf.setProducer("NexGrade (by Nexus Core Tecnologia)");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const gerado = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const util = LARGURA - 2 * MARGEM;
  const larg = [util * 0.15, ...DIAS.map(() => util * 0.17)];
  const TAM = 7.4, LH = 9, PAD = 3, H_CAB = 15;

  let page!: PDFPage;
  let y = 0;
  const cabecalho = (turma: CalendarioTurma, continua: boolean) => {
    page = pdf.addPage([LARGURA, ALTURA]);
    page.drawRectangle({ x: 0, y: ALTURA - 46, width: LARGURA, height: 46, color: AZUL });
    page.drawText(limpar(o.escola), { x: MARGEM, y: ALTURA - 20, size: 12, font: bold, color: BRANCO });
    page.drawText(limpar(`${o.titulo} — ${turma.turma} (${ROTULO_TURNO[turma.turno] ?? turma.turno})${continua ? " (continuação)" : ""}`), { x: MARGEM, y: ALTURA - 36, size: 9.5, font, color: rgb(0.85, 0.9, 1) });
    page.drawText(limpar(o.subtitulo), { x: MARGEM, y: ALTURA - 58, size: 7.5, font, color: CINZA });
    page.drawText(limpar(`Gerado pelo NexGrade em ${gerado}`), { x: MARGEM, y: 12, size: 6.5, font, color: CINZA });
    y = ALTURA - 66;
    let x = MARGEM;
    page.drawRectangle({ x: MARGEM, y: y - H_CAB, width: util, height: H_CAB, color: AZUL });
    ["Semana", ...DIAS].forEach((t, i) => { page.drawText(limpar(t), { x: x + PAD, y: y - H_CAB + 4.5, size: 8, font: bold, color: BRANCO }); x += larg[i]!; });
    y -= H_CAB;
  };

  if (!o.turmas.length) {
    page = pdf.addPage([LARGURA, ALTURA]);
    page.drawRectangle({ x: 0, y: ALTURA - 46, width: LARGURA, height: 46, color: AZUL });
    page.drawText(limpar(o.escola), { x: MARGEM, y: ALTURA - 20, size: 12, font: bold, color: BRANCO });
    page.drawText(limpar(o.titulo), { x: MARGEM, y: ALTURA - 36, size: 9.5, font, color: rgb(0.85, 0.9, 1) });
    page.drawText(limpar(o.vazio), { x: MARGEM, y: ALTURA - 80, size: 10, font, color: CINZA });
    return pdf.save();
  }

  for (const turma of o.turmas) {
    cabecalho(turma, false);
    turma.semanas.forEach((sem, idx) => {
      // conteudo de cada celula: [texto, fonte, cor][]
      type Linha = { t: string; f: PDFFont; cor: ReturnType<typeof rgb> };
      const celulas: Linha[][] = [];
      const fim = sem.dias[4]!.data;
      const colSemana: Linha[] = [{ t: `${ddmm(sem.segunda)} a ${ddmm(fim)}`, f: bold, cor: rgb(0.1, 0.1, 0.1) }];
      if (sem.presenciais.length) {
        colSemana.push({ t: "Presencial (Híbrida):", f: font, cor: CINZA });
        for (const p of sem.presenciais) for (const l of quebrar(p, bold, TAM, larg[0]! - 2 * PAD)) colSemana.push({ t: l, f: bold, cor: ROXO });
      }
      celulas.push(colSemana);
      sem.dias.forEach((d, i) => {
        const w = larg[i + 1]! - 2 * PAD;
        if (d.fora) { celulas.push([]); return; }
        const c: Linha[] = [{ t: ddmm(d.data), f: font, cor: CINZA }];
        if (d.semAula) for (const l of quebrar(`${d.semAula} (sem aula)`, font, TAM, w)) c.push({ t: l, f: font, cor: CINZA });
        for (const it of d.itens) {
          for (const l of quebrar(`${it.numeroAula}ª ${it.hora} · ${it.disciplina}`, font, TAM, w)) c.push({ t: l, f: font, cor: rgb(0.1, 0.1, 0.1) });
          for (const l of quebrar(it.professor, bold, TAM, w)) c.push({ t: l, f: bold, cor: it.trio ? ROXO : AZUL });
        }
        celulas.push(c);
      });
      const altura = Math.max(...celulas.map((c) => c.length), 2) * LH + 2 * PAD;
      if (y - altura < 24) cabecalho(turma, true);
      let x = MARGEM;
      celulas.forEach((c, i) => {
        const d = i > 0 ? sem.dias[i - 1]! : null;
        const fundo = d?.fora ? BRANCO : d?.semAula ? SEM_AULA : idx % 2 ? ZEBRA : BRANCO;
        page.drawRectangle({ x, y: y - altura, width: larg[i]!, height: altura, color: fundo, borderColor: BORDA, borderWidth: 0.5 });
        c.forEach((l, k) => page.drawText(l.t, { x: x + PAD, y: y - PAD - (k + 1) * LH + 2, size: TAM, font: l.f, color: l.cor }));
        x += larg[i]!;
      });
      y -= altura;
    });
  }
  return pdf.save();
}
