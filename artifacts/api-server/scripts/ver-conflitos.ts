/**
 * Mostra os conflitos da grade de uma escola, os mesmos da tela Conflitos (28/10/2026). So le.
 * Uso (na raiz do repositorio):
 *   pnpm --filter @workspace/api-server exec tsx scripts/ver-conflitos.ts esc_xxx
 * Resumo por tipo na tela; lista completa em lib/db/_arquivo/conflitos-<escola>.txt
 */
import fs from "node:fs";
import path from "node:path";

const ESCOLA_ID = process.argv[2];
const RAIZ = path.resolve(process.cwd(), "..", "..");

function carregarDatabaseUrl() {
  if (process.env.DATABASE_URL) return;
  const p = path.join(RAIZ, "lib", "db", ".env");
  if (!fs.existsSync(p)) throw new Error("DATABASE_URL nao encontrada (nem em lib/db/.env)");
  const linha = fs.readFileSync(p, "utf8").split(/\r?\n/).find((l) => l.trim().startsWith("DATABASE_URL="))!;
  process.env.DATABASE_URL = linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

async function main() {
  if (!ESCOLA_ID) { console.log("Uso: ... ver-conflitos.ts esc_xxx"); return; }
  carregarDatabaseUrl();
  const { pool, db, escolasTable } = await import("@workspace/db");
  const { eq } = await import("drizzle-orm");
  const { detectarConflitos } = await import("../src/routes/conflitos");
  try {
    const [escola] = await db.select().from(escolasTable).where(eq(escolasTable.id, ESCOLA_ID));
    if (!escola) { console.log("Escola nao encontrada"); return; }
    const todos = await detectarConflitos(ESCOLA_ID);
    const abertos = todos; // detectarConflitos ja tira os aceitos pela escola
    const porTipo = new Map<string, typeof abertos>();
    for (const c of abertos) porTipo.set(c.tipo, [...(porTipo.get(c.tipo) ?? []), c]);
    const ordem = { critico: 0, alto: 1, medio: 2, baixo: 3 } as Record<string, number>;
    const tipos = [...porTipo.entries()].sort((a, b) => (ordem[a[1][0].gravidade] - ordem[b[1][0].gravidade]) || b[1].length - a[1].length);

    const linhas: string[] = [`Escola: ${escola.nomeFantasia} · ${abertos.length} conflito(s) em aberto (os aceitos pela escola nao entram)`, ""];
    for (const [tipo, lista] of tipos) {
      linhas.push(`== ${tipo} (${lista[0].gravidade}) · ${lista.length}`);
      for (const c of lista) linhas.push(`  - ${c.descricao}`);
      linhas.push("");
    }
    const pasta = path.join(RAIZ, "lib", "db", "_arquivo"); fs.mkdirSync(pasta, { recursive: true });
    const arq = path.join(pasta, `conflitos-${ESCOLA_ID}.txt`);
    fs.writeFileSync(arq, linhas.join("\r\n"), "utf8");

    console.log(linhas[0] + "\n");
    for (const [tipo, lista] of tipos) {
      console.log(`${tipo} (${lista[0].gravidade}): ${lista.length}`);
      for (const c of lista.slice(0, 3)) console.log(`   ex.: ${c.descricao}`);
    }
    console.log(`\nLista completa: ${arq}`);
  } finally {
    await pool.end();
  }
}
main().catch((e) => { console.error("ERRO:", e?.message ?? e); process.exit(1); });
