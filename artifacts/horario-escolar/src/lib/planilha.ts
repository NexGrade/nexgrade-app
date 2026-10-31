// [PLANILHAS-FORMATADAS] (30/10/2026) Excel com formatação, igual em todos os relatórios:
// cabeçalho com a escola, título e data de geração; linha de títulos na cor do NexGrade, congelada
// e com filtro; bordas, linhas alternadas, cores por situação e página pronta para imprimir
// (paisagem, ajustada à largura, títulos repetidos em cada folha). O xlsx (SheetJS) gratuito não
// grava estilos, por isso aqui é exceljs, carregado só quando alguém baixa uma planilha.
import { getEscolaAtual } from "@workspace/api-client-react";
import { salvarBlob } from "@/hooks/use-baixar-arquivo";

export type Valor = string | number | null | undefined;
export type Destaque = "verde" | "vermelho" | "ambar" | "azul" | "cinza";

export type Coluna = {
  titulo: string;
  largura: number;
  /** numero: alinhado à direita; centro: centralizado (aula, dia, sigla). Padrão: texto. */
  tipo?: "texto" | "numero" | "centro";
};

export type Aba = {
  nome: string;
  titulo: string;
  subtitulo?: string;
  aviso?: string | null;
  colunas: Coluna[];
  linhas: Valor[][];
  /** mensagem no lugar da tabela quando não há linhas */
  vazio?: string;
  /** a última linha é de totais (fica em negrito, com fundo) */
  total?: boolean;
  /** altura das linhas de dados (ex.: espaço para assinar no ponto) */
  alturaLinha?: number;
  /** cor de uma célula; `indice` é a posição da linha em `linhas` */
  destaque?: (valor: Valor, coluna: number, linha: Valor[], indice: number) => Destaque | undefined;
};

const AZUL = "FF1566C1"; // --primary do sistema (hsl 212 80% 42%)
const BORDA = "FFD0D7E2";
const ZEBRA = "FFF4F7FB";
const CORES: Record<Destaque, { fundo: string; fonte: string }> = {
  verde: { fundo: "FFE6F4EA", fonte: "FF1E7B34" },
  vermelho: { fundo: "FFFDE8E8", fonte: "FFB42318" },
  ambar: { fundo: "FFFEF3E2", fonte: "FF9A5B00" },
  azul: { fundo: "FFE6F1FB", fonte: "FF1D5F99" },
  cinza: { fundo: "FFEEEFF1", fonte: "FF6B7280" },
};
const TIPO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

async function nomeDaEscola(): Promise<string> {
  try { return (await getEscolaAtual()).nomeFantasia ?? ""; } catch { return ""; }
}

