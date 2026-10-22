// Diagnóstico das regras da rede (REGRAS-REDE): mostra, por escola, o que estava GRAVADO em
// `configuracoes` e o limite de aulas seguidas por turma+disciplina, para ver se travar a regra
// em 3 apertou algo (ex.: escola com 4 gravado, que agora é forçada a 3).
//
// Só LÊ o banco -- não grava nada (por isso não tem --aplicar).
//
// Como rodar:
//   pnpm --filter @workspace/scripts exec tsx src/diagnostico-regras-rede.ts
import { db, configuracoesTable, escolasTable, turmasTable, turmaDisciplinasTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

const CHAVES = [
  "seed_pr.max_aulas_geminadas_padrao",
  "seed_pr.max_aulas_complementar_padrao",
  "seed_pr.teto_aulas_turno",
  "seed_pr.hora_atividade_mesmo_turno_ate",
];

async function main() {
  const escolas = await db.select().from(escolasTable);
  for (const e of escolas) {
    console.log(`\n=== ${e.nomeFantasia} (${e.id}) ===`);
    const cfgs = await db.select().from(configuracoesTable).where(eq(configuracoesTable.escolaId, e.id));
    for (const k of CHAVES) {
      const c = cfgs.find((x) => x.chave === k);
      console.log(`  ${k}: ${c ? JSON.stringify(c.valor) : "(não gravado)"}`);
    }
    const turmas = await db.select({ id: turmasTable.id }).from(turmasTable).where(eq(turmasTable.escolaId, e.id));
    if (turmas.length === 0) { console.log("  (sem turmas)"); continue; }
    const tds = await db
      .select({ max: turmaDisciplinasTable.maxAulasConsecutivasDia })
      .from(turmaDisciplinasTable)
      .where(inArray(turmaDisciplinasTable.turmaId, turmas.map((t) => t.id)));
    const porValor = new Map<string, number>();
    for (const t of tds) porValor.set(String(t.max ?? "sem limite próprio"), (porValor.get(String(t.max ?? "sem limite próprio")) ?? 0) + 1);
    console.log(`  turma+disciplina por limite de aulas seguidas (${tds.length} no total):`);
    for (const [v, n] of [...porValor.entries()].sort()) console.log(`    ${v}: ${n}`);
  }
  process.exit(0);
}
main().catch((err) => { console.error(err); process.exit(1); });
