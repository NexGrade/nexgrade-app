/**
 * [AJUSTAR-HA-PELA-REGRA] (04/11/2026) Completa a HA da grade OFICIAL de uma escola pelas regras de 04/11, sem mexer em
 * aula nem na HA que ja existe ([HA-SO-COMPLETAR], decisao da dona: "nao precisa mudar, so completar se faltar"):
 *  - quem tem MENOS HA do que a regra num turno ganha so as que faltam, nos horarios livres que deixam menos janela
 *    (tabela por turno, integral no turno real, PAEE fora, FOR conta como HA);
 *  - a HA de hoje fica onde esta; HA a mais do que a regra tambem fica.
 * Uso (na raiz do repositorio):
 *   pnpm --filter @workspace/api-server exec tsx --env-file=C:\projetos\nexgrade-app\lib\db\.env scripts/ajustar-ha-pela-regra.ts
 *       (sem escola: lista as escolas com o id)
 *   ... scripts/ajustar-ha-pela-regra.ts --escola=ID             (dry-run: so mostra)
 *   ... scripts/ajustar-ha-pela-regra.ts --escola=ID --aplicar   (backup em lib/db/_arquivo + grava)
 */
import fs from "node:fs";
import path from "node:path";

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const APLICAR = process.argv.includes("--aplicar");
const ESCOLA = arg("escola");
const RAIZ = path.resolve(process.cwd(), "..", "..");
const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex"];
const TURNOS = ["matutino", "vespertino", "noturno"];
const T = (t: string) => ({ matutino: "manhã", vespertino: "tarde", noturno: "noite" } as Record<string, string>)[t] ?? t;

