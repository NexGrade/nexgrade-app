/**
 * [MB-BACK-END-II] (01/11/2026) Nomes das disciplinas de Back-End pelo codigo do RCO, decisao da dona:
 *   6096 -> "Programacao Back-End I"   e   3971 -> "Programacao Back-End II"
 * Onde: no catalogo geral (disciplinas_catalogo, vale para escola nova) e nas disciplinas do Mario Braga e da
 * Escola Demonstracao (copia dele). Em 28/10 a #1696 do Mario Braga (3MB DES) ja se chamava "Back-End II";
 * depois perdeu o "II".
 * Muda SO o nome (sigla, codigos, aulas, vinculos e professores nao mudam). Nao renomeia se ja houver outra
 * disciplina com o nome novo no mesmo lugar (seria preciso juntar as duas): para e mostra o caso.
 * Rodar ANTES do --aplicar de ligar-matrizes-2026-mario-braga.ts (a matriz nova traz a "Back-End II" pelo
 * nome; com o nome certo antes, o catalogo reaproveita a disciplina da escola em vez de criar outra).
 * Uso (na raiz do repositorio):
 *   pnpm --filter @workspace/api-server exec tsx scripts/renomear-back-end-ii-mario-braga.ts            (dry-run)
 *   pnpm --filter @workspace/api-server exec tsx scripts/renomear-back-end-ii-mario-braga.ts --aplicar  (backup + grava)
 * Relatorio em lib/db/_arquivo/renomear-back-end-ii-mario-braga.txt
 */
import fs from "node:fs";
import path from "node:path";
import type { PoolClient } from "pg";

const APLICAR = process.argv.includes("--aplicar");
const ESCOLAS = [
  { id: "org_3HCMsuYeAwkggR1dxXNzEdzNaX8", rotulo: "Mario Braga" },
  { id: "esc_1ce4d2d30c4146a99fb7ffa5", rotulo: "Escola Demonstracao" },
];
const NOME_POR_CODIGO: Record<number, string> = {
  6096: "Programação Back-End I",
  3971: "Programação Back-End II",
};
const RAIZ = path.resolve(process.cwd(), "..", "..");

const linhas: string[] = [];
const log = (s = "") => { linhas.push(s); console.log(s); };
const chave = (s: string) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[\s-]+/g, " ").trim();

