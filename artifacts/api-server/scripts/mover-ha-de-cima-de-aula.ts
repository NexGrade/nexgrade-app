/**
 * [HA-SOBRE-AULA] (01/11/2026) HA nao pode coincidir com aula, nem assincrona (decisao da dona, 01/11). Acha HA gravada
 * em cima de aula do mesmo professor (no horario real: turma integral vira manha/tarde) e move para um horario livre do
 * mesmo professor, no mesmo turno: sem aula, sem outra HA, sem bloqueio nem atividade, no maximo 3 HA no dia, num dia
 * em que ele da aula nesse turno. Escolhe o lugar com MENOS janelas no turno (empate: mesmo dia, depois o mais perto).
 * So move HA movel (automatica ou importada; ver ehHAMovel). HA manual, fixa ou de probatorio em cima de aula e so
 * LISTADA: foi marcada a mao na escola, quem decide e ela.
 * Achado: noturno do Mario Braga (01/11) com 3 HA do Urania em cima de aula assincrona acrescentada depois.
 * Uso (na raiz do repositorio; le DATABASE_URL de lib/db/.env, ou passe --env-file):
 *   pnpm --filter @workspace/api-server exec tsx --env-file=C:\projetos\nexgrade-app\lib\db\.env scripts/mover-ha-de-cima-de-aula.ts --escola=ID             (dry-run)
 *   ... --escola=ID --aplicar   (backup em lib/db/_arquivo + grava numa transacao)
 */
import fs from "node:fs";
import path from "node:path";

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const APLICAR = process.argv.includes("--aplicar");
const ESCOLA = arg("escola");
const RAIZ = path.resolve(process.cwd(), "..", "..");
const MAX_HA_DIA = 3;
const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex"];
const RE_ATIVIDADE = /\(ocupado:\s*[^)]+\)/;

