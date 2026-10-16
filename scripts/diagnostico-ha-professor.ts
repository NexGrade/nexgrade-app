// SO LEITURA. Mostra, por professor e turno, o quadro da semana para entender a HA:
//   A = aula   a = aula assincrona   H = HA de hoje   N = HA que o NexGrade colocaria
//   B = HA hoje e NexGrade no mesmo lugar   X = bloqueio   O = marcador "ocupado" (Urania)
//   . = livre   - = periodo nao letivo
// E a conta da tabela SEED por turno (aulas -> HA exigida).
//
// Uso (da raiz do projeto, com a DATABASE_URL carregada):
//   npx tsx scripts/diagnostico-ha-professor.ts --escola=org_... --professores="Giel,Thayná"

import { db, pool } from "@workspace/db";
import { professoresTable, disponibilidadeTable, horariosTable, turmasTable, horarioSlotsTable } from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";
import { calcularHAIdeal, calcularHoraAtividadeInstitucional } from "../artifacts/api-server/src/lib/recalcular-ha";
import { montarMapaPrincipal, principalDe } from "../artifacts/api-server/src/lib/professor-principal";

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const ESCOLA_ID = arg("escola") ?? "";
const NOMES = (arg("professores") ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
const DIAS = ["seg", "ter", "qua", "qui", "sex"];
const TURNOS = ["matutino", "vespertino", "noturno"];

async function main() {
  if (!ESCOLA_ID || !NOMES.length) { console.error('Uso: --escola=<id> --professores="Nome 1,Nome 2"'); process.exit(1); }
  console.log("SO LEITURA: nada sera gravado no banco.\n");
  const [profs, turmas, aulas, slots, ideal] = await Promise.all([
    db.select().from(professoresTable).where(eq(professoresTable.escolaId, ESCOLA_ID)),
    db.select().from(turmasTable).where(eq(turmasTable.escolaId, ESCOLA_ID)),
    db.select().from(horariosTable).where(eq(horariosTable.escolaId, ESCOLA_ID)),
    db.select().from(horarioSlotsTable).where(eq(horarioSlotsTable.escolaId, ESCOLA_ID)),
    calcularHAIdeal(ESCOLA_ID),
  ]);
  const versoes = new Map<string, number>();
  for (const h of aulas) versoes.set(h.versaoGrade ?? "(nulo)", (versoes.get(h.versaoGrade ?? "(nulo)") ?? 0) + 1);
  console.log("Linhas em horarios por versao_grade:", [...versoes].map(([v, n]) => `${v}=${n}`).join(", "), "\n");

  const turmaTurno = new Map(turmas.map((t) => [t.id, t.turno]));
  const mapa = montarMapaPrincipal(profs);
  const maxAula = new Map<string, number>();
  const naoLetivo = new Set<string>();
  for (const s of slots) {
    maxAula.set(s.turno, Math.max(maxAula.get(s.turno) ?? 0, s.numeroAula));
    if (s.letivo === false) naoLetivo.add(`${s.turno}|${s.numeroAula}`);
  }

  for (const nome of NOMES) {
    const achados = profs.filter((p) => p.nome.trim().toLowerCase() === nome);
    if (achados.length !== 1) { console.log(`"${nome}": ${achados.length} cadastro(s) com esse nome, pulei.\n`); continue; }
    const p = achados[0]!;
    const pid = principalDe(mapa, p.id);
    const ligados = profs.filter((x) => principalDe(mapa, x.id) === pid).map((x) => x.id);
    const disp = await db.select().from(disponibilidadeTable).where(inArray(disponibilidadeTable.professorId, ligados));
    const minhas = aulas.filter((h) => ligados.includes(h.professorId));
    const porTurno: Record<string, number> = {};
    for (const h of minhas) { const t = turmaTurno.get(h.turmaId) ?? "?"; porTurno[t] = (porTurno[t] ?? 0) + 1; }
    const total = Object.values(porTurno).reduce((s, n) => s + n, 0);
    const exigido = Object.entries(porTurno).map(([t, n]) => `${t} ${n} aulas -> ${calcularHoraAtividadeInstitucional(n)} HA`).join(" | ");
    const haHoje = disp.filter((d) => d.horaAtividadeObrigatoria && d.professorId === pid);
    const haNova = ideal.filter((m) => m.professorId === pid);
    console.log(`==== ${p.nome}${ligados.length > 1 ? ` (+ cadastros ligados: ${profs.filter((x) => ligados.includes(x.id) && x.id !== p.id).map((x) => x.nome).join(", ")})` : ""}`);
    console.log(`Aulas: ${total} | por turno: ${exigido} | tabela pelo TOTAL: ${calcularHoraAtividadeInstitucional(total)} HA`);
    console.log(`HA hoje: ${haHoje.length} | HA NexGrade: ${haNova.length}`);
    const motivosHoje = [...new Set(haHoje.map((d) => d.motivo ?? "(sem motivo)"))];
    console.log(`Motivo das HA de hoje: ${motivosHoje.join(" / ")}`);

    for (const turno of TURNOS) {
      const max = maxAula.get(turno) ?? 0;
      const temAlgo = minhas.some((h) => turmaTurno.get(h.turmaId) === turno) || haHoje.some((d) => d.turno === turno) || haNova.some((m) => m.turno === turno);
      if (!max || !temAlgo) continue;
      console.log(`  ${turno}`);
      console.log(`        ${Array.from({ length: max }, (_, i) => String(i + 1)).join(" ")}`);
      for (let dia = 0; dia < 5; dia++) {
        let linha = "";
        for (let a = 1; a <= max; a++) {
          const aula = minhas.find((h) => turmaTurno.get(h.turmaId) === turno && h.diaSemana === dia && h.numeroAula === a);
          const d = disp.find((x) => x.professorId === pid && x.turno === turno && x.diaSemana === dia && x.horarioSlot === a);
          const hoje = !!d?.horaAtividadeObrigatoria;
          const nova = haNova.some((m) => m.turno === turno && m.diaSemana === dia && m.horarioSlot === a);
          let c = ".";
          if (aula) c = aula.assincrona ? "a" : "A";
          else if (hoje && nova) c = "B";
          else if (hoje) c = "H";
          else if (nova) c = "N";
          else if (d && d.disponivel === false) c = "X";
          else if ((d?.motivo ?? "").includes("ocupado:")) c = "O";
          else if (naoLetivo.has(`${turno}|${a}`)) c = "-";
          if (aula && nova) c = "!"; // nao deveria acontecer
          linha += c + " ";
        }
        console.log(`    ${DIAS[dia]} ${linha}`);
      }
    }
    const bloqueios = [...new Set(disp.filter((d) => d.disponivel === false || (d.motivo ?? "").includes("ocupado:")).map((d) => d.motivo ?? "(sem motivo)"))];
    if (bloqueios.length) console.log(`  Bloqueios/marcadores: ${bloqueios.join(" / ")}`);
    console.log("");
  }
  console.log("Legenda: A aula, a assincrona, H HA hoje, N HA NexGrade, B as duas, X bloqueio, O ocupado, - nao letivo, . livre");
  console.log("SO LEITURA: nada foi gravado no banco.");
  await pool.end();
}

main().catch(async (err) => { console.error("ERRO:", err); await pool.end(); process.exit(1); });
