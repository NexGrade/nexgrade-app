// Remove as restrições de disponibilidade do Geverson que estão
// desatualizadas -- ele está marcado como indisponível em horários
// onde a grade REAL (já validada contra o PDF da escola) mostra ele
// dando aula normalmente. Mostra o que seria removido e pede
// confirmação antes de gravar.
//
// Como rodar:
//   npx tsx scripts/corrigir-disponibilidade-geverson.ts

import { db } from "@workspace/db";
import {
  professoresTable,
  turmasTable,
  horariosTable,
  disponibilidadeTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import * as readline from "readline";

const DIAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];

function perguntar(pergunta: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(pergunta, (resp) => { rl.close(); resolve(resp); }));
}

async function main() {
  const escolaId = "escola_default";

  const [professores, turmas, horarios, disponibilidades] = await Promise.all([
    db.select().from(professoresTable).where(eq(professoresTable.escolaId, escolaId)),
    db.select().from(turmasTable).where(eq(turmasTable.escolaId, escolaId)),
    db.select().from(horariosTable).where(eq(horariosTable.escolaId, escolaId)),
    db.select().from(disponibilidadeTable),
  ]);

  const geverson = professores.find((p) => p.nome === "Geverson");
  if (!geverson) {
    console.error("Professor 'Geverson' não encontrado.");
    process.exit(1);
  }

  const turmaMap = new Map(turmas.map((t) => [t.id, t]));

  // slots onde o Geverson REALMENTE dá aula, segundo a grade oficial ja sincronizada
  const slotsReais = new Set(
    horarios
      .filter((h) => h.professorId === geverson.id)
      .map((h) => {
        const turno = turmaMap.get(h.turmaId)?.turno ?? "desconhecido";
        return `${turno}-${h.diaSemana}-${h.numeroAula}`;
      }),
  );

  // restrições de indisponibilidade dele que colidem com esses slots reais
  const paraRemover = disponibilidades.filter((d) => {
    if (d.professorId !== geverson.id || d.disponivel) return false;
    const chave1 = `${d.turno ?? "desconhecido"}-${d.diaSemana}-${d.horarioSlot}`;
    return slotsReais.has(chave1);
  });

  console.log("=".repeat(70));
  console.log("CORREÇÃO -- Disponibilidade desatualizada do Geverson");
  console.log("=".repeat(70));
  console.log(`Restrições de indisponibilidade que colidem com a grade real: ${paraRemover.length}\n`);

  for (const d of paraRemover) {
    console.log(`  id ${d.id} | turno=${d.turno ?? "(qualquer)"} | ${DIAS[d.diaSemana]} | aula ${d.horarioSlot}`);
  }

  if (paraRemover.length === 0) {
    console.log("\nNada a remover.");
    process.exit(0);
  }

  const resp = await perguntar("\nRemover essas restrições de indisponibilidade agora? (digite 'sim' para confirmar) ");
  if (resp.trim().toLowerCase() !== "sim") {
    console.log("Cancelado -- nada foi alterado.");
    process.exit(0);
  }

  await db.delete(disponibilidadeTable).where(inArray(disponibilidadeTable.id, paraRemover.map((d) => d.id)));
  console.log(`\nPronto! ${paraRemover.length} restrição(ões) desatualizada(s) removida(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
