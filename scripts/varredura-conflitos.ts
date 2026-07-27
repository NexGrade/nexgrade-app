// Varredura sistemática de conflitos "carga insuficiente": compara,
// pra cada exigência curricular (turma_disciplinas), quantas aulas
// deveria ter vs. quantas está tendo de verdade (horarios). Quando a
// turma tem "sobra" de aulas de uma disciplina que ELA NÃO precisa,
// isso é forte indício de bug de mapeamento (sigla ambígua, tipo os
// casos do G.PES./E.MARK que já corrigimos). Quando não tem sobra
// nenhuma, é provável que seja falta de aula real nessa semana.
//
// Só LÊ o banco -- não grava nada.
//
// Como rodar:
//   npx tsx scripts/varredura-conflitos.ts [turno]
//   (turno é opcional -- se omitido, varre os 3 turnos)

import { db } from "@workspace/db";
import {
  turmasTable,
  turmaDisciplinasTable,
  disciplinasTable,
  professoresTable,
  horariosTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

async function main() {
  const turnoFiltro = process.argv[2]; // opcional
  const escolaId = "escola_default";

  const [turmas, turmaDiscs, disciplinas, professores, horarios] = await Promise.all([
    db.select().from(turmasTable).where(eq(turmasTable.escolaId, escolaId)),
    db.select().from(turmaDisciplinasTable),
    db.select().from(disciplinasTable).where(eq(disciplinasTable.escolaId, escolaId)),
    db.select().from(professoresTable).where(eq(professoresTable.escolaId, escolaId)),
    db.select().from(horariosTable).where(eq(horariosTable.escolaId, escolaId)),
  ]);

  const turmaMap = new Map(turmas.map((t) => [t.id, t]));
  const discMap = new Map(disciplinas.map((d) => [d.id, d]));
  const profMap = new Map(professores.map((p) => [p.id, p]));

  // conta aulas reais por (turmaId, disciplinaId)
  const contagemReal = new Map<string, number>();
  // lista de disciplinas "extras" que uma turma tem, agrupadas por turma
  const disciplinasPorTurma = new Map<number, Set<number>>();
  for (const h of horarios) {
    const chave = `${h.turmaId}-${h.disciplinaId}`;
    contagemReal.set(chave, (contagemReal.get(chave) ?? 0) + 1);
    if (!disciplinasPorTurma.has(h.turmaId)) disciplinasPorTurma.set(h.turmaId, new Set());
    disciplinasPorTurma.get(h.turmaId)!.add(h.disciplinaId);
  }

  type Problema = {
    turmaNome: string;
    turno: string;
    disciplinaNome: string;
    esperado: number;
    atual: number;
    faltam: number;
    professorNome: string;
    suspeitasDeSwap: string[]; // disciplinas que a turma tem "a mais" e nao deveria
  };
  const problemas: Problema[] = [];

  for (const td of turmaDiscs) {
    const turma = turmaMap.get(td.turmaId);
    if (!turma) continue;
    if (turnoFiltro && turma.turno !== turnoFiltro) continue;

    const disc = discMap.get(td.disciplinaId);
    if (!disc) continue;

    const esperado = td.cargaHorariaSemanalOverride ?? disc.cargaSemanal ?? 0;
    if (esperado === 0) continue;

    const atual = contagemReal.get(`${td.turmaId}-${td.disciplinaId}`) ?? 0;
    if (atual >= esperado) continue; // sem problema

    // disciplinas que essa turma tem gravadas mas que NAO estao no
    // curriculo dela (candidatas a "isso deveria ser outra coisa")
    const disciplinasExigidasDaTurma = new Set(
      turmaDiscs.filter((x) => x.turmaId === td.turmaId).map((x) => x.disciplinaId),
    );
    const disciplinasTemNaGrade = disciplinasPorTurma.get(td.turmaId) ?? new Set();
    const suspeitas = [...disciplinasTemNaGrade]
      .filter((discId) => !disciplinasExigidasDaTurma.has(discId))
      .map((discId) => discMap.get(discId)?.nome ?? `#${discId}`);

    problemas.push({
      turmaNome: turma.nome,
      turno: turma.turno,
      disciplinaNome: disc.nome,
      esperado,
      atual,
      faltam: esperado - atual,
      professorNome: td.professorId ? (profMap.get(td.professorId)?.nome ?? `#${td.professorId}`) : "(sem professor definido)",
      suspeitasDeSwap: suspeitas,
    });
  }

  console.log("=".repeat(70));
  console.log(`VARREDURA DE CONFLITOS -- carga insuficiente${turnoFiltro ? ` (${turnoFiltro})` : " (todos os turnos)"}`);
  console.log("=".repeat(70));
  console.log(`Total de conflitos de carga insuficiente: ${problemas.length}\n`);

  const comSuspeita = problemas.filter((p) => p.suspeitasDeSwap.length > 0);
  const semSuspeita = problemas.filter((p) => p.suspeitasDeSwap.length === 0);

  console.log(`Com suspeita de bug de mapeamento (turma tem disciplina "a mais" que não deveria ter): ${comSuspeita.length}`);
  for (const p of comSuspeita) {
    console.log(`  [${p.turno}] ${p.turmaNome} | "${p.disciplinaNome}" (${p.professorNome}) tem ${p.atual}/${p.esperado}`);
    console.log(`      -> suspeita(s): ${p.suspeitasDeSwap.join(", ")}`);
  }

  console.log(`\nProvavelmente sem aula real essa semana (sem disciplina "sobrando" pra explicar): ${semSuspeita.length}`);
  for (const p of semSuspeita) {
    console.log(`  [${p.turno}] ${p.turmaNome} | "${p.disciplinaNome}" (${p.professorNome}) tem ${p.atual}/${p.esperado}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
