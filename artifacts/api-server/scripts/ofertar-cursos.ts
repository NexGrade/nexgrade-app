/**
 * [CATALOGO-SOB-DEMANDA] (28/10/2026) Marca cursos do catalogo SEED-PR como ofertados numa escola,
 * pelo terminal. Faz o mesmo que marcar a caixa na aba Catalogo SEED-PR: traz o curso (ofertado),
 * as matrizes das series e so as disciplinas dele (as que ja existem com o mesmo nome sao reaproveitadas).
 *
 * Uso (na raiz do repositorio):
 *   pnpm --filter @workspace/api-server exec tsx scripts/ofertar-cursos.ts esc_xxx "Nome do curso" "Outro curso"
 *   ... --aplicar          (sem --aplicar: so mostra o que entraria)
 * Le DATABASE_URL do ambiente ou de lib/db/.env.
 */
import fs from "node:fs";
import path from "node:path";

const ARGS = process.argv.slice(2);
const APLICAR = ARGS.includes("--aplicar");
const [ESCOLA_ID, ...NOMES] = ARGS.filter((a) => !a.startsWith("--"));

function carregarDatabaseUrl() {
  if (process.env.DATABASE_URL) return;
  const p = [path.join(process.cwd(), "..", "..", "lib", "db", ".env"), path.join(process.cwd(), "lib", "db", ".env")].find((f) => fs.existsSync(f));
  if (!p) throw new Error("DATABASE_URL nao encontrada (nem em lib/db/.env)");
  const linha = fs.readFileSync(p, "utf8").split(/\r?\n/).find((l) => l.trim().startsWith("DATABASE_URL="))!;
  process.env.DATABASE_URL = linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}
const chave = (s: string) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

async function main() {
  if (!ESCOLA_ID || NOMES.length === 0) { console.log('Uso: ... ofertar-cursos.ts esc_xxx "Nome do curso" [...] [--aplicar]'); return; }
  carregarDatabaseUrl();
  const { db, pool, escolasTable, cursosTable, disciplinasTable, matrizesCurricularesTable } = await import("@workspace/db");
  const { eq } = await import("drizzle-orm");
  const { listarModelosCatalogo, semearCatalogoEscola, chaveCurso } = await import("../src/lib/semear-catalogo");
  const { padronizarNomeDisciplina } = await import("../src/lib/padronizar-nome-disciplina");
  const { MATRIZES_OFICIAIS_SEED_PR } = await import("../src/lib/matrizes-oficiais-seed-pr");
  const { MATRIZES_TECNICAS_SEED_PR_2026 } = await import("../src/lib/matrizes-tecnicas-seed-pr");
  try {
    const [escola] = await db.select().from(escolasTable).where(eq(escolasTable.id, ESCOLA_ID));
    if (!escola) { console.log("Escola nao encontrada:", ESCOLA_ID); return; }
    console.log(`Escola: ${escola.nomeFantasia}`);

    const modelos = listarModelosCatalogo();
    const escolhidos = [];
    for (const n of NOMES) {
      const m = modelos.find((x) => chave(x.nome) === chave(n));
      if (!m) { console.log(`ERRO: curso nao encontrado no catalogo: "${n}". Nada foi gravado.`); return; }
      escolhidos.push(m);
    }

    const cursos = await db.select().from(cursosTable).where(eq(cursosTable.escolaId, ESCOLA_ID));
    const matrizes = await db.select().from(matrizesCurricularesTable).where(eq(matrizesCurricularesTable.escolaId, ESCOLA_ID));
    const discs = await db.select().from(disciplinasTable).where(eq(disciplinasTable.escolaId, ESCOLA_ID));
    const existentes = new Set(discs.map((d) => chave(padronizarNomeDisciplina(d.nome))));
    const novasTotal = new Set<string>();

    for (const m of escolhidos) {
      const c = cursos.find((x) => chaveCurso(x.nome, (x as any).formaOferta) === m.chave);
      const seriesExist = new Set(matrizes.filter((x) => c && x.cursoId === c.id).map((x) => chave(x.serieAno)));
      const fonte: any = m.nivel === "tecnico"
        ? (MATRIZES_TECNICAS_SEED_PR_2026 as any[]).find((t) => (t.codigo ?? null) === m.codigoCurso && (t.formaOferta ?? null) === m.formaOferta)
        : (MATRIZES_OFICIAIS_SEED_PR as any[]).find((g) => g.label === m.nome);
      const novasCurso: string[] = [];
      const seriesNovas: string[] = [];
      for (const s of fonte?.series ?? []) {
        if (seriesExist.has(chave(s.serieAno))) continue;
        seriesNovas.push(s.serieAno);
        for (const it of s.itens ?? []) {
          const nome = padronizarNomeDisciplina(it.nome);
          const k = chave(nome);
          if (!existentes.has(k) && !novasTotal.has(k)) { novasTotal.add(k); novasCurso.push(nome); }
        }
      }
      console.log(`\n${m.nome}`);
      console.log(`  curso: ${c ? ((c as any).ofertado ? "ja existe e esta ofertado" : "ja existe, sera religado") : "novo (ofertado)"}`);
      console.log(`  matrizes novas: ${seriesNovas.length ? seriesNovas.join(", ") : "nenhuma"}`);
      console.log(`  disciplinas novas (${novasCurso.length}): ${novasCurso.join("; ") || "-"}`);
    }
    console.log(`\nTotal de disciplinas novas: ${novasTotal.size} (as demais ja existem e sao reaproveitadas).`);

    if (!APLICAR) { console.log("\nENSAIO: nada foi gravado. Para gravar, rode de novo com --aplicar."); return; }
    const r = await semearCatalogoEscola(ESCOLA_ID, { chaves: escolhidos.map((m) => m.chave), ofertar: true });
    console.log(`\nGRAVADO: ${r.cursosCriados} curso(s) novo(s), ${r.cursosReaproveitados} reaproveitado(s), ${r.matrizesCriadas} matriz(es), ${r.itensCriados} item(ns) de matriz, ${r.disciplinasCriadas} disciplina(s) nova(s).`);
  } finally {
    await pool.end();
  }
}
main().catch((e) => { console.error("ERRO:", e?.message ?? e); process.exit(1); });
