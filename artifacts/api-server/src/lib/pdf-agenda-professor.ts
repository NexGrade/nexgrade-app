// [PDF-AGENDA] (17/10/2026) PDF da agenda do professor (botao "Baixar PDF" do Minha Agenda).
// Antes era a impressao da pagina (window.print): saia com o menu, so o turno da aba aberta,
// letras minusculas e uma 2a pagina em branco. Agora e um PDF proprio, A4 deitado, 1 pagina:
// todos os turnos lado a lado, cada aula com turma em destaque e a disciplina embaixo,
// HA marcada, dias sem aula (feriado/recesso) sinalizados e as reservas da semana.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";

export type AulaAgenda = { turno: string; diaSemana: number; numeroAula: number; turma: string; disciplina: string; cor?: string | null; extra?: string };
export type HAAgenda = { turno: string; diaSemana: number; numeroAula: number; outroTurno: boolean };
export type HorarioAgenda = { turno: string; numeroAula: number; inicio: string; fim: string };
export type DiaSemAula = { diaSemana: number; rotulo: string; descricao: string };
export type ReservaAgenda = { data: string; numeroAula: number; sala: string; titulo: string; status: string };

export interface DadosAgendaPdf {
  escola: string;
  professor: string;
  datasSemana: string[]; // 5 datas AAAA-MM-DD (seg a sex)
  aulas: AulaAgenda[];
  has: HAAgenda[];
  horarios: HorarioAgenda[];
  semAula: DiaSemAula[];
  reservas: ReservaAgenda[];
}

const LARGURA = 841.89, ALTURA = 595.28, M = 28;
const AZUL = rgb(0.051, 0.278, 0.631); // #0D47A1
const AZUL2 = rgb(0.082, 0.396, 0.753); // #1565C0
const AZUL_CLARO = rgb(0.89, 0.949, 0.992);
const TEXTO = rgb(0.149, 0.196, 0.22);
const CINZA = rgb(0.45, 0.5, 0.55);
const LINHA = rgb(0.82, 0.85, 0.88);
const FUNDO_CAB = rgb(0.96, 0.97, 0.98);
const HA_FUNDO = rgb(1, 0.973, 0.882); // #FFF8E1
const HA_BORDA = rgb(0.976, 0.659, 0.145); // #F9A825
const HA_TEXTO = rgb(0.55, 0.353, 0);
const SEM_AULA_FUNDO = rgb(0.996, 0.945, 0.949);
const SEM_AULA_TEXTO = rgb(0.75, 0.15, 0.2);
const TURNO_ROTULO: Record<string, string> = { matutino: "Manhã", vespertino: "Tarde", noturno: "Noite" };
const ORDEM = ["matutino", "vespertino", "noturno"];
const DIAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];
const DIAS_CURTOS = ["Seg", "Ter", "Qua", "Qui", "Sex"];

function corHex(hex?: string | null): RGB | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? "");
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
const clarear = (c: RGB, f: number) => rgb(c.red + (1 - c.red) * f, c.green + (1 - c.green) * f, c.blue + (1 - c.blue) * f);
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** corta o texto com "…" para caber na largura */
function caber(t: string, font: PDFFont, size: number, larg: number): string {
  if (font.widthOfTextAtSize(t, size) <= larg) return t;
  let s = t;
  while (s.length > 1 && font.widthOfTextAtSize(s + "…", size) > larg) s = s.slice(0, -1);
  return s + "…";
}
/** quebra em ate `max` linhas; a ultima leva "…" se sobrar texto */
function quebrar(t: string, font: PDFFont, size: number, larg: number, max: number): string[] {
  const palavras = t.split(/\s+/).filter(Boolean);
  const linhas: string[] = [];
  let atual = "";
  for (let i = 0; i < palavras.length; i++) {
    const p = palavras[i]!;
    const teste = atual ? `${atual} ${p}` : p;
    if (font.widthOfTextAtSize(teste, size) <= larg) { atual = teste; continue; }
    if (atual) linhas.push(atual);
    atual = p;
    if (linhas.length === max - 1) { atual = palavras.slice(i).join(" "); break; }
  }
  if (atual) linhas.push(atual);
  return linhas.slice(0, max).map((l, i, arr) => (i === arr.length - 1 ? caber(l, font, size, larg) : l));
}
function centro(page: PDFPage, t: string, font: PDFFont, size: number, x: number, w: number, y: number, color: RGB) {
  const tt = caber(t, font, size, w - 4);
  page.drawText(tt, { x: x + (w - font.widthOfTextAtSize(tt, size)) / 2, y, size, font, color });
}

