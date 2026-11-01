/**
 * [INTEGRAL-NA-OCUPACAO] (01/11/2026) So le: HA gravada em cima de aula (a da turma integral no horario real) e as
 * janelas do turno. Como na simulacao e em Conflitos: aula (inclusive assincrona) e HA ocupam; atividade
 * "(ocupado: ...)" entre elas nao conta como janela. Uso (pasta artifacts/api-server):
 *   DATABASE_URL=... npx tsx scripts/conferir-ha-na-integral.ts [--escola=ID] [--turno=matutino]
 */
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const E = arg("escola") ?? "esc_1ce4d2d30c4146a99fb7ffa5", T = arg("turno") ?? "matutino";
const { pool } = await import("@workspace/db");
const { mapaIntegralDosSlots, posicaoReal } = await import("../src/lib/turno-integral");
const q = async (s: string, p: unknown[] = []) => (await pool.query(s, p)).rows as any[];
const turmas = await q(`select id, turno from turmas where escola_id=$1`, [E]);
const turnoDe = new Map<number, string | null>(turmas.map((t) => [t.id, t.turno]));
const mapa = mapaIntegralDosSlots(await q(`select turno, nivel_ensino "nivelEnsino", numero_aula "numeroAula", hora_inicio::text "horaInicio", duracao_minutos "duracaoMinutos", letivo from horario_slots where escola_id=$1`, [E]));
const aulas = (await q(`select h.professor_id p, h.turma_id, h.dia_semana d, h.numero_aula a, t.nome turma, t.turno tt from horarios h join turmas t on t.id=h.turma_id where h.escola_id=$1`, [E]))
  .map((x) => ({ ...x, r: posicaoReal(x.turma_id, x.a, turnoDe, mapa) })).filter((x) => x.r?.turno === T);
const ha = await q(`select d.professor_id p, d.dia_semana d, d.horario_slot a, d.motivo from disponibilidade_professores d join professores pr on pr.id=d.professor_id where pr.escola_id=$1 and d.turno=$2 and d.hora_atividade_obrigatoria`, [E, T]);
const aulaEm = new Map(aulas.map((x) => [`${x.p}|${x.d}|${x.r!.numeroAula}`, x]));
const nomes = new Map((await q(`select id, nome from professores where escola_id=$1`, [E])).map((r) => [r.id, r.nome]));
const choques = ha.filter((h) => aulaEm.has(`${h.p}|${h.d}|${h.a}`));
console.log(`HA no turno ${T}: ${ha.length}; HA em cima de aula: ${choques.length}`);
for (const h of choques) { const a = aulaEm.get(`${h.p}|${h.d}|${h.a}`)!; console.log(`  ${nomes.get(h.p)} dia ${h.d} aula ${h.a}: aula na ${a.turma} (${a.tt}) e HA "${(h.motivo ?? "").slice(0, 50)}"`); }
// janelas (aula + HA ocupam; atividade "(ocupado:" entre elas nao conta)
const ativ = new Set((await q(`select d.professor_id p, d.dia_semana d, d.horario_slot a from disponibilidade_professores d join professores pr on pr.id=d.professor_id where pr.escola_id=$1 and d.turno=$2 and not d.hora_atividade_obrigatoria and d.motivo like '%(ocupado:%'`, [E, T])).map((x) => `${x.p}|${x.d}|${x.a}`));
const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex"];
const outras = await q(`select d.professor_id p, d.dia_semana d, d.horario_slot a, d.disponivel, d.motivo from disponibilidade_professores d join professores pr on pr.id=d.professor_id
  where pr.escola_id=$1 and d.turno=$2 and not d.hora_atividade_obrigatoria`, [E, T]);
const linhas: string[] = [];
for (const p of new Set(aulas.map((x) => x.p))) for (const d of [0, 1, 2, 3, 4]) {
  const oc = new Set([...aulas.filter((x) => x.p === p && x.d === d).map((x) => x.r!.numeroAula), ...ha.filter((h) => h.p === p && h.d === d).map((h) => h.a)]);
  if (oc.size < 2) continue; const n = [...oc].sort((x, y) => x - y);
  for (let a = n[0]! + 1; a < n[n.length - 1]!; a++) {
    if (oc.has(a) || ativ.has(`${p}|${d}|${a}`)) continue;
    // [CONFERIR-LISTA] (01/11/2026) cada janela com o dia do professor: de onde ela veio
    const dia = n.map((s) => {
      const au = aulas.filter((x) => x.p === p && x.d === d && x.r!.numeroAula === s);
      return au.length ? `${s}a ${au.map((x) => `${x.turma}${x.tt === "integral" ? " (integral)" : ""}`).join("+")}` : `${s}a HA`;
    }).join(", ");
    const marca = outras.filter((x) => x.p === p && x.d === d && x.a === a).map((x) => `${x.disponivel ? "livre" : "bloqueio"} "${(x.motivo ?? "").slice(0, 40)}"`).join(" | ");
    linhas.push(`  ${nomes.get(p)} ${DIAS[d]} ${a}a${marca ? ` [${marca}]` : ""} | dia: ${dia}`);
  }
}
console.log(`janelas no turno ${T} (contando a integral): ${linhas.length}`);
linhas.forEach((l) => console.log(l));
await pool.end();