/** Gera o .xlsx formatado e baixa. `escola` vazio = busca o nome da escola atual. */
export async function baixarExcel(abas: Aba[], arquivo: string, escola?: string) {
  const [mod, nome] = await Promise.all([import("exceljs"), escola ? Promise.resolve(escola) : nomeDaEscola()]);
  const ExcelJS = (mod as unknown as { default?: typeof mod }).default ?? mod;
  const wb = new ExcelJS.Workbook();
  wb.creator = "NexGrade";
  wb.created = new Date();
  const geradoEm = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  const borda = { style: "thin" as const, color: { argb: BORDA } };
  const bordas = { top: borda, left: borda, bottom: borda, right: borda };

  for (const a of abas) {
    const ws = wb.addWorksheet(a.nome.replace(/[\\/?*[\]:]/g, " ").slice(0, 31));
    const n = a.colunas.length;
    ws.columns = a.colunas.map((c) => ({ width: c.largura }));

    // cabeçalho do relatório (cada linha ocupa a largura da tabela)
    const titulo = (texto: string, fonte: Partial<import("exceljs").Font>, altura?: number) => {
      const r = ws.addRow([texto]);
      ws.mergeCells(r.number, 1, r.number, Math.max(n, 1));
      r.getCell(1).font = { name: "Calibri", ...fonte };
      r.getCell(1).alignment = { vertical: "middle", wrapText: true };
      if (altura) r.height = altura;
    };
    if (nome) titulo(nome, { size: 14, bold: true, color: { argb: AZUL } }, 22);
    titulo(a.titulo, { size: 12, bold: true }, 18);
    if (a.subtitulo) titulo(a.subtitulo, { size: 11 });
    if (a.aviso) titulo(a.aviso, { size: 10, italic: true, color: { argb: CORES.ambar.fonte } }, 30);
    titulo(`Gerado em ${geradoEm} pelo NexGrade`, { size: 9, color: { argb: "FF6B7280" } });
    ws.addRow([]);

    // linha de títulos
    const cab = ws.addRow(a.colunas.map((c) => c.titulo));
    cab.height = 30;
    cab.eachCell((cel) => {
      cel.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
      cel.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cel.border = bordas;
    });
    const linhaCab = cab.number;

    if (!a.linhas.length) {
      const r = ws.addRow([a.vazio ?? "Nada para mostrar."]);
      ws.mergeCells(r.number, 1, r.number, Math.max(n, 1));
      r.getCell(1).font = { italic: true, color: { argb: "FF6B7280" } };
    }

    a.linhas.forEach((linha, i) => {
      const r = ws.addRow(linha.map((v) => (v === undefined || v === null ? "" : v)));
      if (a.alturaLinha) r.height = a.alturaLinha;
      const ehTotal = a.total && i === a.linhas.length - 1;
      for (let c = 0; c < n; c++) {
        const cel = r.getCell(c + 1);
        const tipo = a.colunas[c]?.tipo ?? "texto";
        cel.border = ehTotal ? { ...bordas, top: { style: "medium", color: { argb: AZUL } } } : bordas;
        cel.alignment = {
          vertical: "middle",
          horizontal: tipo === "numero" ? "right" : tipo === "centro" ? "center" : "left",
          wrapText: tipo === "texto",
        };
        const cor = ehTotal ? undefined : a.destaque?.(linha[c], c, linha, i);
        if (cor) {
          cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CORES[cor].fundo } };
          cel.font = { color: { argb: CORES[cor].fonte } };
        } else if (ehTotal) {
          cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE3ECF8" } };
          cel.font = { bold: true };
        } else if (i % 2 === 1) {
          cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
        }
      }
    });

    // rolar com o título fixo, filtro na linha de títulos e impressão
    ws.views = [{ state: "frozen", ySplit: linhaCab, xSplit: n > 3 ? 1 : 0, showGridLines: false }];
    const ultimaComFiltro = linhaCab + a.linhas.length - (a.total ? 1 : 0);
    if (a.linhas.length && n > 0) ws.autoFilter = { from: { row: linhaCab, column: 1 }, to: { row: ultimaComFiltro, column: n } };
    // impressão sem quebra de página: tudo numa folha só, enquanto a letra continuar legível
    // (altura estimada até ~1,8 folha = redução de até ~55%); lista mais longa vai em várias
    // folhas, sempre ajustada à largura e com a linha de títulos repetida.
    let altura = 0;
    ws.eachRow({ includeEmpty: true }, (r) => { altura += r.height || 15; });
    const umaFolha = altura <= 515 * 1.8; // 515 pt ≈ altura útil do A4 deitado com estas margens
    ws.pageSetup = {
      paperSize: 9, // A4
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: umaFolha ? 1 : 0,
      horizontalCentered: true,
      printTitlesRow: `${linhaCab}:${linhaCab}`,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.2, footer: 0.3 },
    };
    ws.headerFooter = { oddFooter: `&L&8NexGrade · ${a.titulo}&R&8Página &P de &N` };
  }

  const bytes = await wb.xlsx.writeBuffer();
  salvarBlob(new Blob([bytes], { type: TIPO_XLSX }), arquivo);
}

/** Cores padrão das situações de presença (Presente, Falta, Atraso, Substituído). */
export function corDaSituacao(valor: Valor): Destaque | undefined {
  switch (valor) {
    case "Presente": return "verde";
    case "Falta": return "vermelho";
    case "Atraso": return "ambar";
    case "Substituído": return "azul";
    default: return undefined;
  }
}