export async function gerarPdfAgendaProfessor(d: DadosAgendaPdf): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Agenda semanal — ${d.professor}`);
  pdf.setProducer("NexGrade (by Nexus Core Tecnologia)");
  const f = await pdf.embedFont(StandardFonts.Helvetica);
  const fb = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([LARGURA, ALTURA]);

  // ---- cabecalho
  page.drawRectangle({ x: 0, y: ALTURA - 58, width: LARGURA, height: 58, color: AZUL });
  const cores4 = [rgb(0.259, 0.647, 0.961), HA_BORDA, rgb(0.149, 0.651, 0.604), AZUL2];
  cores4.forEach((c, i) => page.drawRectangle({ x: (LARGURA / 4) * i, y: ALTURA - 62, width: LARGURA / 4, height: 4, color: c }));
  page.drawText(caber(d.professor, fb, 17, 520), { x: M, y: ALTURA - 30, size: 17, font: fb, color: rgb(1, 1, 1) });
  page.drawText(caber(d.escola, f, 10, 520), { x: M, y: ALTURA - 47, size: 10, font: f, color: rgb(0.733, 0.871, 0.984) });
  const semana = `Semana de ${ddmm(d.datasSemana[0]!)} a ${ddmm(d.datasSemana[4]!)}`;
  page.drawText("AGENDA SEMANAL", { x: LARGURA - M - fb.widthOfTextAtSize("AGENDA SEMANAL", 9), y: ALTURA - 28, size: 9, font: fb, color: rgb(0.733, 0.871, 0.984) });
  page.drawText(semana, { x: LARGURA - M - fb.widthOfTextAtSize(semana, 12), y: ALTURA - 45, size: 12, font: fb, color: rgb(1, 1, 1) });

  // ---- turnos
  const turnos = ORDEM.filter((t) => d.aulas.some((a) => a.turno === t) || d.has.some((h) => h.turno === t));
  const topo = ALTURA - 80;
  const semAulaDia = new Map(d.semAula.map((s) => [s.diaSemana, s]));
  let baseTabelas = topo;
  if (turnos.length === 0) {
    page.drawText("Nenhuma aula cadastrada para você na grade oficial.", { x: M, y: topo - 20, size: 12, font: f, color: CINZA });
    baseTabelas = topo - 40;
  } else {
    const gap = 14;
    const largTurno = (LARGURA - 2 * M - gap * (turnos.length - 1)) / turnos.length;
    const maxLinhas = Math.max(...turnos.map((t) => linhasDoTurno(d, t).length));
    // altura das linhas: cabe tudo deixando ~120pt para resumo, legenda e reservas
    const altLinha = Math.max(30, Math.min(52, (topo - 22 - 24 - 150) / Math.max(1, maxLinhas)));
    turnos.forEach((turno, ti) => {
      const x0 = M + ti * (largTurno + gap);
      const linhas = linhasDoTurno(d, turno);
      const colHora = turnos.length === 3 ? 40 : 52;
      const colDia = (largTurno - colHora) / 5;
      // titulo do turno
      const nAulas = d.aulas.filter((a) => a.turno === turno).length;
      const nHa = d.has.filter((h) => h.turno === turno).length;
      page.drawText(TURNO_ROTULO[turno] ?? turno, { x: x0, y: topo - 12, size: 12, font: fb, color: AZUL });
      const resumo = nAulas ? `${nAulas} aula${nAulas === 1 ? "" : "s"}${nHa ? ` · ${nHa} HA` : ""}` : `só hora-atividade (${nHa} HA)`;
      page.drawText(resumo, { x: x0 + largTurno - f.widthOfTextAtSize(resumo, 8.5), y: topo - 11, size: 8.5, font: f, color: CINZA });
      // cabecalho dos dias
      const yCab = topo - 20 - 22;
      page.drawRectangle({ x: x0, y: yCab, width: largTurno, height: 22, color: AZUL_CLARO });
      page.drawText("Aula", { x: x0 + 5, y: yCab + 8, size: 7.5, font: fb, color: AZUL2 });
      for (let dia = 0; dia < 5; dia++) {
        const xd = x0 + colHora + dia * colDia;
        const sa = semAulaDia.get(dia);
        const nome = turnos.length === 3 ? DIAS_CURTOS[dia]! : DIAS[dia]!;
        centro(page, nome, fb, 8, xd, colDia, yCab + 12, sa ? SEM_AULA_TEXTO : AZUL2);
        centro(page, sa ? `${ddmm(d.datasSemana[dia]!)} · ${sa.rotulo}` : ddmm(d.datasSemana[dia]!), sa ? fb : f, 7, xd, colDia, yCab + 3.5, sa ? SEM_AULA_TEXTO : CINZA);
      }
      // linhas
      linhas.forEach((h, li) => {
        const y = yCab - (li + 1) * altLinha;
        if (li % 2 === 1) page.drawRectangle({ x: x0, y, width: largTurno, height: altLinha, color: FUNDO_CAB });
        page.drawText(`${h.numeroAula}ª`, { x: x0 + 5, y: y + altLinha / 2 + 2, size: 9, font: fb, color: TEXTO });
        if (h.inicio) page.drawText(h.fim ? `${h.inicio}–${h.fim}` : h.inicio, { x: x0 + 5, y: y + altLinha / 2 - 8, size: turnos.length === 3 ? 5.5 : 6.5, font: f, color: CINZA });
        for (let dia = 0; dia < 5; dia++) {
          const xd = x0 + colHora + dia * colDia;
          const pad = 2;
          const cx = xd + pad, cy = y + pad, cw = colDia - 2 * pad, ch = altLinha - 2 * pad;
          const aula = d.aulas.find((a) => a.turno === turno && a.diaSemana === dia && a.numeroAula === h.numeroAula);
          const ha = d.has.find((x) => x.turno === turno && x.diaSemana === dia && x.numeroAula === h.numeroAula);
          const sa = semAulaDia.get(dia);
          if (aula) {
            const cor = corHex(aula.cor) ?? AZUL2;
            page.drawRectangle({ x: cx, y: cy, width: cw, height: ch, color: sa ? SEM_AULA_FUNDO : clarear(cor, 0.86) });
            page.drawRectangle({ x: cx, y: cy, width: 3, height: ch, color: sa ? SEM_AULA_TEXTO : cor });
            const tam = turnos.length === 3 ? 7.5 : 8.5;
            const tamD = tam - 1.5;
            const larg = cw - 8;
            const corT = sa ? SEM_AULA_TEXTO : TEXTO, corD = sa ? SEM_AULA_TEXTO : CINZA;
            // marca (P)/(S)/(ASS) num selo no canto, para nao ser cortada
            let largTurma = larg;
            if (aula.extra) {
              const selo = aula.extra.trim();
              const ws = fb.widthOfTextAtSize(selo, 6) + 4;
              page.drawRectangle({ x: cx + cw - ws - 2, y: cy + 2, width: ws, height: 8, color: rgb(1, 1, 1), borderColor: sa ? SEM_AULA_TEXTO : cor, borderWidth: 0.5 });
              page.drawText(selo, { x: cx + cw - ws, y: cy + 4, size: 6, font: fb, color: sa ? SEM_AULA_TEXTO : cor });
            }
            // turma diminui um pouco antes de cortar com "…"
            let tamT = tam;
            while (tamT > 6.5 && fb.widthOfTextAtSize(aula.turma, tamT) > largTurma) tamT -= 0.5;
            const maxDisc = ch >= 34 ? 2 : 1;
            const lTurma = caber(aula.turma, fb, tamT, largTurma);
            const lDisc = quebrar(aula.disciplina, f, tamD, larg, maxDisc);
            const altBloco = tam + lDisc.length * (tamD + 1.5);
            let yy = cy + ch / 2 + altBloco / 2 - tam + 1;
            page.drawText(lTurma, { x: cx + 5, y: yy, size: tamT, font: fb, color: corT });
            for (const l of lDisc) {
              yy -= tamD + 2;
              page.drawText(l, { x: cx + 5, y: yy, size: tamD, font: f, color: corD });
            }
          } else if (ha) {
            page.drawRectangle({ x: cx, y: cy, width: cw, height: ch, color: HA_FUNDO, borderColor: HA_BORDA, borderWidth: 0.8 });
            centro(page, ha.outroTurno ? "HA*" : "HA", fb, 10, cx, cw, cy + ch / 2 - 3.5, HA_TEXTO);
          } else if (sa) {
            page.drawRectangle({ x: cx, y: cy, width: cw, height: ch, color: SEM_AULA_FUNDO });
          }
        }
      });
      // grade
      const yFim = yCab - linhas.length * altLinha;
      page.drawRectangle({ x: x0, y: yFim, width: largTurno, height: topo - 20 - yFim, borderColor: LINHA, borderWidth: 0.8 });
      for (let dia = 0; dia <= 4; dia++) {
        const xd = x0 + colHora + dia * colDia;
        page.drawLine({ start: { x: xd, y: yFim }, end: { x: xd, y: yCab + 22 }, thickness: 0.5, color: LINHA });
      }
      baseTabelas = Math.min(baseTabelas, yFim);
    });
  }

  // ---- legenda e dias sem aula
  let y = baseTabelas - 18;
  let xl = M;
  const item = (desenho: () => void, texto: string) => {
    desenho();
    page.drawText(texto, { x: xl + 16, y: y + 1, size: 8, font: f, color: TEXTO });
    xl += 16 + f.widthOfTextAtSize(texto, 8) + 16;
  };
  item(() => { page.drawRectangle({ x: xl, y: y - 1, width: 11, height: 9, color: clarear(AZUL2, 0.86) }); page.drawRectangle({ x: xl, y: y - 1, width: 2.5, height: 9, color: AZUL2 }); }, "Aula (turma e disciplina)");
  item(() => page.drawRectangle({ x: xl, y: y - 1, width: 11, height: 9, color: HA_FUNDO, borderColor: HA_BORDA, borderWidth: 0.8 }), "HA: hora-atividade");
  if (d.has.some((h) => h.outroTurno)) item(() => page.drawRectangle({ x: xl, y: y - 1, width: 11, height: 9, color: HA_FUNDO, borderColor: HA_BORDA, borderWidth: 0.8 }), "HA*: hora-atividade de aulas de outro turno");
  if (d.semAula.length) item(() => page.drawRectangle({ x: xl, y: y - 1, width: 11, height: 9, color: SEM_AULA_FUNDO, borderColor: SEM_AULA_TEXTO, borderWidth: 0.6 }), "Dia sem aula");
  if (d.aulas.some((a) => a.extra?.includes("(P)") || a.extra?.includes("(S)"))) item(() => {}, "(P) presencial · (S) suporte (trio)");
  if (d.aulas.some((a) => a.extra?.includes("(ASS)"))) item(() => {}, "(ASS) assíncrona");

  if (d.semAula.length) {
    y -= 16;
    const txt = "Sem aula nesta semana: " + d.semAula.map((s) => `${DIAS[s.diaSemana]} ${ddmm(d.datasSemana[s.diaSemana]!)} (${s.descricao})`).join(" · ");
    page.drawText(caber(txt, f, 8.5, LARGURA - 2 * M), { x: M, y, size: 8.5, font: fb, color: SEM_AULA_TEXTO });
  }

  // ---- reservas da semana
  y -= 22;
  page.drawText("Minhas reservas nesta semana", { x: M, y, size: 10, font: fb, color: AZUL });
  y -= 14;
  if (d.reservas.length === 0) {
    page.drawText("Nenhuma reserva nesta semana.", { x: M, y, size: 8.5, font: f, color: CINZA });
  } else {
    const colunas = 2;
    const largCol = (LARGURA - 2 * M) / colunas;
    d.reservas.forEach((r, i) => {
      const col = i % colunas, lin = Math.floor(i / colunas);
      const yy = y - lin * 12;
      if (yy < 20) return;
      const dia = new Date(`${r.data}T12:00:00Z`).getUTCDay();
      const status = r.status === "pendente" ? " (aguardando confirmação)" : "";
      const txt = `${DIAS_CURTOS[dia - 1] ?? ""} ${ddmm(r.data)} · ${r.numeroAula}ª aula · ${r.sala}: ${r.titulo}${status}`;
      page.drawText(caber(txt, f, 8.5, largCol - 10), { x: M + col * largCol, y: yy, size: 8.5, font: f, color: TEXTO });
    });
  }

  // ---- rodape
  const gerado = new Date(Date.now() - 3 * 3_600_000);
  const rod = `Gerado pelo NexGrade em ${String(gerado.getUTCDate()).padStart(2, "0")}/${String(gerado.getUTCMonth() + 1).padStart(2, "0")}/${gerado.getUTCFullYear()} às ${String(gerado.getUTCHours()).padStart(2, "0")}:${String(gerado.getUTCMinutes()).padStart(2, "0")} · nexgrade.nexuscoretecnologia.com.br`;
  page.drawLine({ start: { x: M, y: 18 }, end: { x: LARGURA - M, y: 18 }, thickness: 0.5, color: LINHA });
  page.drawText(rod, { x: M, y: 8, size: 6.5, font: f, color: CINZA });

  return pdf.save();
}

function linhasDoTurno(d: DadosAgendaPdf, turno: string): Array<{ numeroAula: number; inicio: string; fim: string }> {
  const usados = new Set([
    ...d.aulas.filter((a) => a.turno === turno).map((a) => a.numeroAula),
    ...d.has.filter((h) => h.turno === turno).map((h) => h.numeroAula),
  ]);
  const doTurno = d.horarios.filter((h) => h.turno === turno);
  const nums = new Set([...doTurno.map((h) => h.numeroAula), ...usados]);
  return [...nums].sort((a, b) => a - b).map((n) => {
    const h = doTurno.find((x) => x.numeroAula === n);
    return { numeroAula: n, inicio: h?.inicio ?? "", fim: h?.fim ?? "" };
  });
}
