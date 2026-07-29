import { Router } from "express";
import { db } from "@workspace/db";
import { professoresTable, turmasTable, disciplinasTable, professorDisciplinasTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getEscolaId } from "../lib/escola-id";
import { registrarAuditoria } from "../lib/audit";

const router = Router();

type ProfessorRow = { nome: string; email: string; cpf?: string; matricula?: string; cargaHorariaTotal?: number; disciplinas?: string };
type TurmaRow = { nome: string; serie: string; turno?: string; anoLetivo?: number };
type DisciplinaRow = { nome: string; cargaSemanal?: number; cor?: string };

function detectarDelimitador(headerLine: string): "," | ";" {
  const virgulas = (headerLine.match(/,/g) || []).length;
  const pontosVirgula = (headerLine.match(/;/g) || []).length;
  return pontosVirgula >= virgulas ? ";" : ",";
}

function parseLinhaCSV(line: string, delimitador: string): string[] {
  const campos: string[] = [];
  let atual = "";
  let dentroAspas = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (dentroAspas && line[i + 1] === '"') { atual += '"'; i++; }
      else dentroAspas = !dentroAspas;
    } else if (char === delimitador && !dentroAspas) {
      campos.push(atual.trim());
      atual = "";
    } else {
      atual += char;
    }
  }
  campos.push(atual.trim());
  return campos;
}

export function parseCSV(csvBruto: string): string[][] {
  const csv = csvBruto.replace(/^\uFEFF/, "").trim();
  const linhas = csv.split(/\r?\n/).filter(l => l.length > 0);
  if (linhas.length === 0) return [];

  const delimitador = detectarDelimitador(linhas[0]!);
  return linhas.map(line => parseLinhaCSV(line, delimitador));
}

export function detectType(headers: string[]): "professores" | "turmas" | "disciplinas" | "desconhecido" {
  const h = headers.map(h => h.toLowerCase());
  if (h.some(x => x.includes("professor") || x.includes("docente"))) return "professores";
  if (h.some(x => x.includes("turma") || x.includes("serie") || x.includes("s�rie"))) return "turmas";
  if (h.some(x => x.includes("disciplina") || x.includes("materia") || x.includes("mat�ria"))) return "disciplinas";
  return "desconhecido";
}

// POST /importar/preview � analisa CSV e retorna preview sem salvar
router.post("/preview", async (req, res) => {
  const { csv, tipo } = req.body as { csv: string; tipo?: string };
  if (!csv?.trim()) { res.status(400).json({ error: "CSV vazio" }); return; }

  const rows = parseCSV(csv);
  if (rows.length < 2) { res.status(400).json({ error: "CSV deve ter cabe�alho + dados" }); return; }

  const headers = rows[0]!;
  const tipoDetectado = tipo ?? detectType(headers);
  const dados = rows.slice(1).filter(r => r.some(c => c.length > 0));

  res.json({
    tipoDetectado,
    headers,
    totalLinhas: dados.length,
    preview: dados.slice(0, 5).map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""]))),
    erros: [],
  });
});

// POST /importar/confirmar � salva os dados no banco
router.post("/confirmar", async (req, res) => {
  const escolaId = getEscolaId(req);
  const { csv, tipo } = req.body as { csv: string; tipo: string };
  if (!csv?.trim()) { res.status(400).json({ error: "CSV vazio" }); return; }

  const rows = parseCSV(csv);
  if (rows.length < 2) { res.status(400).json({ error: "CSV deve ter cabe�alho + dados" }); return; }

  const headers = rows[0]!.map(h => h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
  const dados = rows.slice(1).filter(r => r.some(c => c.length > 0));

  const idx = (names: string[]) => {
    for (const n of names) { const i = headers.findIndex(h => h.includes(n)); if (i >= 0) return i; }
    return -1;
  };

  let importados = 0;
  const erros: string[] = [];

  if (tipo === "professores") {
    for (const [li, row] of dados.entries()) {
      const nome = row[idx(["nome"])]?.trim();
      const email = row[idx(["email"])]?.trim();
      if (!nome || !email) { erros.push(`Linha ${li + 2}: nome e email obrigat�rios`); continue; }
      try {
        await db.insert(professoresTable).values({
          escolaId,
          nome,
          email,
          cpf: row[idx(["cpf"])]?.trim() || undefined,
          matricula: row[idx(["matricula"])]?.trim() || undefined,
          cargaHorariaTotal: Number(row[idx(["carga", "horas"])] ?? 20) || 20,
        }).onConflictDoNothing();
        importados++;
      } catch { erros.push(`Linha ${li + 2}: erro ao importar "${nome}"`); }
    }
  } else if (tipo === "turmas") {
    const anoAtual = new Date().getFullYear();
    for (const [li, row] of dados.entries()) {
      const nome = row[idx(["nome", "turma"])]?.trim();
      const serie = row[idx(["serie", "s�rie", "ano"])]?.trim();
      if (!nome) { erros.push(`Linha ${li + 2}: nome obrigat�rio`); continue; }
      try {
        await db.insert(turmasTable).values({
          escolaId,
          nome,
          serie: serie ?? nome,
          turno: row[idx(["turno"])]?.trim() ?? "matutino",
          anoLetivo: Number(row[idx(["ano", "letivo"])] ?? anoAtual) || anoAtual,
        });
        importados++;
      } catch { erros.push(`Linha ${li + 2}: erro ao importar "${nome}"`); }
    }
  } else if (tipo === "disciplinas") {
    const cores = ["#6366f1","#ec4899","#f59e0b","#10b981","#3b82f6","#ef4444","#8b5cf6","#14b8a6"];
    for (const [li, row] of dados.entries()) {
      const nome = row[idx(["nome", "disciplina", "materia"])]?.trim();
      if (!nome) { erros.push(`Linha ${li + 2}: nome obrigat�rio`); continue; }
      try {
        await db.insert(disciplinasTable).values({
          escolaId,
          nome,
          cargaSemanal: Number(row[idx(["carga", "semanal", "aulas"])] ?? 2) || 2,
          cor: row[idx(["cor"])]?.trim() || cores[li % cores.length]!,
        });
        importados++;
      } catch { erros.push(`Linha ${li + 2}: erro ao importar "${nome}"`); }
    }
  } else {
    res.status(400).json({ error: `Tipo desconhecido: ${tipo}` });
    return;
  }

  await registrarAuditoria({
    req, escolaId, entidade: `importacao_${tipo}`, entidadeId: 0,
    acao: "criacao", dadosAnteriores: null, dadosNovos: { importados, erros, total: dados.length },
  });

  res.json({ importados, erros, total: dados.length });
});

export default router;
