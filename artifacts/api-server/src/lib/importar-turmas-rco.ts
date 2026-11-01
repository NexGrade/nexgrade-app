// [IMPORTAR-TURMAS-RCO] (31/10/2026) Cadastro das turmas de uma escola NOVA a partir do arquivo do RCO
// (EXPORT_URANIA.XML que a escola enviou pela tela "Arquivo do RCO"), pelo Painel Master. Mesma regra do
// script lib/db/importar-turmas-do-rco.cjs (que continua existindo):
//  - uma turma por turma do RCO (manha, tarde, noite), com codigo SERE e, no 3o ano dividido, o codigo
//    da parte IF na mesma turma (codigo_sere_if);
//  - as disciplinas de cada turma com as aulas por semana da grade do RCO (FGB + IF somadas);
//  - cada disciplina do RCO e ligada a uma disciplina da escola: 1) mesmo Codigo Externo; 2) SAE
//    (ABREVIATURA do arquivo ou tabela codigos_rco_disciplina); 3) mesmo nome. Sem par: cria a disciplina
//    (nome do padrao NexGrade; sigla e cor como nas outras escolas). Grava o Codigo Externo na disciplina
//    ligada quando ela ainda nao tem.
// Fica de fora: Monitoria, Treinamento Esportivo, turno integral e Lingua Espanhola (optativa; entra com
// a opcao "com Espanhola"). Turma que ja existe (mesmo codigo SERE, ou mesmo nome e turno) e pulada.
// Nao mexe em professores, grade, horarios nem em turmas existentes.
// A parte pura (planejar + ligar) e testada; a prévia e o aplicar leem o banco.
import { db, configuracoesTable, codigosRcoDisciplinaTable, disciplinasTable, turmasTable, turmaDisciplinasTable } from "@workspace/db";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { lerExportacaoRco, type ExportacaoRco } from "./rco-exportacao";
import { CHAVE_CONTEUDO, CHAVE_EXPORTACAO, CHAVE_IMPORTADO, type EnvioArquivoRco, type ImportacaoArquivoRco } from "./arquivo-rco";
import { NOME_PADRAO_POR_CODIGO } from "./nome-padrao-disciplina";
import { carregarSiglasReferencia, siglaParaDisciplina, type SiglasReferencia } from "./sigla-disciplina";
import { carregarCoresReferencia, corParaDisciplina } from "./cor-disciplina";

const CURSOS_FORA: Record<string, string> = { "3009": "Treinamento Esportivo", "3041": "Monitoria", "3042": "Monitoria" };
export const DISC_ESPANHOLA = 3826;
// nomes que a escola usa e que a regra "serie + letra" nao daria (turma tecnica com o mesmo 3A do FGB)
const NOMES_FIXOS: Record<string, string> = { "0016_3_1_A": "3º Tec", "2511_1_1_A": "1º Tec" };
const TURNO: Record<string, "matutino" | "vespertino" | "noturno"> = { M: "matutino", T: "vespertino", N: "noturno" };
// nome por extenso e com acento para as disciplinas que o RCO abrevia (quando nao ha padrao NexGrade)
const NOMES_DISC: Record<number, string> = {
  22: "Arte Paranaense", 36: "Geografia do Paraná", 37: "História do Paraná", 81: "Matemática II", 129: "Física II",
  136: "Biologia II", 211: "Química I", 789: "Noções de Direito", 829: "Administração Financeira e Orçamentária",
  1909: "Arte II", 2997: "Literatura e Produção de Texto", 3807: "Geografia I", 3808: "Língua Inglesa I", 3811: "História I",
  3978: "Tecnologias e Ferramentas de Gestão", 3979: "Liderança e Gestão de Pessoas", 3981: "Controladoria e Finanças",
  4043: "Negociação e Vendas", 4052: "Sociologia I", 4641: "Física III",
  6038: "Recomposição da Aprendizagem em Língua Portuguesa", 6318: "Filosofia: Análise de Textos Filosóficos",
  6319: "Sociologia: Governo, Cidadania e Sociedade", 6322: "Física e Tecnociência",
  6323: "Matemática: Resolução de Problemas", 6324: "Química e Tecnociência", 6325: "Biologia: Sustentabilidade em Ação",
  3799: "Monitoria", 103: "Aulas Especializadas de Treinamento Esportivo", 3826: "Língua Espanhola",
};

