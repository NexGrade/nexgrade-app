// Substitui a Hora-Atividade aproximada (calculada por algoritmo) pela
// posição EXATA extraída dos PDFs reais (onde "HA" literalmente
// aparece pra cada professor, dia e horário).
//
// 1. Remove TODAS as linhas horaAtividadeObrigatoria=true atuais
// 2. Insere as 399 posições exatas extraídas do PDF
//
// Dry-run primeiro -- pede confirmação antes de gravar.
//
// Como rodar:
//   npx tsx scripts/aplicar-ha-exata.ts

import { db } from "@workspace/db";
import { professoresTable, disponibilidadeTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { readFileSync } from "fs";
import * as readline from "readline";

const DIAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];
const MOTIVO = "Hora-atividade institucional (posição exata, grade real 27/07 a 31/07)";

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.,()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function perguntar(pergunta: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(pergunta, (resp) => { rl.close(); resolve(resp); }));
}

async function main() {
  const escolaId = "escola_default";
  const haExtraidas: Array<{ professor: string; turno: string; dia: number; numeroAula: number }> =
    JSON.parse(readFileSync("scripts/ha_exata.json", "utf-8"));

  const professores = await db.select().from(professoresTable).where(eq(professoresTable.escolaId, escolaId));
  const professorPorNomeCompleto = new Map(professores.map((p) => [normalizar(p.nome), p]));
  const professorPorPrimeiroNome = new Map<string, typeof professores>();
  for (const p of professores) {
    const primeiro = normalizar(p.nome).split(" ")[0];
    if (!professorPorPrimeiroNome.has(primeiro)) professorPorPrimeiroNome.set(primeiro, []);
    professorPorPrimeiroNome.get(primeiro)!.push(p);
  }

  const resolvidas: Array<{ professorId: number; nome: string; turno: string; dia: number; numeroAula: number }> = [];
  const problemas: string[] = [];

  for (const item of haExtraidas) {
    const nomeNorm = normalizar(item.professor);
    let prof = professorPorNomeCompleto.get(nomeNorm);
    if (!prof) {
      const candidatos = professorPorPrimeiroNome.get(nomeNorm.split(" ")[0]) ?? [];
      if (candidatos.length === 1) prof = candidatos[0];
      else if (candidatos.length > 1) {
        problemas.push(`"${item.professor}" ambíguo: ${candidatos.map((c) => c.nome).join(", ")}`);
        continue;
      }
    }
    if (!prof) {
      problemas.push(`"${item.professor}" não encontrado`);
      continue;
    }
    resolvidas.push({ professorId: prof.id, nome: prof.nome, turno: item.turno, dia: item.dia, numeroAula: item.numeroAula });
  }

  console.log("=".repeat(70));
  console.log("SUBSTITUIR HA -- posição exata dos PDFs (dry-run)");
  console.log("=".repeat(70));
  console.log(`Total extraído: ${haExtraidas.length} | Resolvido: ${resolvidas.length} | Problemas: ${problemas.length}`);

  if (problemas.length > 0) {
    console.log("\nPROBLEMAS:");
    const agrupados = new Map<string, number>();
    for (const p of problemas) agrupados.set(p, (agrupados.get(p) ?? 0) + 1);
    for (const [m, qtd] of agrupados) console.log(`  [${qtd}x] ${m}`);
  }

  // remove duplicatas exatas (mesmo professor+turno+dia+aula aparecendo 2x na extração)
  const chaveUnica = new Set<string>();
  const semDuplicata = resolvidas.filter((r) => {
    const k = `${r.professorId}-${r.turno}-${r.dia}-${r.numeroAula}`;
    if (chaveUnica.has(k)) return false;
    chaveUnica.add(k);
    return true;
  });
  if (semDuplicata.length !== resolvidas.length) {
    console.log(`\n(${resolvidas.length - semDuplicata.length} duplicata(s) exata(s) removida(s) automaticamente)`);
  }

  const atuaisHA = await db.select().from(disponibilidadeTable).where(eq(disponibilidadeTable.horaAtividadeObrigatoria, true));

  console.log(`\nSerão REMOVIDAS todas as ${atuaisHA.length} linhas de HA atuais (aproximadas).`);
  console.log(`Serão INSERIDAS ${semDuplicata.length} linhas com posição exata do PDF.`);

  if (problemas.length > 0) {
    console.log("\nATENÇÃO: existem problemas de mapeamento acima. Revise antes de confirmar.");
  }

  const resp = await perguntar("\nAplicar agora? (digite 'sim' para confirmar) ");
  if (resp.trim().toLowerCase() !== "sim") {
    console.log("Cancelado -- nada foi alterado.");
    process.exit(0);
  }

  await db.transaction(async (tx) => {
    await tx.delete(disponibilidadeTable).where(eq(disponibilidadeTable.horaAtividadeObrigatoria, true));
    await tx.insert(disponibilidadeTable).values(
      semDuplicata.map((r) => ({
        professorId: r.professorId,
        turno: r.turno,
        diaSemana: r.dia,
        horarioSlot: r.numeroAula,
        disponivel: true,
        horaAtividadeObrigatoria: true,
        motivo: MOTIVO,
      })),
    );
  });

  console.log(`\nPronto! HA substituída pela posição exata do PDF (${semDuplicata.length} linhas).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
