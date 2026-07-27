// Varredura expandida de conflitos -- cobre dois tipos que a varredura
// de "carga insuficiente" não pega:
//
// 1. PROFESSOR DUPLICADO: mesmo professor em 2 turmas no mesmo dia/aula
//    (conflito grave -- fisicamente impossível, nunca deveria acontecer)
// 2. CONTRA DISPONIBILIDADE: aula gravada num dia/horário em que o
//    professor está marcado como indisponível na tabela `disponibilidade`
//    (ou a disponibilidade está desatualizada, ou a grade está errada)
//
// Só LÊ o banco -- não grava nada.
//
// Como rodar:
//   npx tsx scripts/varredura-conflitos-v2.ts [turno]

import { db } from "@workspace/db";
import {
  turmasTable,
  disciplinasTable,
  professoresTable,
  horariosTable,
  disponibilidadeTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

const DIAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];

async function main() {
  const turnoFiltro = process.argv[2];
  const escolaId = "escola_default";

  const [turmas, disciplinas, professores, horarios, disponibilidades] = await Promise.all([
    db.select().from(turmasTable).where(eq(turmasTable.escolaId, escolaId)),
    db.select().from(disciplinasTable).where(eq(disciplinasTable.escolaId, escolaId)),
    db.select().from(professoresTable).where(eq(professoresTable.escolaId, escolaId)),
    db.select().from(horariosTable).where(eq(horariosTable.escolaId, escolaId)),
    db.select().from(disponibilidadeTable),
  ]);

  const turmaMap = new Map(turmas.map((t) => [t.id, t]));
  const discMap = new Map(disciplinas.map((d) => [d.id, d]));
  const profMap = new Map(professores.map((p) => [p.id, p]));

  const horariosFiltrados = turnoFiltro
    ? horarios.filter((h) => turmaMap.get(h.turmaId)?.turno === turnoFiltro)
    : horarios;

  // ── 1. PROFESSOR DUPLICADO ──
  const porProfessorSlot = new Map<string, typeof horarios>();
  for (const h of horariosFiltrados) {
    // [FIX] inclui o turno na chave -- "aula 5" do matutino e "aula 5"
    // do vespertino sao horarios de relogio diferentes, entao um
    // professor pode (e frequentemente deve) dar aula nos dois ao
    // mesmo tempo sem conflito nenhum.
    const turno = turmaMap.get(h.turmaId)?.turno ?? "desconhecido";
    const chave = `${h.professorId}-${turno}-${h.diaSemana}-${h.numeroAula}`;
    if (!porProfessorSlot.has(chave)) porProfessorSlot.set(chave, []);
    porProfessorSlot.get(chave)!.push(h);
  }
  const duplicados = [...porProfessorSlot.values()].filter((arr) => arr.length > 1);

  console.log("=".repeat(70));
  console.log(`VARREDURA v2${turnoFiltro ? ` (${turnoFiltro})` : " (todos os turnos)"}`);
  console.log("=".repeat(70));

  console.log(`\n[1] PROFESSOR EM 2 LUGARES AO MESMO TEMPO: ${duplicados.length} caso(s)`);
  for (const grupo of duplicados) {
    const prof = profMap.get(grupo[0].professorId)?.nome ?? `#${grupo[0].professorId}`;
    const dia = DIAS[grupo[0].diaSemana];
    const aula = grupo[0].numeroAula;
    console.log(`  ${prof} | ${dia} aula ${aula}:`);
    for (const h of grupo) {
      const turma = turmaMap.get(h.turmaId)?.nome ?? `#${h.turmaId}`;
      const disc = discMap.get(h.disciplinaId)?.nome ?? `#${h.disciplinaId}`;
      console.log(`      -> ${turma} | ${disc}`);
    }
  }

  // ── 2. CONTRA DISPONIBILIDADE MARCADA ──
  const indisponivelSet = new Set(
    disponibilidades
      .filter((d) => !d.disponivel)
      .map((d) => `${d.professorId}-${d.turno ?? "null"}-${d.diaSemana}-${d.horarioSlot}`),
  );

  const violacoes: Array<{ prof: string; turma: string; disc: string; turno: string; dia: string; aula: number }> = [];
  for (const h of horariosFiltrados) {
    const turma = turmaMap.get(h.turmaId);
    if (!turma) continue;
    const chave1 = `${h.professorId}-${turma.turno}-${h.diaSemana}-${h.numeroAula}`;
    const chave2 = `${h.professorId}-null-${h.diaSemana}-${h.numeroAula}`;
    if (indisponivelSet.has(chave1) || indisponivelSet.has(chave2)) {
      violacoes.push({
        prof: profMap.get(h.professorId)?.nome ?? `#${h.professorId}`,
        turma: turma.nome,
        disc: discMap.get(h.disciplinaId)?.nome ?? `#${h.disciplinaId}`,
        turno: turma.turno,
        dia: DIAS[h.diaSemana],
        aula: h.numeroAula,
      });
    }
  }

  console.log(`\n[2] AULA GRAVADA CONTRA DISPONIBILIDADE MARCADA: ${violacoes.length} caso(s)`);
  for (const v of violacoes) {
    console.log(`  ${v.prof} | ${v.turma} (${v.turno}) | ${v.disc} | ${v.dia} aula ${v.aula} -- professor marcado indisponível nesse horário`);
  }

  if (duplicados.length === 0 && violacoes.length === 0) {
    console.log("\nNenhum problema encontrado nessas duas categorias.");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