const semAcento = (s: string) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
export const chaveNomeRco = (s: string) => semAcento(s).toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const PEQUENAS = new Set(["de", "da", "do", "das", "dos", "e", "em", "a", "o"]);
const ROMANOS = new Set(["I", "II", "III", "IV"]);
/** "LINGUA PORTUGUESA" -> "Lingua Portuguesa" (mesma regra do script). */
export function nomeBonito(s: string): string {
  return String(s).toLowerCase().split(/\s+/).map((p, i) => {
    if (ROMANOS.has(p.toUpperCase())) return p.toUpperCase();
    if (i > 0 && PEQUENAS.has(p)) return p;
    return p.charAt(0).toUpperCase() + p.slice(1);
  }).join(" ");
}
/** SAE como o script compara: numero sem zero a esquerda, em texto. */
const saeTexto = (sae: string | null | undefined) => (sae != null && /^\d+$/.test(String(sae).trim()) ? String(Number(sae)) : null);

// ---------- plano das turmas (so o arquivo) ----------
export type TurmaPlanejada = {
  rco: string; codigoSere: number; codigoSereIf: number | null; nome: string;
  turno: "matutino" | "vespertino" | "noturno"; serie: string; nivel: "fundamental" | "medio_tecnico";
  disciplinas: Array<{ codigo: number; aulas: number }>;
  /** aulas de Lingua Espanhola que ficaram fora (0 se nao tem ou se entrou) */
  espanholaFora: number;
};
export type PlanoTurmasRco = { plano: TurmaPlanejada[]; fora: string[]; repetidos: string[] };

export function planejarTurmasRco(e: ExportacaoRco, comEspanhola: boolean): PlanoTurmasRco {
  const grade = new Map<number, Map<number, number>>();
  for (const g of e.grades) {
    if (!grade.has(g.codTurma)) grade.set(g.codTurma, new Map());
    const m = grade.get(g.codTurma)!;
    m.set(g.codDisciplina, (m.get(g.codDisciplina) ?? 0) + g.aulas);
  }
  const partesIf = new Set(e.turmas.map((t) => t.codigoIf).filter((c): c is number => !!c));
  const plano: TurmaPlanejada[] = [], fora: string[] = [];
  for (const t of e.turmas) {
    if (partesIf.has(t.codigo)) continue; // parte IF entra junto com a turma FGB
    const [curso = "", serie = "", , letra = ""] = t.nome.split("_");
    const turno = TURNO[t.turno];
    if (CURSOS_FORA[curso]) { fora.push(`${CURSOS_FORA[curso]}: ${t.nome} (SERE ${t.codigo}, ${turno ?? t.turno})`); continue; }
    if (!turno) { fora.push(`turno ${t.turno} (integral?): ${t.nome} (SERE ${t.codigo})`); continue; }
    const fundamental = curso === "4060";
    const codigoIf = t.codigoIf || null;
    const g = new Map<number, number>();
    for (const cod of [t.codigo, codigoIf]) {
      if (cod == null) continue;
      for (const [d, a] of grade.get(cod) ?? []) g.set(d, (g.get(d) ?? 0) + a);
    }
    const espanhola = g.get(DISC_ESPANHOLA) ?? 0;
    if (espanhola && !comEspanhola) g.delete(DISC_ESPANHOLA);
    plano.push({
      rco: t.nome, codigoSere: t.codigo, codigoSereIf: codigoIf, nome: NOMES_FIXOS[t.nome] ?? `${serie}º${letra}`, turno,
      serie: fundamental ? `${serie}º Ano` : `${serie}ª Série`, nivel: fundamental ? "fundamental" : "medio_tecnico",
      disciplinas: [...g].map(([codigo, aulas]) => ({ codigo, aulas })), espanholaFora: comEspanhola ? 0 : espanhola,
    });
  }
  const repetidos = plano.filter((p, i) => plano.findIndex((q) => q.nome === p.nome && q.turno === p.turno) !== i).map((p) => `${p.nome} ${p.turno}`);
  return { plano, fora, repetidos };
}

