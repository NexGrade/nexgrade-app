// DRY-RUN do recálculo da hora-atividade (HA): calcula a HA ideal da escola com
// calcularHAIdeal e compara com o que está gravado. NÃO GRAVA NADA.
// Mostra, por professor, as HA que seriam inseridas e removidas (uma passada;
// o recálculo real roda até estabilizar, então o resultado final pode diferir pouco).
//
// Uso (da raiz do projeto, com a DATABASE_URL carregada):
//   npx tsx scripts/simular-recalculo-ha.ts
// Para gravar de verdade, depois de conferir: npx tsx scripts/rodar-recalculo-ha.ts

import { db, pool } from "@workspace/db";
import { professoresTable, disponibilidadeTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { calcularHAIdeal } from "../artifacts/api-server/src/lib/recalcular-ha";

const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8"; // C.E. Prof. Mário B.T. Braga
const DIAS = ["seg", "ter", "qua", "qui", "sex"];

async function main() {
  const [ideal, professores, disp] = await Promise.all([
    calcularHAIdeal(ESCOLA_ID),
    db.select().from(professoresTable).where(eq(professoresTable.escolaId, ESCOLA_ID)),
    db.select().from(disponibilidadeTable),
  ]);
  const nome = new Map(professores.map((p) => [p.id, p.nome]));
  const chave = (m: { professorId: number; turno: string | null; diaSemana: number; horarioSlot: number }) =>
    `${m.professorId}|${m.turno ?? "sem_turno"}|${m.diaSemana}|${m.horarioSlot}`;
  const atuais = disp.filter((d) => nome.has(d.professorId) && d.horaAtividadeObrigatoria);
  const idealSet = new Set(ideal.map(chave));
  const atuaisSet = new Set(atuais.map(chave));

  const inserir = ideal.filter((m) => !atuaisSet.has(chave(m)));
  const remover = atuais.filter((d) => !idealSet.has(chave(d)));

  const porProf = new Map<number, { ins: string[]; rem: string[] }>();
  const reg = (id: number) => porProf.get(id) ?? porProf.set(id, { ins: [], rem: [] }).get(id)!;
  const fmt = (m: { turno: string | null; diaSemana: number; horarioSlot: number }) => `${DIAS[m.diaSemana]} aula ${m.horarioSlot} (${m.turno ?? "sem turno"})`;
  for (const m of inserir) reg(m.professorId).ins.push(fmt(m));
  for (const d of remover) reg(d.professorId).rem.push(`${fmt(d)} [${d.motivo ?? ""}]`);

  console.log("🔍 DRY-RUN do recálculo de HA — nada foi gravado\n");
  for (const [id, v] of [...porProf].sort((a, b) => (nome.get(a[0]) ?? "").localeCompare(nome.get(b[0]) ?? "", "pt-BR"))) {
    console.log(nome.get(id));
    v.ins.forEach((x) => console.log(`   + inseriria HA: ${x}`));
    v.rem.forEach((x) => console.log(`   - removeria HA: ${x}`));
  }
  console.log(`\nTotal: ${inserir.length} a inserir, ${remover.length} a remover, ${porProf.size} professor(es) afetado(s).`);
  await pool.end();
}

main().catch(async (err) => {
  console.error("ERRO:", err);
  await pool.end();
  process.exit(1);
});