async function main() {
  if (!ESCOLA) { console.log("Informe a escola: --escola=ID"); return; }
  const { pool } = await import("@workspace/db");
  const { mapaIntegralDosSlots, posicaoReal } = await import("../src/lib/turno-integral");
  const { ehHAMovel } = await import("../src/lib/ha-contraturno");
  const c = await pool.connect();
  const q = async (s: string, p: unknown[] = []) => (await c.query(s, p)).rows as any[];
  try {
    console.log(APLICAR ? "MODO: APLICAR\n" : "MODO: DRY-RUN (so leitura; nada e gravado)\n");
    const [esc] = await q("select nome_fantasia from escolas where id=$1", [ESCOLA]);
    if (!esc) { console.log("Escola nao encontrada:", ESCOLA); return; }
    console.log(`Escola: ${esc.nome_fantasia}\n`);
    const turmas = await q("select id, turno from turmas where escola_id=$1", [ESCOLA]);
    const turnoDe = new Map<number, string | null>(turmas.map((t) => [t.id, t.turno]));
    const slots = await q(`select turno, nivel_ensino "nivelEnsino", numero_aula "numeroAula", hora_inicio::text "horaInicio", duracao_minutos "duracaoMinutos", letivo
      from horario_slots where escola_id=$1`, [ESCOLA]);
    const mapa = mapaIntegralDosSlots(slots);
    const numerosDoTurno = new Map<string, number[]>();
    for (const s of slots) if (s.turno !== "integral") numerosDoTurno.set(s.turno, [...new Set([...(numerosDoTurno.get(s.turno) ?? []), s.numeroAula])].sort((a, b) => a - b));
    const nomes = new Map((await q("select id, nome from professores where escola_id=$1", [ESCOLA])).map((r) => [r.id, r.nome]));

    // aulas no horario real (inclusive assincrona)
    const aulas = (await q(`select h.professor_id p, h.turma_id, h.dia_semana d, h.numero_aula a, t.nome turma, coalesce(h.assincrona,false) ass
      from horarios h join turmas t on t.id=h.turma_id where h.escola_id=$1 and h.professor_id is not null`, [ESCOLA]))
      .map((x) => ({ ...x, r: posicaoReal(x.turma_id, x.a, turnoDe, mapa) })).filter((x) => x.r && x.r.turno !== "integral");
    const disp = await q(`select d.id, d.professor_id p, d.turno, d.dia_semana d, d.horario_slot a, d.disponivel, d.hora_atividade_obrigatoria ha, d.motivo
      from disponibilidade_professores d join professores pr on pr.id=d.professor_id where pr.escola_id=$1 and d.turno is not null`, [ESCOLA]);

    const aulaEm = new Map<string, any>();
    for (const x of aulas) aulaEm.set(`${x.p}|${x.r.turno}|${x.d}|${x.r.numeroAula}`, x);
    const sobreAula = disp.filter((h) => h.ha && aulaEm.has(`${h.p}|${h.turno}|${h.d}|${h.a}`));
    console.log(`HA em cima de aula: ${sobreAula.length}\n`);

    const movimentos: Array<{ id: number; p: number; turno: string; de: [number, number]; para: [number, number] }> = [];
    const ocupadoHA = new Set(disp.filter((x) => x.ha).map((x) => `${x.p}|${x.turno}|${x.d}|${x.a}`));
    for (const h of sobreAula) {
      const a = aulaEm.get(`${h.p}|${h.turno}|${h.d}|${h.a}`);
      const onde = `${nomes.get(h.p)} | ${h.turno} ${DIAS[h.d]} ${h.a}a | aula ${a.turma}${a.ass ? " (assincrona)" : ""} | HA "${(h.motivo ?? "").slice(0, 50)}"`;
      if (!ehHAMovel(h.motivo)) { console.log(`  [SO LISTADA] ${onde}\n     HA manual/fixa: a escola decide (mudar a mao na Disponibilidade)`); continue; }

      const doTurno = numerosDoTurno.get(h.turno) ?? [];
      const aulasP = aulas.filter((x) => x.p === h.p && x.r.turno === h.turno);
      const diasComAula = new Set(aulasP.map((x) => x.d));
      const travado = new Set(disp.filter((x) => x.p === h.p && x.turno === h.turno && !x.ha && (!x.disponivel || RE_ATIVIDADE.test(x.motivo ?? ""))).map((x) => `${x.d}|${x.a}`));
      const atividade = new Set(disp.filter((x) => x.p === h.p && x.turno === h.turno && !x.ha && RE_ATIVIDADE.test(x.motivo ?? "")).map((x) => `${x.d}|${x.a}`));
      const haDoProf = () => [...ocupadoHA].filter((k) => k.startsWith(`${h.p}|${h.turno}|`)).map((k) => k.split("|").slice(2).map(Number) as [number, number]);
      const janelas = (has: Array<[number, number]>) => {
        let j = 0;
        for (const dia of [0, 1, 2, 3, 4]) {
          const oc = new Set([...aulasP.filter((x) => x.d === dia).map((x) => x.r.numeroAula), ...has.filter(([d]) => d === dia).map(([, n]) => n)]);
          if (oc.size < 2) continue;
          const n = [...oc].sort((x, y) => x - y);
          for (let s = n[0]! + 1; s < n[n.length - 1]!; s++) if (!oc.has(s) && !atividade.has(`${dia}|${s}`)) j++;
        }
        return j;
      };
      const atuais = haDoProf().filter(([d, n]) => !(d === h.d && n === h.a));
      let melhor: { dia: number; aula: number; j: number; dist: number } | null = null;
      for (const dia of diasComAula) {
        if (dia !== h.d && atuais.filter(([d]) => d === dia).length >= MAX_HA_DIA) continue;
        for (const n of doTurno) {
          const k = `${dia}|${n}`;
          if (aulaEm.has(`${h.p}|${h.turno}|${dia}|${n}`) || travado.has(k) || ocupadoHA.has(`${h.p}|${h.turno}|${dia}|${n}`)) continue;
          const j = janelas([...atuais, [dia, n]]);
          const dist = (dia === h.d ? 0 : 10) + Math.abs(n - h.a);
          if (!melhor || j < melhor.j || (j === melhor.j && dist < melhor.dist)) melhor = { dia, aula: n, j, dist };
        }
      }
      if (!melhor) { console.log(`  [SEM LUGAR] ${onde}\n     nenhum horario livre no turno: mudar a mao`); continue; }
      console.log(`  ${onde}\n     -> ${DIAS[melhor.dia]} ${melhor.aula}a (janelas do professor no turno: ${janelas(haDoProf())} -> ${melhor.j})`);
      ocupadoHA.delete(`${h.p}|${h.turno}|${h.d}|${h.a}`);
      ocupadoHA.add(`${h.p}|${h.turno}|${melhor.dia}|${melhor.aula}`);
      movimentos.push({ id: h.id, p: h.p, turno: h.turno, de: [h.d, h.a], para: [melhor.dia, melhor.aula] });
    }

    console.log(`\nHA a mover: ${movimentos.length}. Aulas, bloqueios e as outras HA nao mudam.`);
    if (!APLICAR) { console.log("DRY-RUN: NADA FOI GRAVADO. Rode com --aplicar."); return; }
    if (!movimentos.length) { console.log("Nada a gravar."); return; }
    const arqBk = path.join(RAIZ, "lib", "db", "_arquivo", `backup-ha-sobre-aula-${ESCOLA}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.mkdirSync(path.dirname(arqBk), { recursive: true });
    fs.writeFileSync(arqBk, JSON.stringify(disp.filter((x) => movimentos.some((m) => m.id === x.id)), null, 1));
    console.log(`Backup: ${arqBk}`);
    await c.query("BEGIN");
    try {
      for (const m of movimentos) {
        // linha "livre" sem HA no destino ocuparia a mesma chave unica: sai antes
        await c.query(`delete from disponibilidade_professores where professor_id=$1 and turno=$2 and dia_semana=$3 and horario_slot=$4
          and not hora_atividade_obrigatoria and disponivel and coalesce(motivo,'') not like '%(ocupado:%'`, [m.p, m.turno, m.para[0], m.para[1]]);
        await c.query("update disponibilidade_professores set dia_semana=$1, horario_slot=$2 where id=$3", [m.para[0], m.para[1], m.id]);
      }
      await c.query("COMMIT");
      console.log("GRAVADO.");
    } catch (err) { await c.query("ROLLBACK"); throw err; }
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