function carregarDatabaseUrl() {
  if (process.env.DATABASE_URL) return;
  const linha = fs.readFileSync(path.join(RAIZ, "lib", "db", ".env"), "utf8").split(/\r?\n/).find((l) => l.trim().startsWith("DATABASE_URL="))!;
  process.env.DATABASE_URL = linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

type Disc = { id: number; nome: string; sigla: string | null; codigo_externo_rco: number | null };
type Troca = { tabela: "disciplinas_catalogo" | "disciplinas"; escola: string | null; id: number; de: string; para: string };

/** Decide as trocas de nome num conjunto de disciplinas (catalogo ou uma escola) e mostra cada uma. */
function planejar(discs: Disc[], tabela: Troca["tabela"], escola: string | null, usos: Map<number, string>): Troca[] {
  const trocas: Troca[] = [];
  for (const d of discs.filter((x) => /back ?end/.test(chave(x.nome)) || x.codigo_externo_rco! in NOME_POR_CODIGO)) {
    const para = d.codigo_externo_rco != null ? NOME_POR_CODIGO[d.codigo_externo_rco] : undefined;
    const onde = `#${d.id} "${d.nome}" | sigla ${d.sigla ?? "-"} | codigo RCO ${d.codigo_externo_rco ?? "(sem)"}${usos.has(d.id) ? ` | usada por: ${usos.get(d.id)}` : ""}`;
    if (!para) { log(`  ${onde}\n    [SEM TROCA] codigo fora de 6096/3971: conferir a mao`); continue; }
    if (d.nome === para) { log(`  ${onde}\n    [OK] ja esta com o nome certo`); continue; }
    const outra = discs.find((x) => x.id !== d.id && chave(x.nome) === chave(para));
    if (outra) { log(`  ${onde}\n    [PULOU] ja existe #${outra.id} "${outra.nome}": seria preciso juntar as duas, conferir a mao`); continue; }
    log(`  ${onde}\n    -> "${para}"`);
    trocas.push({ tabela, escola, id: d.id, de: d.nome, para });
  }
  return trocas;
}

async function main() {
  carregarDatabaseUrl();
  const { pool } = await import("@workspace/db");
  const c: PoolClient = await pool.connect();
  const q = async <T = any>(sql: string, p: unknown[] = []) => (await c.query(sql, p)).rows as T[];
  try {
    log(APLICAR ? "MODO: APLICAR\n" : "MODO: DRY-RUN (so leitura; nada e gravado)\n");
    const trocas: Troca[] = [];

    log("==================== Catalogo geral (disciplinas_catalogo)");
    const catalogo = await q<Disc>("select id, nome, sigla, codigo_externo_rco from disciplinas_catalogo order by id");
    trocas.push(...planejar(catalogo, "disciplinas_catalogo", null, new Map()));
    log("");

    for (const e of ESCOLAS) {
      log(`==================== ${e.rotulo} (${e.id})`);
      const discs = await q<Disc>("select id, nome, sigla, codigo_externo_rco from disciplinas where escola_id=$1 order by id", [e.id]);
      const usos = new Map((await q<{ id: number; turmas: string }>(`
        select x.disciplina_id id, string_agg(x.turma || ' (' || x.aulas || ' aula(s))', ', ' order by x.turma) turmas from (
          select td.disciplina_id, tu.nome turma, (select count(*)::int from horarios h where h.turma_id=tu.id and h.disciplina_id=td.disciplina_id) aulas
          from turma_disciplinas td join turmas tu on tu.id=td.turma_id where tu.escola_id=$1) x group by 1`, [e.id])).map((u) => [u.id, u.turmas]));
      trocas.push(...planejar(discs, "disciplinas", e.id, usos));
      log("");
    }

    log(`Nomes a trocar: ${trocas.length}. Siglas, codigos, aulas, vinculos e professores NAO mudam.`);
    if (!APLICAR) { log("\nDRY-RUN: NADA FOI GRAVADO. Rode com --aplicar."); return; }
    if (!trocas.length) { log("Nada a gravar."); return; }

    const arqBk = path.join(RAIZ, "lib", "db", "_arquivo", `backup-back-end-nomes-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.mkdirSync(path.dirname(arqBk), { recursive: true });
    fs.writeFileSync(arqBk, JSON.stringify(trocas, null, 1));
    log(`\nBackup (nome de antes de cada uma): ${arqBk}`);
    await c.query("BEGIN");
    try {
      for (const t of trocas) {
        if (t.tabela === "disciplinas_catalogo") await c.query("update disciplinas_catalogo set nome=$1 where id=$2", [t.para, t.id]);
        else await c.query("update disciplinas set nome=$1 where id=$2 and escola_id=$3", [t.para, t.id, t.escola]);
        log(`  ${t.tabela} #${t.id}${t.escola ? ` (${t.escola})` : ""}: "${t.de}" -> "${t.para}"`);
      }
      await c.query("COMMIT");
      log("GRAVADO.");
    } catch (err) { await c.query("ROLLBACK"); throw err; }
  } finally {
    c.release();
    await pool.end();
    const arq = path.join(RAIZ, "lib", "db", "_arquivo", "renomear-back-end-ii-mario-braga.txt");
    fs.mkdirSync(path.dirname(arq), { recursive: true });
    fs.writeFileSync(arq, linhas.join("\r\n"), "utf8");
    console.log(`\nRelatorio: ${arq}`);
  }
}

main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