// ---------- ligacao das disciplinas do RCO com as da escola ----------
export type DisciplinaDaEscola = { id: number; nome: string; codigoSae: string | null; codigoExternoRco: number | null };
export type TurmaDaEscola = { id: number; nome: string; turno: string; codigoSere: number | null };
export type ComoLigou = "codigo externo" | "SAE" | "nome" | "nova";
export type LigacaoDisciplina = {
  codigo: number; nomeRco: string;
  /** null = disciplina nova */
  disciplinaId: number | null; nome: string; como: ComoLigou; gravarCodigo: boolean;
  /** sae do arquivo (vai para a disciplina nova) */
  sae: string | null;
};

export function ligarDisciplinasRco(
  e: ExportacaoRco, turmasNovas: TurmaPlanejada[], discsEscola: DisciplinaDaEscola[], saePorExterno: Map<number, number>,
): { ligacoes: LigacaoDisciplina[]; avisos: string[] } {
  const disc = new Map(e.disciplinas.map((d) => [d.codigo, d]));
  const usados = [...new Set(turmasNovas.flatMap((t) => t.disciplinas.map((d) => d.codigo)))].sort((a, b) => a - b);
  const ligacoes: LigacaoDisciplina[] = [], avisos: string[] = [];
  for (const cod of usados) {
    const d = disc.get(cod);
    const nomeRco = d?.nome ?? `DISCIPLINA ${cod}`;
    const saeArquivo = saeTexto(d?.sae);
    let c1 = discsEscola.filter((x) => x.codigoExternoRco != null && Number(x.codigoExternoRco) === cod);
    let como: ComoLigou = "codigo externo";
    if (!c1.length) {
      const pelaTabela = saePorExterno.get(cod);
      const saes = [saeArquivo, pelaTabela != null ? String(pelaTabela) : null].filter((s): s is string => !!s && s !== "0");
      c1 = discsEscola.filter((x) => x.codigoSae && saes.includes(String(x.codigoSae)) && x.codigoExternoRco == null);
      como = "SAE";
    }
    if (!c1.length) { c1 = discsEscola.filter((x) => chaveNomeRco(x.nome) === chaveNomeRco(nomeRco) && x.codigoExternoRco == null); como = "nome"; }
    if (c1.length > 1) {
      const mesmoNome = c1.filter((x) => chaveNomeRco(x.nome) === chaveNomeRco(nomeRco));
      if (mesmoNome.length === 1) c1 = mesmoNome;
    }
    if (c1.length > 1) { avisos.push(`${cod} ${nomeRco}: ${c1.length} disciplinas candidatas (${c1.map((x) => `${x.nome} #${x.id}`).join(", ")})`); continue; }
    if (c1.length === 1) {
      const x = c1[0]!;
      ligacoes.push({ codigo: cod, nomeRco, disciplinaId: x.id, nome: x.nome, como, gravarCodigo: x.codigoExternoRco == null, sae: saeArquivo });
      continue;
    }
    const nomeNovo = NOME_PADRAO_POR_CODIGO[cod] ?? NOMES_DISC[cod] ?? nomeBonito(nomeRco);
    const mesmo = discsEscola.find((x) => chaveNomeRco(x.nome) === chaveNomeRco(nomeNovo));
    if (mesmo) avisos.push(`${cod} ${nomeRco}: a escola já tem "${mesmo.nome}" #${mesmo.id} com outro Código Externo (${mesmo.codigoExternoRco ?? "-"})`);
    else ligacoes.push({ codigo: cod, nomeRco, disciplinaId: null, nome: nomeNovo, como: "nova", gravarCodigo: true, sae: saeArquivo });
  }
  // duas disciplinas do RCO caindo na mesma disciplina da escola
  const porId = new Map<number, number[]>();
  for (const l of ligacoes) if (l.disciplinaId != null) porId.set(l.disciplinaId, [...(porId.get(l.disciplinaId) ?? []), l.codigo]);
  for (const [id, cods] of porId) if (cods.length > 1) avisos.push(`disciplina #${id} recebeu ${cods.length} códigos do RCO (${cods.join(", ")})`);
  return { ligacoes, avisos };
}

// ---------- prévia (pura, a partir do estado do banco) ----------
export type TurmaNaPrevia = Omit<TurmaPlanejada, "disciplinas"> & { disciplinas: number; aulas: number; jaExiste: boolean };
export type DisciplinaNaPrevia = LigacaoDisciplina & { sigla: string | null };
export type PreviaImportacaoRco = {
  ano: number; comEspanhola: boolean; espanholaNoArquivo: boolean;
  turmas: TurmaNaPrevia[];
  /** turmas que ja existem na escola (nome e turno) */
  puladas: string[];
  fora: string[]; repetidos: string[];
  disciplinas: DisciplinaNaPrevia[];
  avisos: string[];
  resumo: { turmasNovas: number; vinculos: number; disciplinasNovas: number; codigosAGravar: number };
  /** null = pode aplicar */
  bloqueio: string | null;
};

export function montarPreviaImportacaoRco(
  e: ExportacaoRco, existentes: TurmaDaEscola[], discsEscola: DisciplinaDaEscola[], saePorExterno: Map<number, number>,
  opcoes: { ano: number; comEspanhola: boolean }, siglas: SiglasReferencia | null = null,
): { previa: PreviaImportacaoRco; novas: TurmaPlanejada[]; ligacoes: LigacaoDisciplina[] } {
  const p = planejarTurmasRco(e, opcoes.comEspanhola);
  const jaTem = (t: TurmaPlanejada) => existentes.some((x) => (x.codigoSere != null && Number(x.codigoSere) === t.codigoSere) || (x.nome === t.nome && x.turno === t.turno));
  const novas = p.plano.filter((t) => !jaTem(t));
  const { ligacoes, avisos } = ligarDisciplinasRco(e, novas, discsEscola, saePorExterno);
  const disciplinasNovas = ligacoes.filter((l) => l.disciplinaId == null).length;
  const bloqueio = p.repetidos.length ? "Há turmas com o mesmo nome no mesmo turno."
    : avisos.length ? "Resolva os avisos de atenção antes de aplicar."
    : !novas.length ? "Nada a gravar: todas as turmas do arquivo já existem na escola."
    : null;
  const previa: PreviaImportacaoRco = {
    ano: opcoes.ano, comEspanhola: opcoes.comEspanhola,
    espanholaNoArquivo: e.grades.some((g) => g.codDisciplina === DISC_ESPANHOLA),
    turmas: p.plano.map(({ disciplinas, ...t }) => ({ ...t, disciplinas: disciplinas.length, aulas: disciplinas.reduce((s, d) => s + d.aulas, 0), jaExiste: jaTem({ ...t, disciplinas }) })),
    puladas: p.plano.filter(jaTem).map((t) => `${t.nome} ${t.turno}`),
    fora: p.fora, repetidos: p.repetidos,
    disciplinas: ligacoes.map((l) => ({ ...l, sigla: l.disciplinaId == null ? siglaParaDisciplina(siglas, l.codigo, l.nome) : null })),
    avisos,
    resumo: { turmasNovas: novas.length, vinculos: novas.reduce((s, t) => s + t.disciplinas.length, 0), disciplinasNovas, codigosAGravar: ligacoes.filter((l) => l.disciplinaId != null && l.gravarCodigo).length },
    bloqueio,
  };
  return { previa, novas, ligacoes };
}

// ---------- banco ----------
type Executor = Pick<typeof db, "select">;

export class ErroImportacaoRco extends Error {
  constructor(message: string, public status = 409) { super(message); }
}

async function lerArquivo(ex: Executor, escolaId: string): Promise<{ exportacao: ExportacaoRco; nomeArquivo: string; enviadoEm: string | null }> {
  const linhas = await ex.select({ chave: configuracoesTable.chave, valor: configuracoesTable.valor }).from(configuracoesTable)
    .where(and(eq(configuracoesTable.escolaId, escolaId), inArray(configuracoesTable.chave, [CHAVE_CONTEUDO, CHAVE_EXPORTACAO])));
  const xml = (linhas.find((l) => l.chave === CHAVE_CONTEUDO)?.valor as { xml?: string } | undefined)?.xml;
  const envio = linhas.find((l) => l.chave === CHAVE_EXPORTACAO)?.valor as EnvioArquivoRco | undefined;
  const exportacao = xml ? lerExportacaoRco(xml) : null;
  if (!exportacao) throw new ErroImportacaoRco("A escola ainda não enviou o arquivo do RCO (tela Arquivo do RCO).", 404);
  return { exportacao, nomeArquivo: envio?.nomeArquivo ?? "exportacao-rco.xml", enviadoEm: envio?.enviadoEm ?? null };
}

async function lerEstado(ex: Executor, escolaId: string) {
  const [existentes, discs, codigos] = await Promise.all([
    ex.select({ id: turmasTable.id, nome: turmasTable.nome, turno: turmasTable.turno, codigoSere: turmasTable.codigoSere }).from(turmasTable).where(eq(turmasTable.escolaId, escolaId)),
    ex.select({ id: disciplinasTable.id, nome: disciplinasTable.nome, codigoSae: disciplinasTable.codigoSae, codigoExternoRco: disciplinasTable.codigoExternoRco }).from(disciplinasTable).where(eq(disciplinasTable.escolaId, escolaId)),
    ex.select({ sae: codigosRcoDisciplinaTable.codigoSae, externo: codigosRcoDisciplinaTable.codigoExterno }).from(codigosRcoDisciplinaTable),
  ]);
  // como o script: um Codigo Externo -> um SAE (o ultimo lido vence)
  const saePorExterno = new Map(codigos.map((c) => [Number(c.externo), Number(c.sae)]));
  return { existentes, discs, saePorExterno };
}

export type OpcoesImportacaoRco = { ano: number; comEspanhola: boolean };
export type PreviaComArquivo = PreviaImportacaoRco & { arquivo: { nomeArquivo: string; enviadoEm: string | null } };

export async function previaImportacaoRco(escolaId: string, opcoes: OpcoesImportacaoRco): Promise<PreviaComArquivo> {
  const arq = await lerArquivo(db, escolaId);
  const [estado, siglas] = await Promise.all([lerEstado(db, escolaId), carregarSiglasReferencia()]);
  const { previa } = montarPreviaImportacaoRco(arq.exportacao, estado.existentes, estado.discs, estado.saePorExterno, opcoes, siglas);
  return { ...previa, arquivo: { nomeArquivo: arq.nomeArquivo, enviadoEm: arq.enviadoEm } };
}

export type ResultadoImportacaoRco = {
  turmas: Array<{ id: number; nome: string; turno: string; codigoSere: number }>;
  disciplinasNovas: Array<{ id: number; nome: string; codigo: number }>;
  codigosGravados: Array<{ disciplinaId: number; codigo: number }>;
  turmasDaEscolaAgora: number;
};

/** Grava numa transacao, recalculando a prévia com o banco travado para a escola (dois cliques nao duplicam). */
export async function aplicarImportacaoRco(escolaId: string, opcoes: OpcoesImportacaoRco, por: string | null = null): Promise<ResultadoImportacaoRco> {
  const [siglas, cores] = await Promise.all([carregarSiglasReferencia(), carregarCoresReferencia()]);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"importar-turmas-rco:" + escolaId}))`);
    const arq = await lerArquivo(tx, escolaId);
    const estado = await lerEstado(tx, escolaId);
    const { previa, novas, ligacoes } = montarPreviaImportacaoRco(arq.exportacao, estado.existentes, estado.discs, estado.saePorExterno, opcoes, siglas);
    if (previa.bloqueio) throw new ErroImportacaoRco(previa.bloqueio);

    const out: ResultadoImportacaoRco = { turmas: [], disciplinasNovas: [], codigosGravados: [], turmasDaEscolaAgora: 0 };
    const idPorCodigo = new Map<number, number>();
    for (const l of ligacoes) {
      if (l.disciplinaId != null) {
        idPorCodigo.set(l.codigo, l.disciplinaId);
        if (l.gravarCodigo) {
          const r = await tx.update(disciplinasTable).set({ codigoExternoRco: l.codigo })
            .where(and(eq(disciplinasTable.id, l.disciplinaId), eq(disciplinasTable.escolaId, escolaId), isNull(disciplinasTable.codigoExternoRco)))
            .returning({ id: disciplinasTable.id });
          if (r.length) out.codigosGravados.push({ disciplinaId: l.disciplinaId, codigo: l.codigo });
        }
        continue;
      }
      const aulas = Math.max(...novas.flatMap((t) => t.disciplinas.filter((x) => x.codigo === l.codigo).map((x) => x.aulas)), 1);
      const [d] = await tx.insert(disciplinasTable).values({
        escolaId, nome: l.nome, sigla: siglaParaDisciplina(siglas, l.codigo, l.nome), cargaSemanal: aulas,
        codigoSae: l.sae, codigoExternoRco: l.codigo, cor: corParaDisciplina(cores, l.codigo, l.nome),
      }).returning({ id: disciplinasTable.id });
      idPorCodigo.set(l.codigo, d!.id);
      out.disciplinasNovas.push({ id: d!.id, nome: l.nome, codigo: l.codigo });
    }
    for (const t of novas) {
      const [turma] = await tx.insert(turmasTable).values({
        escolaId, nome: t.nome, serie: t.serie, turno: t.turno, nivelEnsino: t.nivel, anoLetivo: opcoes.ano,
        codigoSere: t.codigoSere, codigoSereIf: t.codigoSereIf,
      }).returning({ id: turmasTable.id });
      if (t.disciplinas.length) {
        await tx.insert(turmaDisciplinasTable).values(t.disciplinas.map((d) => ({
          turmaId: turma!.id, disciplinaId: idPorCodigo.get(d.codigo)!, cargaHorariaSemanalOverride: d.aulas,
        })));
      }
      out.turmas.push({ id: turma!.id, nome: t.nome, turno: t.turno, codigoSere: t.codigoSere });
    }
    const [n] = await tx.select({ n: sql<number>`count(*)::int` }).from(turmasTable).where(eq(turmasTable.escolaId, escolaId));
    out.turmasDaEscolaAgora = Number(n?.n ?? 0);
    // a tela Arquivo do RCO da escola mostra "Turmas cadastradas em DD/MM" (sem tabela nova)
    const importado: ImportacaoArquivoRco = { em: new Date().toISOString(), por, turmas: out.turmas.length, disciplinasNovas: out.disciplinasNovas.length };
    await tx.delete(configuracoesTable).where(and(eq(configuracoesTable.escolaId, escolaId), eq(configuracoesTable.chave, CHAVE_IMPORTADO)));
    await tx.insert(configuracoesTable).values({ escolaId, chave: CHAVE_IMPORTADO, valor: importado, descricao: "Ultima importacao das turmas a partir do arquivo do RCO (Painel Master)" });
    return out;
  });
}
