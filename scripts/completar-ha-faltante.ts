// Completa a hora-atividade (HA) que FALTA para professores escolhidos, SEM mexer em nenhuma HA
// que ja existe. Feito para o Romario (16/10/2026): a regra de pausa entre turnos impedia a HA
// nos horarios da ponta da manha/tarde e deixou HA faltando; a regra foi corrigida (commit
// e63ec97), mas a HA que faltou nao volta sozinha. O recalculo normal NAO e usado porque ele pode
// mudar de lugar a HA importada do Urania (ehHAMovel), e no Romario a HA atual deve ficar como esta.
//
// Como funciona:
//   1. calcula a HA ideal da escola (calcularHAIdeal, mesma regra do sistema);
//   2. para cada professor escolhido, pega SO as HA ideais que ainda nao existem, ate completar
//      o que falta (ideal - atual);
//   3. so usa horario livre: sem aula do professor, sem HA, sem bloqueio, sem marcador "ocupado",
//      e no maximo HA_MAX_POR_DIA HA no mesmo turno e dia (padrao 5, igual ao Render).
//
// Uso (da raiz do projeto, com a DATABASE_URL carregada):
//   npx tsx scripts/completar-ha-faltante.ts --escola=org_... --professores="Elienara,Mateus Z."
//   ... --aplicar     -> grava (antes salva backup em lib/db/_arquivo/)

import fs from "node:fs";
import path from "node:path";
import { db, pool } from "@workspace/db";
import { professoresTable, disponibilidadeTable, horariosTable, turmasTable } from "@workspace/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { calcularHAIdeal } from "../artifacts/api-server/src/lib/recalcular-ha";
import { MOTIVO_HA_AUTO, MOTIVO_HA_AUTO_OUTRO_TURNO } from "../artifacts/api-server/src/lib/ha-contraturno";

