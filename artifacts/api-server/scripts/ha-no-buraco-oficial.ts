/**
 * [HA-BURACO-OFICIAL] (01/11/2026) Aplica na GRADE OFICIAL a mesma regra de "HA no buraco" que a promocao usa
 * (reposicionarHAMovel, lib/reposicionar-ha.ts): a HA movel de cada professor vai para o horario que tira janela.
 * Por que: mudancas feitas direto na oficial (ex.: a Historia da tarde do Mario Braga, 31/10) nao passam pela
 * promocao, e o recalculo deixou HA em lugar que abre janela (Mario Braga 01/11: Eduarda, Emanuele, Rafael Belo e
 * Ednilson; no Urania esses dias nao tinham janela).
 * Mesmas regras da promocao: so HA movel (automatica ou importada); HA manual, fixa e probatorio ficam; nunca em
 * cima de aula (contando a turma integral no horario real e a assincrona), bloqueio ou atividade; so em dia com aula
 * no turno; no maximo 3 HA no dia; so move se a janela do professor DIMINUI. Aulas nao mudam.
 * Uso (na raiz do repositorio):
 *   pnpm --filter @workspace/api-server exec tsx --env-file=C:\projetos\nexgrade-app\lib\db\.env scripts/ha-no-buraco-oficial.ts --escola=ID [--turno=matutino]   (dry-run)
 *   ... --aplicar   (backup em lib/db/_arquivo + grava numa transacao)
 */
import fs from "node:fs";
import path from "node:path";

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const APLICAR = process.argv.includes("--aplicar");
const ESCOLA = arg("escola");
const TURNOS = arg("turno") ? [arg("turno")!] : ["matutino", "vespertino", "noturno"];
const RAIZ = path.resolve(process.cwd(), "..", "..");
const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex"];

async function main() {
  if (!ESCOLA) { console.log("Informe a escola: --escola=ID"); return; }
  const { pool } = await import("@workspace/db");
  const { mapaIntegralDosSlots, posicaoReal } = await import("../src/lib/turno-integral");
  const { reposicionarHAMovel, slotsLetivosPorTurno } = await import("../src/lib/reposicionar-ha");
  const c = await pool.connect();
  const q = async (s: string, p: unknown[] = []) => (await c.query(s, p)).rows as any[];
  try {
    console.log(APLICAR ? "MODO: APLICAR\n" : "MODO: DRY-RUN (so leitura; nada e gravado)\n");
    const [esc] = await q("select nome_fantasia from escolas where id=$1", [ESCOLA]);
    if (!esc) { console.log("Escola nao encontrada:", ESCOLA); return; }
    console.log(`Escola: ${esc.nome_fantasia}\n`);
    const turnoDe = new Map<number, string | null>((await q("select id, turno from turmas where escola_id=$1", [ESCOLA])).map((t) => [t.id, t.turno]));
    const slots = await q(`select turno, nivel_ensino "nivelEnsino", numero_aula "numeroAula", hora_inicio::text "horaInicio", duracao_minutos "duracaoMinutos", letivo
      from horario_slots where escola_id=$1`, [ESCOLA]);
    const mapa = mapaIntegralDosSlots(slots);
    const nomes = new Map((await q("select id, nome from professores where escola_id=$1", [ESCOLA])).map((r) => [r.id, r.nome]));
    // aulas no horario real, inclusive assincrona (ocupa o horario, como na simulacao e em Conflitos)
    const aulas = (await q(`select professor_id, turma_id, dia_semana, numero_aula from horarios
      where escola_id=$1 and professor_id is not null and coalesce(versao_grade,'oficial')='oficial'`, [ESCOLA]))
      .flatMap((h) => { const r = posicaoReal(h.turma_id, h.numero_aula, turnoDe, mapa); return r ? [{ professorId: h.professor_id, turno: r.turno, diaSemana: h.dia_semana, numeroAula: r.numeroAula }] : []; });
    const profs = [...new Set(aulas.map((a) => a.professorId))];
    const disp = await q(`select id, professor_id "professorId", turno, dia_semana "diaSemana", horario_slot "horarioSlot", disponivel,
      hora_atividade_obrigatoria "horaAtividadeObrigatoria", motivo from disponibilidade_professores where professor_id = any($1)`, [profs]);

    const movs = reposicionarHAMovel({ aulas, disp, slotsLetivos: slotsLetivosPorTurno(slots), turnos: TURNOS, professores: profs });
    for (const m of movs) {
      console.log(`  ${nomes.get(m.linha.professorId)} | ${m.linha.turno} | HA ${DIAS[m.linha.diaSemana]} ${m.linha.horarioSlot}a -> ${DIAS[m.diaSemana]} ${m.horarioSlot}a | "${(m.linha.motivo ?? "").slice(0, 50)}"`);
    }
    console.log(`\nHA a mover: ${movs.length} (turnos: ${TURNOS.join(", ")}). Aulas, bloqueios e HA manual/fixa nao mudam.`);
    console.log("Para ver as janelas antes e depois: scripts/conferir-ha-na-integral.ts --turno=...");
    if (!APLICAR) { console.log("DRY-RUN: NADA FOI GRAVADO. Rode com --aplicar."); return; }
    if (!movs.length) { console.log("Nada a gravar."); return; }
    const arqBk = path.join(RAIZ, "lib", "db", "_arquivo", `backup-ha-no-buraco-oficial-${ESCOLA}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.mkdirSync(path.dirname(arqBk), { recursive: true });
    fs.writeFileSync(arqBk, JSON.stringify(movs.map((m) => m.linha), null, 1));
    console.log(`Backup: ${arqBk}`);
    await c.query("BEGIN");
    try {
      // 1) tira do lugar (posicao provisoria unica) para uma HA poder ir para onde outra acabou de sair
      for (const m of movs) await c.query("update disponibilidade_professores set horario_slot=$1 where id=$2", [-m.linha.id, m.linha.id]);
      for (const m of movs) {
        // linha "livre" sem HA no destino ocuparia a mesma chave unica: sai antes
        await c.query(`delete from disponibilidade_professores where professor_id=$1 and coalesce(turno,'')=$2 and dia_semana=$3 and horario_slot=$4
          and not hora_atividade_obrigatoria and disponivel and coalesce(motivo,'') not like '%(ocupado:%'`, [m.linha.professorId, m.linha.turno ?? "", m.diaSemana, m.horarioSlot]);
        await c.query("update disponibilidade_professores set dia_semana=$1, horario_slot=$2 where id=$3", [m.diaSemana, m.horarioSlot, m.linha.id]);
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
