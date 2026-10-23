// [PONTO-DIARIO] (15/10/2026) Relatorio de ponto de UM dia: uma linha por professor, uma
// coluna por aula do turno, mais a situacao e a observacao para preencher a mao.
// [PONTO-DIARIO-SIMPLES] (23/10/2026) Modelo padrao pedido pela escola (6 copias por dia):
// so a turma em cada aula (sem a disciplina), HA em cinza, situacao abreviada em
// quadradinhos P / F / AT / ATR e coluna larga de Observacao. Sem fundos coloridos
// (sai melhor em copia). A4 RETRATO, cada turno numa folha so: a altura da linha e a fonte
// se ajustam a quantidade de professores (fonte ate 9,5 pt). So passa para outra folha se
// a linha ficaria baixa demais para escrever (menos de ~4,6 mm); ai o cabecalho se repete.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { sanitizarTextoPdf } from "./pdf-grade";

export type CelulaPonto = { texto: string; tipo: "aula" | "ha" | "atividade" | "indisponivel" | "livre" };
export type LinhaPonto = { professor: string; celulas: CelulaPonto[]; aulas: number; ha: number };
export type TurnoPonto = { turno: string; rotulo: string; colunas: Array<{ numeroAula: number; hora: string }>; linhas: LinhaPonto[] };
export type PontoDiario = { escola: string; data: string; dataBR: string; diaSemana: string; aviso: string | null; turnos: TurnoPonto[] };

const LARGURA = 595.28;
const ALTURA = 841.89;
const MARGEM = 22.7; // 8 mm
const MM = 2.8346;
const CINZA_BORDA = rgb(0.53, 0.53, 0.53);
const CINZA_CAB = rgb(0.9, 0.9, 0.9);
const CINZA_ZEBRA = rgb(0.96, 0.96, 0.96);
const CINZA_HA = rgb(0.47, 0.47, 0.47);
const CINZA_TEXTO = rgb(0.38, 0.38, 0.38);
const PRETO = rgb(0, 0, 0);
const VERMELHO_AVISO = rgb(0.72, 0.11, 0.11);

const SITUACOES = ["P", "F", "AT", "ATR"];

function caber(texto: string, f: PDFFont, tamanho: number, largura: number): string {
  let t = sanitizarTextoPdf(texto);
  if (f.widthOfTextAtSize(t, tamanho) <= largura) return t;
  while (t.length > 1 && f.widthOfTextAtSize(t + "…", tamanho) > largura) t = t.slice(0, -1);
  return t + "…";
}

// "2MA ADM/FIN.EMP" -> "2MA ADM"; "H.A." -> "HA"; "H.A.*" -> "HA*"
function textoCelula(c: CelulaPonto): string {
  const t = (c.texto || "").trim();
  if (c.tipo === "aula") return t.split("/")[0]!.trim();
  if (c.tipo === "ha") return t.replace(/H\.A\./gi, "HA");
  return t;
}

