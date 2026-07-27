// Verifica disciplinas duplicadas (nome IDÊNTICO) e disciplinas SEM
// NENHUM uso (nem em turma_disciplinas, nem em horarios, nem em
// professor_disciplinas, nem em aulas_fixas) -- candidatas seguras
// pra exclusão.
//
// NÃO EXCLUI NADA -- só lê e mostra o diagnóstico, pra você decidir.
//
// Como rodar:
//   npx tsx scripts/verificar-disciplinas.ts

import { db } from "@workspace/db";
import {
  disciplinasTable,
  turmaDisciplinasTable,
  horariosTable,
  professorDisciplinasTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.,()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const escolaId = "escola_default";

  const [disciplinas, turmaDiscs, horarios, profDiscs] = await Promise.all([
    db.select().from(disciplinasTable).where(eq(disciplinasTable.escolaId, escolaId)),
    db.select().from(turmaDisciplinasTable),
    db.select().from(horariosTable).where(eq(horariosTable.escolaId, escolaId)),
    db.select().from(professorDisciplinasTable),
  ]);

  const usoTurmaDisc = new Set(turmaDiscs.map((td) => td.disciplinaId));
  const usoHorarios = new Set(horarios.map((h) => h.disciplinaId));
  const usoProfDisc = new Set(profDiscs.map((pd) => pd.disciplinaId));

  function emUso(discId: number): string[] {
    const usos: string[] = [];
    if (usoTurmaDisc.has(discId)) usos.push("turma_disciplinas");
    if (usoHorarios.has(discId)) usos.push("horarios");
    if (usoProfDisc.has(discId)) usos.push("professor_disciplinas");
    return usos;
  }

  // ── 1. Duplicatas EXATAS (nome normalizado identico) ──
  const porNomeNorm = new Map<string, typeof disciplinas>();
  for (const d of disciplinas) {
    const chave = normalizar(d.nome);
    if (!porNomeNorm.has(chave)) porNomeNorm.set(chave, []);
    porNomeNorm.get(chave)!.push(d);
  }
  const duplicatasExatas = [...porNomeNorm.values()].filter((arr) => arr.length > 1);

  console.log("=".repeat(70));
  console.log("VERIFICAÇÃO DE DISCIPLINAS -- somente leitura");
  console.log("=".repeat(70));

  console.log(`\n[1] DUPLICATAS EXATAS (mesmo nome, IDs diferentes): ${duplicatasExatas.length} grupo(s)`);
  for (const grupo of duplicatasExatas) {
    console.log(`  "${grupo[0].nome}":`);
    for (const d of grupo) {
      const usos = emUso(d.id);
      console.log(`    id ${d.id} | codigoSae=${d.codigoSae ?? "(vazio)"} | uso: ${usos.length > 0 ? usos.join(", ") : "NENHUM (candidata a exclusão)"}`);
    }
  }

  // ── 2. Disciplinas totalmente SEM USO (nao precisam ser duplicata) ──
  const semUsoNenhum = disciplinas.filter((d) => emUso(d.id).length === 0);
  console.log(`\n[2] DISCIPLINAS SEM NENHUM USO (não aparecem em turma_disciplinas, horarios nem professor_disciplinas): ${semUsoNenhum.length}`);
  for (const d of semUsoNenhum) {
    console.log(`  id ${d.id} | "${d.nome}" | codigoSae=${d.codigoSae ?? "(vazio)"}`);
  }

  // ── 3. Nomes PARECIDOS mas nao identicos (so pra sua ciencia -- NAO sao duplicata automatica) ──
  console.log(`\n[3] Nomes parecidos (revisar manualmente -- podem ser disciplinas DIFERENTES de verdade, como já vimos com Estratégia/Estratégias):`);
  const nomesOrdenados = disciplinas.map((d) => ({ id: d.id, nome: d.nome, norm: normalizar(d.nome) })).sort((a, b) => a.norm.localeCompare(b.norm));
  for (let i = 0; i < nomesOrdenados.length - 1; i++) {
    const a = nomesOrdenados[i];
    const b = nomesOrdenados[i + 1];
    if (a.norm !== b.norm && (a.norm.startsWith(b.norm.slice(0, 8)) || b.norm.startsWith(a.norm.slice(0, 8)))) {
      console.log(`  "${a.nome}" (id ${a.id}) <-> "${b.nome}" (id ${b.id})`);
    }
  }

  console.log(`\nTotal de disciplinas cadastradas: ${disciplinas.length}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
