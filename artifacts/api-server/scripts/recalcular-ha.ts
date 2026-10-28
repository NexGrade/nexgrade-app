/**
 * Calcula e grava a Hora-Atividade (HA) de uma escola pela regra do NexGrade (28/10/2026).
 * E o mesmo calculo que o sistema faz sozinho ao promover uma grade (recalcularHoraAtividade).
 * Uso (na raiz do repositorio):
 *   pnpm --filter @workspace/api-server exec tsx scripts/recalcular-ha.ts esc_xxx            (ensaio: so mostra)
 *   pnpm --filter @workspace/api-server exec tsx scripts/recalcular-ha.ts esc_xxx --aplicar  (grava)
 * Antes de gravar, salva a HA atual da escola em lib/db/_arquivo (para desfazer).
 */
import fs from "node:fs";
import path from "node:path";

const ARGS = process.argv.slice(2);
const APLICAR = ARGS.includes("--aplicar");
const ESCOLA_ID = ARGS.find((a) => !a.startsWith("--"));
const RAIZ = path.resolve(process.cwd(), "..", "..");
const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
const TURNO_C: Record<string, string> = { matutino: "M", vespertino: "T", noturno: "N", integral: "I" };

function carregarDatabaseUrl() {
  if (process.env.DATABASE_URL) return;
  const p = path.join(RAIZ, "lib", "db", ".env");
  if (!fs.existsSync(p)) throw new Error("DATABASE_URL nao encontrada (nem em lib/db/.env)");
  const linha = fs.readFileSync(p, "utf8").split(/\r?\n/).find((l) => l.trim().startsWith("DATABASE_URL="))!;
  process.env.DATABASE_URL = linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

async function main() {
  if (!ESCOLA_ID) { console.log("Uso: ... recalcular-ha.ts esc_xxx [--aplicar]"); return; }
  carregarDatabaseUrl();
  const { pool, db, escolasTable, professoresTable, horariosTable, turmasTable, disponibilidadeTable } = await import("@workspace/db");
  const { eq, inArray } = await import("drizzle-orm");
  const { calcularHAIdeal, recalcularHoraAtividade, calcularHoraAtividadeTotalPorTurno } = await import("../src/lib/recalcular-ha");
  try {
    const [escola] = await db.select().from(escolasTable).where(eq(escolasTable.id, ESCOLA_ID));
    if (!escola) { console.log("Escola nao encontrada"); return; }
    console.log(`Escola: ${escola.nomeFantasia}`);
    const profs = await db.select().from(professoresTable).where(eq(professoresTable.escolaId, ESCOLA_ID));
    const turmas = await db.select().from(turmasTable).where(eq(turmasTable.escolaId, ESCOLA_ID));
    const turnoDa = new Map(turmas.map((t) => [t.id, t.turno]));
    const aulas = await db.select().from(horariosTable).where(eq(horariosTable.escolaId, ESCOLA_ID));
    const ids = profs.map((p) => p.id);
    const dispAtual = ids.length ? await db.select().from(disponibilidadeTable).where(inArray(disponibilidadeTable.professorId, ids)) : [];
    const haAtual = dispAtual.filter((d: any) => d.horaAtividadeObrigatoria);

    // exigido por professor (tabela oficial por turno)
    const porTurno = new Map<number, Record<string, number>>();
    for (const a of aulas as any[]) {
      if (!a.professorId || a.assincrona) continue;
      const t = turnoDa.get(a.turmaId); if (!t) continue;
      const m = porTurno.get(a.professorId) ?? {}; m[t] = (m[t] ?? 0) + 1; porTurno.set(a.professorId, m);
    }
    const marcas = await calcularHAIdeal(ESCOLA_ID);
    const marcasPor = new Map<number, typeof marcas>();
    for (const m of marcas) marcasPor.set(m.professorId, [...(marcasPor.get(m.professorId) ?? []), m]);

    let completos = 0, comFalta = 0, noite = 0;
    const linhas: string[] = [];
    for (const p of [...profs].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))) {
      const pt = porTurno.get(p.id); if (!pt) continue;
      const exigido = calcularHoraAtividadeTotalPorTurno(pt);
      const ms = marcasPor.get(p.id) ?? [];
      noite += ms.filter((m) => m.turno === "noturno").length;
      if (ms.length >= exigido) completos++; else comFalta++;
      const onde = ms.map((m) => `${DIAS[m.diaSemana]}${m.horarioSlot}${TURNO_C[m.turno] ?? m.turno}${m.outroTurno ? "*" : ""}`).join(" ");
      const aulasTxt = Object.entries(pt).map(([t, n]) => `${TURNO_C[t] ?? t}${n}`).join("+");
      linhas.push(`${ms.length < exigido ? "FALTA " : "      "}${p.nome.padEnd(22).slice(0, 22)} aulas ${aulasTxt.padEnd(9)} HA ${ms.length}/${exigido}  ${onde}`);
    }
    console.log(`HA ja gravada hoje: ${haAtual.length} · HA calculada: ${marcas.length} · professores completos: ${completos} · com falta: ${comFalta} · HA na noite: ${noite}\n`);
    for (const l of linhas) console.log(l);
    console.log("\n(* = HA de aulas de outro turno)");

    if (!APLICAR) { console.log("\nENSAIO: nada foi gravado. Para gravar, rode de novo com --aplicar."); return; }
    const pasta = path.join(RAIZ, "lib", "db", "_arquivo"); fs.mkdirSync(pasta, { recursive: true });
    const arq = path.join(pasta, `backup-ha-${ESCOLA_ID}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(arq, JSON.stringify(haAtual, null, 1));
    const r = await recalcularHoraAtividade(ESCOLA_ID);
    console.log(`\nGRAVADO: ${r.inseridas} HA inseridas, ${r.removidas} removidas, ${r.professoresAfetados} professor(es). Backup da HA anterior: ${arq}`);
  } finally {
    await pool.end();
  }
}
main().catch((e) => { console.error("ERRO:", e?.message ?? e); process.exit(1); });
