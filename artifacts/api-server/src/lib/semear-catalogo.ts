import { padronizarNomeDisciplina } from "./padronizar-nome-disciplina"; // [PADRAO-NOME-DISCIPLINA]
/**
 * [CATALOGO] Semeia o catalogo oficial SEED-PR numa escola (29/09/2026).
 *
 * Fonte: os modelos oficiais do proprio backend (os mesmos do "Aplicar modelo
 * oficial"): 15 gerais (Fundamental e Medio) + 63 tecnicos (CNCT).
 * Cria cursos, uma matriz por serie, as disciplinas que faltarem e as cargas.
 *
 * Seguro para rodar mais de uma vez:
 * - curso com o mesmo nome (e mesma forma de oferta) e reaproveitado;
 * - matriz que ja existe (mesmo curso + serie) NUNCA e alterada;
 * - disciplina com o mesmo nome (sem diferenciar maiusculas/acentos) e reaproveitada.
 * Cursos criados aqui entram com ofertado = false: a escola liga os que oferta.
 */
import { db, cursosTable, matrizesCurricularesTable, itensMatrizTable, disciplinasTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { MATRIZES_TECNICAS_SEED_PR_2026 } from "./matrizes-tecnicas-seed-pr";
import { MATRIZES_OFICIAIS_SEED_PR } from "./matrizes-oficiais-seed-pr";

const EIXOS = new Set([
  "ambiente_saude", "controle_processos_industriais", "desenvolvimento_educacional_social", "gestao_negocios",
  "informacao_comunicacao", "infraestrutura", "militar", "producao_alimenticia", "producao_cultural_design",
  "producao_industrial", "recursos_naturais", "seguranca", "turismo_hospitalidade_lazer",
]);

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function chaveNome(s: string): string {
  return semAcento(String(s ?? "")).toLowerCase().replace(/\s+/g, " ").trim();
}
function eixoParaEnum(eixo?: string | null): string | null {
  if (!eixo) return null;
  const n = semAcento(eixo).toLowerCase().replace(/[,;]/g, " ").split(/\s+/)
    .filter((p) => p && !["e", "de", "do", "da", "dos", "das"].includes(p)).join("_");
  return EIXOS.has(n) ? n : EIXOS.has(eixo) ? eixo : null;
}
function nomeCursoTecnico(curso: string, forma: string): string {
  const n = chaveNome(curso);
  if (n.includes("integrad") || n.includes("concomitante") || n.includes("subsequente")) return curso;
  return forma === "integrada" ? `${curso} Integrado ao Ensino Médio` : `${curso} (Concomitante/Intercomplementar)`;
}

type ItemModelo = { nome: string; categoria: string; cargaHorariaSemanal: number; obrigatoria?: boolean };
type CursoModelo = {
  nome: string; nivel: string; codigoCurso: string | null; eixo: string | null; formaOferta: string | null;
  series: { serieAno: string; itens: ItemModelo[] }[];
};

function modelos(): CursoModelo[] {
  const lista: CursoModelo[] = [];
  for (const g of (MATRIZES_OFICIAIS_SEED_PR as any[])) {
    lista.push({ nome: g.label, nivel: g.nivel, codigoCurso: null, eixo: null, formaOferta: null, series: g.series });
  }
  for (const t of (MATRIZES_TECNICAS_SEED_PR_2026 as any[])) {
    lista.push({
      nome: nomeCursoTecnico(t.curso, t.formaOferta), nivel: "tecnico", codigoCurso: t.codigo ?? null,
      eixo: eixoParaEnum(t.eixo), formaOferta: t.formaOferta ?? null, series: t.series,
    });
  }
  return lista;
}

export type ResultadoSemeadura = {
  cursosCriados: number; cursosReaproveitados: number; matrizesCriadas: number;
  matrizesExistentes: number; itensCriados: number; disciplinasCriadas: number;
};

export async function semearCatalogoEscola(escolaId: string): Promise<ResultadoSemeadura> {
  const r: ResultadoSemeadura = { cursosCriados: 0, cursosReaproveitados: 0, matrizesCriadas: 0, matrizesExistentes: 0, itensCriados: 0, disciplinasCriadas: 0 };

  const cursosExistentes = await db.select().from(cursosTable).where(eq(cursosTable.escolaId, escolaId));
  const cursoPorChave = new Map<string, number>();
  for (const c of cursosExistentes) cursoPorChave.set(`${chaveNome(c.nome)}|${(c as any).formaOferta ?? ""}`, c.id);

  const discExistentes = await db.select().from(disciplinasTable).where(eq(disciplinasTable.escolaId, escolaId));
  const discPorNome = new Map<string, number>();
  for (const d of discExistentes) discPorNome.set(chaveNome(padronizarNomeDisciplina(d.nome)), d.id); // [PADRAO-NOME-DISCIPLINA]

  for (const m of modelos()) {
    await db.transaction(async (tx) => {
      const chave = `${chaveNome(m.nome)}|${m.formaOferta ?? ""}`;
      let cursoId = cursoPorChave.get(chave);
      if (cursoId) {
        r.cursosReaproveitados++;
      } else {
        const [novo] = await tx.insert(cursosTable).values({
          escolaId, nome: m.nome, nivel: m.nivel, codigoCurso: m.codigoCurso,
          eixoTecnologico: m.eixo as any, formaOferta: m.formaOferta as any, ofertado: false,
        } as any).returning();
        cursoId = novo.id;
        cursoPorChave.set(chave, cursoId);
        r.cursosCriados++;
      }

      const matrizesDoCurso = await tx.select().from(matrizesCurricularesTable)
        .where(and(eq(matrizesCurricularesTable.cursoId, cursoId), eq(matrizesCurricularesTable.escolaId, escolaId)));
      const seriesExistentes = new Set(matrizesDoCurso.map((x) => chaveNome(x.serieAno)));

      for (const s of m.series ?? []) {
        if (seriesExistentes.has(chaveNome(s.serieAno))) { r.matrizesExistentes++; continue; }
        const itens = s.itens ?? [];
        const total = itens.reduce((acc, it) => acc + (Number(it.cargaHorariaSemanal) || 0), 0);
        const [matriz] = await tx.insert(matrizesCurricularesTable).values({
          escolaId, cursoId, serieAno: s.serieAno, cargaHorariaSemanalTotal: total,
        }).returning();
        r.matrizesCriadas++;

        const linhas: any[] = [];
        for (const it of itens) {
          const k = chaveNome(padronizarNomeDisciplina(it.nome)); // [PADRAO-NOME-DISCIPLINA]
          let discId = discPorNome.get(k);
          if (!discId) {
            const [nova] = await tx.insert(disciplinasTable).values({
              escolaId, nome: padronizarNomeDisciplina(it.nome), cargaSemanal: Number(it.cargaHorariaSemanal) || 2,
              categoriaCurricularPadrao: it.categoria as any,
            } as any).returning();
            discId = nova.id;
            discPorNome.set(k, discId);
            r.disciplinasCriadas++;
          }
          linhas.push({
            matrizCurricularId: matriz.id, disciplinaId: discId,
            categoriaCurricular: it.categoria as any, cargaHorariaSemanal: Number(it.cargaHorariaSemanal) || 0,
            obrigatoria: it.obrigatoria ?? true,
          });
        }
        if (linhas.length > 0) {
          await tx.insert(itensMatrizTable).values(linhas);
          r.itensCriados += linhas.length;
        }
      }
    });
  }
  return r;
}