function nomeProfessor(nome: string): string {
  return nome.replace(/\s*\(nome completo pendente\)/i, "").trim();
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
    const titulo = `${p.escola} — Ponto diário${turno ? " · " + turno.rotulo : ""} · ${p.diaSemana}, ${p.dataBR}`;
    page.drawText(caber(titulo, bold, 11.5, LARGURA - 2 * MARGEM), { x: MARGEM, y: ALTURA - MARGEM - 10, size: 11.5, font: bold, color: PRETO });
    let y = ALTURA - MARGEM - 23;
    if (turno) {
      const legenda = `${turno.linhas.length} professores · HA = hora-atividade · Situação: marque P Presente · F Falta · AT Atestado · ATR Atraso`;
      page.drawText(caber(legenda, font, 8.5, LARGURA - 2 * MARGEM), { x: MARGEM, y, size: 8.5, font, color: PRETO });
      y -= 12;
    }
    if (p.aviso) {
      page.drawText(caber(p.aviso, bold, 8.5, LARGURA - 2 * MARGEM), { x: MARGEM, y, size: 8.5, font: bold, color: VERMELHO_AVISO });
      y -= 12;
    }
    return { page, y: y - 2 };
  }

  if (!p.turnos.some((t) => t.linhas.length)) {
    const { page, y } = novaPagina(null);
    page.drawText("Nenhum professor com aula ou hora-atividade neste dia.", { x: MARGEM, y: y - 10, size: 11, font, color: CINZA_TEXTO });
  }

  for (const turno of p.turnos) {
    if (!turno.linhas.length) continue;
    const larguraUtil = LARGURA - 2 * MARGEM;
    const n = Math.max(1, turno.colunas.length);
    const wProf = 47 * MM, wSit = 7 * MM;
    // 16,5 mm por aula com 6 aulas; com mais aulas encolhe para manter a Observacao (min. 18 mm)
    const wAula = Math.min(16.5 * MM, (larguraUtil - wProf - SITUACOES.length * wSit - 18 * MM) / n);
    const hCab = 8 * MM;
    const RODAPE = 22;

    // bordas das colunas: professor | aulas... | P F AT ATR | Observacao
    const xs: number[] = [MARGEM, MARGEM + wProf];
    for (let i = 0; i < n; i++) xs.push(xs[xs.length - 1]! + wAula);
    const iFimAulas = xs.length - 1;
    for (let i = 0; i < SITUACOES.length; i++) xs.push(xs[xs.length - 1]! + wSit);
    const iFimSit = xs.length - 1;
    xs.push(MARGEM + larguraUtil);

    const titulos: Array<[string, string?]> = [
      ["Professor"],
      ...turno.colunas.map((c) => [`${c.numeroAula}ª`, c.hora] as [string, string]),
      ...SITUACOES.map((s) => [s] as [string]),
      ["Observação"],
    ];

    const linhasVerticais = (page: PDFPage, yTopo: number, yBase: number) => {
      for (let i = 1; i < xs.length - 1; i++) {
        const grossa = i === iFimAulas || i === iFimSit;
        page.drawLine({ start: { x: xs[i]!, y: yTopo }, end: { x: xs[i]!, y: yBase }, thickness: grossa ? 1 : 0.4, color: grossa ? PRETO : CINZA_BORDA });
      }
    };

    let { page, y } = novaPagina(turno);
    // altura da linha para caber o turno inteiro numa folha (entre 4,6 mm e 7,4 mm)
    const hLinha = Math.max(4.6 * MM, Math.min(7.4 * MM, (y - hCab - RODAPE) / turno.linhas.length));
    const tamNome = Math.min(9.5, hLinha * 0.55);
    const tamTurma = Math.min(9, tamNome - 0.3);
    const cabecalho = () => {
      page.drawRectangle({ x: MARGEM, y: y - hCab, width: larguraUtil, height: hCab, color: CINZA_CAB, borderColor: CINZA_BORDA, borderWidth: 0.4 });
      titulos.forEach(([t1, t2], i) => {
        const x0 = xs[i]!, w = xs[i + 1]! - x0;
        const l1 = caber(t1, bold, 8.5, w - 1);
        const x1 = i === 0 ? x0 + 4 : x0 + (w - bold.widthOfTextAtSize(l1, 8.5)) / 2;
        page.drawText(l1, { x: x1, y: t2 ? y - 10 : y - hCab / 2 - 3, size: 8.5, font: bold, color: PRETO });
        if (t2) page.drawText(t2, { x: x0 + (w - bold.widthOfTextAtSize(t2, 8)) / 2, y: y - 19, size: 8, font: bold, color: PRETO });
      });
      linhasVerticais(page, y, y - hCab);
      y -= hCab;
    };
    cabecalho();

    turno.linhas.forEach((linha, idx) => {
      if (y - hLinha < RODAPE - 0.5) {
        ({ page, y } = novaPagina(turno));
        cabecalho();
      }
      const yb = y - hLinha;
      const yTexto = yb + hLinha / 2 - tamNome * 0.35;
      if (idx % 2 === 1) page.drawRectangle({ x: MARGEM, y: yb, width: xs[iFimAulas]! - MARGEM, height: hLinha, color: CINZA_ZEBRA });
      page.drawText(caber(nomeProfessor(linha.professor), font, tamNome, wProf - 6), { x: MARGEM + 3, y: yTexto, size: tamNome, font, color: PRETO });
      linha.celulas.forEach((c, i) => {
        if (i >= n) return;
        const x0 = xs[i + 1]!, w = wAula;
        if (c.tipo === "indisponivel") return; // sem expediente: celula em branco
        const texto = textoCelula(c);
        if (!texto) return;
        let tam = tamTurma;
        while (tam > 6 && font.widthOfTextAtSize(sanitizarTextoPdf(texto), tam) > w - 4) tam -= 0.25;
        const t = caber(texto, font, tam, w - 4);
        page.drawText(t, { x: x0 + (w - font.widthOfTextAtSize(t, tam)) / 2, y: yTexto, size: tam, font, color: c.tipo === "ha" ? CINZA_HA : PRETO });
      });
      // grade da linha
      page.drawRectangle({ x: MARGEM, y: yb, width: larguraUtil, height: hLinha, borderColor: CINZA_BORDA, borderWidth: 0.4 });
      linhasVerticais(page, y, yb);
      y = yb;
    });
  }

  paginas.forEach((page, i) => {
    page.drawText(`Gerado pelo NexGrade em ${agora}`, { x: MARGEM, y: 12, size: 8, font, color: CINZA_TEXTO });
    const pg = `Página ${i + 1} de ${paginas.length}`;
    page.drawText(pg, { x: LARGURA - MARGEM - font.widthOfTextAtSize(pg, 8), y: 12, size: 8, font, color: CINZA_TEXTO });
  });
  return pdf.save();
}