const arg = (nome: string) => process.argv.find((a) => a.startsWith(`--${nome}=`))?.split("=").slice(1).join("=");
const APLICAR = process.argv.includes("--aplicar");
const ESCOLA_ID = arg("escola") ?? "";
const NOMES = (arg("professores") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const HA_MAX_POR_DIA = Number(process.env.HA_MAX_POR_DIA ?? "5");
const DIAS = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"];
const TURNO = (t: string | null) => ({ matutino: "manhã", vespertino: "tarde", noturno: "noite" } as Record<string, string>)[t ?? ""] ?? (t ?? "sem turno");

async function main() {
  if (!ESCOLA_ID || NOMES.length === 0) {
    console.error('Uso: npx tsx scripts/completar-ha-faltante.ts --escola=<id> --professores="Nome 1,Nome 2" [--aplicar]');
    process.exit(1);
  }
  console.log(APLICAR ? "MODO: APLICAR\n" : "MODO: DRY-RUN (nada sera gravado)\n");

  const professores = await db.select().from(professoresTable).where(eq(professoresTable.escolaId, ESCOLA_ID));
  const escolhidos = NOMES.map((n) => ({ n, p: professores.filter((p) => p.nome.trim().toLowerCase() === n.toLowerCase()) }));
  const problemas = escolhidos.filter((e) => e.p.length !== 1);
  if (problemas.length) {
    for (const e of problemas) console.error(`PARADO: "${e.n}" encontrou ${e.p.length} cadastro(s) na escola (precisa ser exatamente 1).`);
    process.exit(2);
  }
  const ids = escolhidos.map((e) => e.p[0]!.id);
  const nomeDe = new Map(professores.map((p) => [p.id, p.nome]));

  const [ideal, disp, aulas] = await Promise.all([
    calcularHAIdeal(ESCOLA_ID),
    db.select().from(disponibilidadeTable).where(inArray(disponibilidadeTable.professorId, ids)),
    db.select({ professorId: horariosTable.professorId, dia: horariosTable.diaSemana, aula: horariosTable.numeroAula, turno: turmasTable.turno })
      .from(horariosTable)
      .innerJoin(turmasTable, eq(horariosTable.turmaId, turmasTable.id))
      .where(and(eq(horariosTable.escolaId, ESCOLA_ID), inArray(horariosTable.professorId, ids), sql`COALESCE(${horariosTable.versaoGrade}, 'oficial') = 'oficial'`)),
  ]);

  const chave = (p: number, t: string | null, d: number, a: number) => `${p}|${t ?? "sem_turno"}|${d}|${a}`;
  const comAula = new Set(aulas.map((x) => chave(x.professorId, x.turno, x.dia, x.aula)));
  const linhaDisp = new Map(disp.map((d) => [chave(d.professorId, d.turno, d.diaSemana, d.horarioSlot), d]));
  const haPorTurnoDia = new Map<string, number>();
  for (const d of disp) if (d.horaAtividadeObrigatoria) {
    const k = `${d.professorId}|${d.turno}|${d.diaSemana}`;
    haPorTurnoDia.set(k, (haPorTurnoDia.get(k) ?? 0) + 1);
  }

  const inserir: Array<{ professorId: number; turno: string; diaSemana: number; horarioSlot: number; motivo: string }> = [];
  let algumAviso = false;
  for (const id of ids) {
    const atuais = disp.filter((d) => d.professorId === id && d.horaAtividadeObrigatoria).length;
    const doProf = ideal.filter((m) => m.professorId === id);
    const falta = doProf.length - atuais;
    console.log(`${nomeDe.get(id)}: HA atual ${atuais}, ideal ${doProf.length}, falta ${Math.max(0, falta)}`);
    if (falta <= 0) { console.log("   nada a acrescentar\n"); continue; }
    let acrescentadas = 0;
    for (const m of doProf) {
      if (acrescentadas >= falta) break;
      const k = chave(id, m.turno, m.diaSemana, m.horarioSlot);
      const d = linhaDisp.get(k);
      const kDia = `${id}|${m.turno}|${m.diaSemana}`;
      const motivoBloqueio =
        comAula.has(k) ? "tem aula" :
        d?.horaAtividadeObrigatoria ? "ja e HA" :
        d && d.disponivel === false ? `bloqueado (${d.motivo ?? "sem motivo"})` :
        (d?.motivo ?? "").includes("ocupado:") ? `marcador (${d!.motivo})` :
        (haPorTurnoDia.get(kDia) ?? 0) >= HA_MAX_POR_DIA ? `ja tem ${HA_MAX_POR_DIA} HA no dia` : null;
      if (motivoBloqueio) continue;
      inserir.push({ professorId: id, turno: m.turno, diaSemana: m.diaSemana, horarioSlot: m.horarioSlot, motivo: m.outroTurno ? MOTIVO_HA_AUTO_OUTRO_TURNO : MOTIVO_HA_AUTO });
      haPorTurnoDia.set(kDia, (haPorTurnoDia.get(kDia) ?? 0) + 1);
      acrescentadas++;
      console.log(`   + HA ${DIAS[m.diaSemana]} ${m.horarioSlot}ª da ${TURNO(m.turno)}${m.outroTurno ? " (HA*)" : ""}`);
    }
    if (acrescentadas < falta) {
      algumAviso = true;
      console.log(`   ATENCAO: so achei ${acrescentadas} de ${falta} horario(s) livre(s) entre os ideais; o resto continua faltando.`);
    }
    console.log("");
  }

  console.log(`Resumo: ${inserir.length} HA a acrescentar para ${ids.length} professor(es). Nenhuma HA existente e alterada ou removida.`);
  if (algumAviso) console.log("Ha professor(es) que nao fecham a HA so com horarios livres (ver ATENCAO acima).");
  if (!APLICAR) {
    console.log("\nDRY-RUN: nada foi gravado. Para gravar, rode de novo com --aplicar.");
    await pool.end();
    return;
  }
  if (!inserir.length) { console.log("Nada a gravar."); await pool.end(); return; }

  const pasta = path.resolve("lib/db/_arquivo");
  fs.mkdirSync(pasta, { recursive: true });
  const arquivo = path.join(pasta, `backup-completar-ha-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(arquivo, JSON.stringify({ escolaId: ESCOLA_ID, professores: ids, disponibilidadeAntes: disp, inserir }, null, 2));
  console.log(`Backup: ${arquivo}`);

  const gravadas = await db.transaction(async (tx) => {
    const rows = await tx.insert(disponibilidadeTable).values(
      inserir.map((i) => ({ professorId: i.professorId, turno: i.turno === "sem_turno" ? null : i.turno, diaSemana: i.diaSemana, horarioSlot: i.horarioSlot, disponivel: true, horaAtividadeObrigatoria: true, motivo: i.motivo })),
    ).onConflictDoUpdate({
      target: [disponibilidadeTable.professorId, disponibilidadeTable.diaSemana, disponibilidadeTable.horarioSlot, disponibilidadeTable.turno],
      set: { horaAtividadeObrigatoria: true, motivo: sql`excluded.motivo` },
      // so converte linha LIVRE (disponivel=true, nao HA, sem marcador) -- nunca bloqueio nem HA existente
      where: sql`${disponibilidadeTable.disponivel} = true AND ${disponibilidadeTable.horaAtividadeObrigatoria} = false AND COALESCE(${disponibilidadeTable.motivo}, '') NOT LIKE '%ocupado:%'`,
    }).returning({ id: disponibilidadeTable.id });
    return rows.length;
  });
  console.log(`APLICADO: ${gravadas} de ${inserir.length} HA gravada(s).`);
  await pool.end();
}

main().catch(async (err) => {
  console.error("ERRO (nada gravado se estava aplicando):", err);
  await pool.end();
  process.exit(1);
});