async function main() {
  const { pool, db, escolasTable, professoresTable, disponibilidadeTable } = await import("@workspace/db");
  const { eq, and, inArray } = await import("drizzle-orm");
  if (!ESCOLA) {
    const escolas = await db.select({ id: escolasTable.id, nome: escolasTable.nomeFantasia }).from(escolasTable);
    console.log("Escolas (use --escola=ID):");
    for (const e of escolas.sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"))) console.log(`  ${e.id}  ${e.nome}`);
    await pool.end(); return;
  }
  const { calcularHAIdeal } = await import("../src/lib/recalcular-ha");
  const { professoresComHAIncompleta, completarHA } = await import("../src/lib/ha-incompleta");
  const { fotografarGradeEHA, recalcularHASoDeQuemMudou } = await import("../src/lib/ha-so-quem-mudou");
  const { mapaIntegralDosSlots, posicaoReal } = await import("../src/lib/turno-integral");
  const { ehFORContaComoHA } = await import("../src/lib/ha-contraturno");

  const [escola] = await db.select().from(escolasTable).where(eq(escolasTable.id, ESCOLA));
  if (!escola) { console.log("Escola nao encontrada"); await pool.end(); return; }
  console.log(`Escola: ${escola.nomeFantasia}  |  modo: ${APLICAR ? "APLICAR (grava)" : "DRY-RUN (nada e gravado)"}\n`);

  const profs = await db.select().from(professoresTable).where(eq(professoresTable.escolaId, ESCOLA));
  const nome = new Map(profs.map((p) => [p.id, p.nome]));
  const foto = await fotografarGradeEHA(ESCOLA);
  const ideal = await calcularHAIdeal(ESCOLA);
  const refazer = professoresComHAIncompleta(ideal, foto.ha, TURNOS);
  const novas = await completarHA(ESCOLA, refazer, foto.ha);

  // janelas por turno (aula + HA ocupam; FOR/COORD... entre elas nao e janela)
  const q = async (s: string, p: unknown[] = []) => (await pool.query(s, p)).rows as any[];
  const turmas = await q("select id, turno from turmas where escola_id=$1", [ESCOLA]);
  const slots = (await q("select * from horario_slots where escola_id=$1", [ESCOLA])).map((x: any) => ({ ...x, numeroAula: x.numero_aula, horaInicio: x.hora_inicio, duracaoMinutos: x.duracao_minutos, nivelEnsino: x.nivel_ensino }));
  const mapa = mapaIntegralDosSlots(slots);
  const tdt = new Map(turmas.map((t: any) => [t.id, t.turno]));
  const todaDisp = profs.length ? await db.select().from(disponibilidadeTable).where(inArray(disponibilidadeTable.professorId, profs.map((p) => p.id))) : [];
  const atividade = new Set(todaDisp.filter((d) => !d.disponivel && !d.horaAtividadeObrigatoria && /\(ocupado:/.test(d.motivo ?? "")).map((d) => `${d.professorId}|${d.turno}|${d.diaSemana}|${d.horarioSlot}`));
  const janelas = (ha: Array<{ professorId: number; turno: string | null; diaSemana: number; horarioSlot: number }>) => {
    const occ = new Map<string, Set<number>>();
    const add = (k: string, a: number) => { if (!occ.has(k)) occ.set(k, new Set()); occ.get(k)!.add(a); };
    for (const h of foto.oficial) { if (h.professorId == null) continue; const r = posicaoReal(h.turmaId, h.numeroAula, tdt as any, mapa); if (r && TURNOS.includes(r.turno)) add(`${h.professorId}|${r.turno}|${h.diaSemana}`, r.numeroAula); }
    for (const m of ha) if (m.turno && TURNOS.includes(m.turno)) add(`${m.professorId}|${m.turno}|${m.diaSemana}`, m.horarioSlot);
    const r: Record<string, number> = {};
    for (const [k, s] of occ) {
      if (s.size < 2) continue;
      const [p, t, d] = k.split("|"); const xs = [...s].sort((a, b) => a - b);
      for (let a = xs[0]! + 1; a < xs[xs.length - 1]!; a++) if (!s.has(a) && !atividade.has(`${p}|${t}|${d}|${a}`)) r[t!] = (r[t!] ?? 0) + 1;
    }
    return r;
  };
  const haDepois = [...foto.ha, ...novas];

  const cont = (rows: Array<{ professorId: number; turno: string | null }>, p: number, t: string) => rows.filter((r) => r.professorId === p && r.turno === t).length;
  const pos = (rows: Array<{ professorId: number; turno: string | null; diaSemana: number; horarioSlot: number }>, p: number, t: string) =>
    rows.filter((r) => r.professorId === p && r.turno === t).sort((a, b) => a.diaSemana - b.diaSemana || a.horarioSlot - b.horarioSlot).map((r) => `${DIAS[r.diaSemana]} ${r.horarioSlot}ª`).join(", ") || "-";
  console.log(`Professores com HA abaixo da regra: ${refazer.size} de ${profs.length} (a HA de hoje fica; so se acrescenta a que falta)\n`);
  for (const p of [...refazer].sort((a, b) => String(nome.get(a)).localeCompare(String(nome.get(b)), "pt-BR"))) {
    for (const t of TURNOS) {
      const a = cont(foto.ha, p, t), b = cont(ideal, p, t);
      if (a >= b) continue;
      const nFor = todaDisp.filter((d) => d.professorId === p && d.turno === t && ehFORContaComoHA(d)).length;
      console.log(`  ${nome.get(p)} (${T(t)}): ${a} -> ${b} HA${nFor ? `  [${nFor} FOR conta como HA]` : ""}`);
      console.log(`      hoje:  ${pos(foto.ha, p, t)}`);
      const acr = pos(novas, p, t);
      console.log(`      acrescenta: ${acr === "-" ? "nada (a HA a mais em outro turno ja cobre o total)" : acr}`);
    }
  }
  console.log(`\nJanelas de professor (aula + HA; o "HA no buraco" pode fechar mais ao aplicar):`);
  const ja = janelas(foto.ha), jd = janelas(haDepois);
  for (const t of TURNOS) if (ja[t] || jd[t]) console.log(`  ${T(t)}: ${ja[t] ?? 0} -> ${jd[t] ?? 0}`);

  if (!APLICAR) { console.log("\nDRY-RUN: nada foi gravado. Para gravar, rode de novo com --aplicar."); await pool.end(); return; }
  const pasta = path.join(RAIZ, "lib", "db", "_arquivo"); fs.mkdirSync(pasta, { recursive: true });
  const arq = path.join(pasta, `backup-ha-ajuste-regra-${ESCOLA}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(arq, JSON.stringify(foto.ha, null, 1));
  console.log(`\nBackup da HA atual: ${arq}`);
  const r = await recalcularHASoDeQuemMudou(ESCOLA, foto);
  const haFinal = await db.select().from(disponibilidadeTable).where(and(inArray(disponibilidadeTable.professorId, profs.map((p) => p.id)), eq(disponibilidadeTable.horaAtividadeObrigatoria, true)));
  const jf = janelas(haFinal);
  console.log(`Gravado: ${r.completadas} HA acrescentada(s); a HA que ja existia ficou como estava.`);
  for (const t of TURNOS) if (ja[t] || jf[t]) console.log(`  janelas ${T(t)}: ${ja[t] ?? 0} -> ${jf[t] ?? 0}`);
  await pool.end();
}
main().catch(async (e) => { console.error("ERRO:", e); process.exit(1); });
