// [LIMPEZA] Tira o nome do sistema de horarios antigo dos textos gravados em disponibilidade.motivo
// ("Importado do <X> (H.A.)", "Sincronizado do PDF oficial <X> (ocupado: PAEE)" ...). So troca o NOME no
// texto; o padrao "(ocupado: ...)" e o "Importado do ... (H.A.)" que o sistema le continuam iguais.
//
// DRY-RUN por padrao: lista quantas linhas mudariam e mostra exemplos, sem gravar nada.
//
// Como rodar (PowerShell, na pasta do projeto):
//   $env:DATABASE_URL = "..."
//   npx tsx scripts/neutralizar-motivos-importados.ts            # dry-run
//   npx tsx scripts/neutralizar-motivos-importados.ts --aplicar  # grava

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const aplicar = process.argv.includes("--aplicar");
const PADRAO = "\\mUr.nia\\M"; // o nome antigo (Postgres: palavra inteira)
const NOME_FIXO = "sistema anterior";

async function main() {
  console.log(`Modo: ${aplicar ? "APLICAR" : "DRY-RUN (nada sera gravado)"}\n`);
  const grupos = await db.execute(sql`
    select motivo, count(*)::int as n,
           replace(regexp_replace(motivo, ${PADRAO}, ${NOME_FIXO}, 'gi'), 'PDF oficial ' || ${NOME_FIXO}, 'PDF oficial') as depois
    from disponibilidade_professores
    where motivo ~* ${PADRAO}
    group by motivo order by n desc`);
  const total = (grupos.rows as Array<{ n: number }>).reduce((s, r) => s + r.n, 0);
  console.log(`Linhas com o nome no motivo: ${total} (${grupos.rows.length} texto(s) diferente(s))`);
  for (const r of (grupos.rows as Array<{ motivo: string; n: number; depois: string }>).slice(0, 15)) {
    console.log(`  ${r.n}x  "${r.motivo}"\n       -> "${r.depois}"`);
  }
  if (!aplicar) {
    console.log("\nDry-run concluido. Para gravar, rode de novo com --aplicar.");
    process.exit(0);
  }
  if (total === 0) { console.log("\nNada a fazer."); process.exit(0); }
  const r = await db.execute(sql`
    update disponibilidade_professores set motivo = replace(regexp_replace(motivo, ${PADRAO}, ${NOME_FIXO}, 'gi'), 'PDF oficial ' || ${NOME_FIXO}, 'PDF oficial')
    where motivo ~* ${PADRAO} returning id`);
  console.log(`\nFeito: ${r.rows.length} linha(s) atualizada(s).`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
