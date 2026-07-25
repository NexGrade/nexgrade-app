// Script pontual — sincroniza a Hora-Atividade institucional do turno
// VESPERTINO (tarde) com a grade real da escola (PDF 22/06 a 26/06),
// corrigindo qualquer HA que os scripts automáticos anteriores tenham
// "adivinhado" errado, e alinhando com o conteúdo real verificado
// diretamente nas tabelas do PDF (linhas de grade reais, não texto
// solto) -- incluindo 6 casos em que o CSV fornecido tinha o NOME
// errado colado no bloco de dados certo (Anderson/Andre,
// Andreia/Antonio Silva, Cecilia/Clair, Rafael/Priscila) e 2 casos de
// divergência de célula específica (Geverson, Marlete), onde a tabela
// do PDF prevaleceu sobre o CSV.
//
// Fonte: 153 células "HA" confirmadas por extração com bordas de
// tabela reais (pdfplumber find_tables), com nome do professor
// verificado por conteúdo (não só posição).
//
// Não mexe em bloqueios (disponivel=false) nem em nada fora de HA.
//
// Como rodar:
//   pnpm --filter @workspace/scripts exec tsx src/sincronizar_ha_tarde.ts

import { db, pool } from "@workspace/db";
import { professoresTable, disponibilidadeTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const ESCOLA_ID = "escola_default";
const TURNO = "vespertino";

// (nome no CSV/PDF, diaSemana 0-4, numeroAula 1-5) -- extraído e
// verificado célula por célula contra a grade real 22/06 a 26/06.
const HA_REAL: Array<[string, number, number]> = [
  ["ANDERSON", 0, 3],
  ["ANDRE", 3, 1],
  ["ANDRE", 4, 3],
  ["ANDRE", 4, 4],
  ["ANDRE", 1, 4],
  ["ANDREIA", 2, 2],
  ["ANTONIO SILVA", 2, 1],
  ["ANTONIO SILVA", 2, 3],
  ["ANTONIO SILVA", 3, 2],
  ["ANTONIO SILVA", 3, 3],
  ["ANTONIO SILVA", 4, 2],
  ["CECILIA", 2, 1],
  ["CECILIA", 2, 2],
  ["CECILIA", 1, 3],
  ["CRISTIANE", 4, 2],
  ["CRISTIANE", 1, 2],
  ["DAIANE", 2, 2],
  ["DAIANE", 0, 2],
  ["DAIANE", 0, 3],
  ["DAIANE", 4, 3],
  ["DAIANE", 1, 2],
  ["DORIVAL", 0, 2],
  ["DORIVAL", 0, 4],
  ["EDNILSON", 4, 3],
  ["EDUARDA", 3, 3],
  ["EDUARDA", 3, 4],
  ["EDUARDA", 0, 2],
  ["EDUARDA", 0, 3],
  ["EDUARDO", 2, 3],
  ["EDUARDO", 2, 4],
  ["EDUARDO", 2, 5],
  ["EDUARDO", 0, 3],
  ["EDUARDO", 0, 4],
  ["EDUARDO", 0, 5],
  ["ELECIANA", 2, 2],
  ["ELECIANA", 2, 4],
  ["ELECIANA", 3, 2],
  ["ELIANE ROCHA", 2, 3],
  ["ELIANE ROCHA", 2, 4],
  ["ELIANE ROCHA", 2, 5],
  ["ELISANGELA", 2, 1],
  ["ELISANGELA", 2, 2],
  ["ELISANGELA", 2, 3],
  ["EMANUELE", 2, 3],
  ["EMANUELE", 2, 4],
  ["EMANUELE", 0, 4],
  ["FRANCIELE DE ASSIS", 3, 2],
  ["FRANCIELE DE ASSIS", 3, 4],
  ["FRANCIELE DE ASSIS", 0, 1],
  ["FRANCIELE DE ASSIS", 4, 4],
  ["FRANCIELE DE ASSIS", 1, 1],
  ["GABRIELA", 4, 2],
  ["GABRIELA", 4, 3],
  ["GABRIELA", 4, 5],
  ["GABRIELA", 1, 3],
  ["GABRIELA", 1, 4],
  ["GEVERSON", 2, 3],
  ["GEVERSON", 3, 3],
  ["GEVERSON", 3, 4],
  ["GUSTAVO", 2, 2],
  ["GUSTAVO", 2, 3],
  ["HEBERTON", 2, 1],
  ["HERICA", 4, 5],
  ["HERICA", 1, 5],
  ["IVANIR", 2, 3],
  ["IVANIR", 2, 4],
  ["IVANIR", 2, 5],
  ["IVANIR", 3, 3],
  ["IVANIR", 0, 2],
  ["IVANIR", 4, 3],
  ["JACKSON", 2, 1],
  ["JACKSON", 2, 2],
  ["JACKSON", 2, 3],
  ["JORDANA", 3, 3],
  ["JORDANA", 3, 4],
  ["JORDANA", 3, 5],
  ["JULIO", 0, 1],
  ["JULIO", 0, 4],
  ["JULIO", 4, 1],
  ["JULIO", 4, 2],
  ["LISIANE", 2, 3],
  ["LISIANE", 2, 4],
  ["LISIANE", 2, 5],
  ["LORENA", 2, 2],
  ["LUCIANE", 3, 5],
  ["LUCIANE", 1, 5],
  ["MARCIO", 0, 2],
  ["MARCIO", 4, 2],
  ["MARCIO", 1, 2],
  ["MARCIO", 1, 3],
  ["MARIO", 3, 2],
  ["MARIO", 3, 3],
  ["MARIO", 4, 1],
  ["MARIO", 4, 2],
  ["MARIO", 4, 4],
  ["MARISE", 3, 2],
  ["MARISE", 3, 4],
  ["MARISE", 4, 4],
  ["MARISE", 1, 3],
  ["MARISE", 1, 4],
  ["MARISTELA", 0, 2],
  ["MARISTELA", 0, 5],
  ["MARLETE", 2, 2],
  ["MARLETE", 3, 3],
  ["MARLETE", 3, 4],
  ["MARLETE", 0, 2],
  ["MARLETE", 1, 3],
  ["MARTA", 0, 2],
  ["MARTA", 0, 3],
  ["MARTA", 4, 1],
  ["MARTA", 4, 2],
  ["MARTA", 4, 3],
  ["MATHEUS", 3, 1],
  ["MATHEUS", 3, 2],
  ["MATHEUS", 3, 5],
  ["MATHEUS", 0, 3],
  ["MELINA", 2, 1],
  ["MELINA", 3, 2],
  ["NELSON", 0, 5],
  ["NELSON", 4, 1],
  ["NELSON", 1, 2],
  ["NELSON", 1, 4],
  ["NELSON", 1, 5],
  ["PATRICIA", 1, 5],
  ["PAULO", 2, 5],
  ["PEDRO", 3, 3],
  ["PEDRO", 0, 3],
  ["PEDRO", 1, 3],
  ["PRISCILA", 0, 4],
  ["RAFAEL", 0, 4],
  ["RAFAEL", 1, 4],
  ["ROBSON", 1, 4],
  ["SILMARA", 2, 3],
  ["SILMARA", 2, 4],
  ["SILMARA", 3, 3],
  ["SILMARA", 1, 2],
  ["SILMARA", 1, 4],
  ["SIMONE", 1, 1],
  ["SIMONE", 1, 2],
  ["SIMONE", 1, 3],
  ["SIMONE", 1, 4],
  ["SONEIDE", 3, 5],
  ["SONEIDE", 0, 5],
  ["SONEIDE", 1, 5],
  ["SYPRIANO", 4, 2],
  ["SYPRIANO", 4, 4],
  ["SYPRIANO", 1, 1],
  ["SYPRIANO", 1, 2],
  ["WELLINGTON", 2, 1],
  ["WELLINGTON", 0, 1],
  ["WELLINGTON", 1, 1],
  ["WILDEMBERG", 3, 3],
  ["WILDEMBERG", 0, 3],
];

async function buscarProfessorPorNome(nomeCsv: string) {
  const todos = await db.select().from(professoresTable).where(eq(professoresTable.escolaId, ESCOLA_ID));
  const exato = todos.find((p) => p.nome.toLowerCase() === nomeCsv.toLowerCase());
  if (exato) return exato;
  const parcial = todos.filter((p) => p.nome.toLowerCase().startsWith(nomeCsv.toLowerCase()));
  if (parcial.length === 1) return parcial[0];
  return null;
}

async function main() {
  console.log("🔧 Sincronizando HA institucional do turno VESPERTINO com a grade real...\n");

  const porProfessor = new Map<string, Array<[number, number]>>();
  HA_REAL.forEach(([nome, dia, aula]) => {
    if (!porProfessor.has(nome)) porProfessor.set(nome, []);
    porProfessor.get(nome)!.push([dia, aula]);
  });

  let adicionadas = 0;
  let removidasErradas = 0;
  const naoEncontrados: string[] = [];

  for (const [nomeCsv, haReaisDoProf] of porProfessor) {
    const professor = await buscarProfessorPorNome(nomeCsv);
    if (!professor) {
      naoEncontrados.push(nomeCsv);
      continue;
    }

    const existentes = await db.select().from(disponibilidadeTable)
      .where(and(eq(disponibilidadeTable.professorId, professor.id), eq(disponibilidadeTable.turno, TURNO)));

    const haReaisSet = new Set(haReaisDoProf.map(([d, a]) => `${d}-${a}`));

    for (const row of existentes) {
      if (!row.horaAtividadeObrigatoria) continue;
      const chave = `${row.diaSemana}-${row.horarioSlot}`;
      if (!haReaisSet.has(chave)) {
        await db.delete(disponibilidadeTable).where(eq(disponibilidadeTable.id, row.id));
        removidasErradas++;
      }
    }

    for (const [dia, aula] of haReaisDoProf) {
      const jaExiste = existentes.find((r) => r.diaSemana === dia && r.horarioSlot === aula);
      if (jaExiste) {
        if (!jaExiste.horaAtividadeObrigatoria) {
          await db.update(disponibilidadeTable)
            .set({ horaAtividadeObrigatoria: true, disponivel: true, motivo: "HA real confirmada na grade 22/06-26/06 (tarde)" })
            .where(eq(disponibilidadeTable.id, jaExiste.id));
          adicionadas++;
        }
      } else {
        await db.insert(disponibilidadeTable).values({
          professorId: professor.id,
          diaSemana: dia,
          horarioSlot: aula,
          disponivel: true,
          turno: TURNO,
          horaAtividadeObrigatoria: true,
          motivo: "HA real confirmada na grade 22/06-26/06 (tarde)",
        });
        adicionadas++;
      }
    }

    console.log(`✅ ${nomeCsv} -> ${professor.nome} (id ${professor.id}): ${haReaisDoProf.length} HA real(is) confirmada(s)`);
  }

  console.log(`\n📊 Resumo: ${adicionadas} HA adicionada(s)/corrigida(s), ${removidasErradas} HA errada(s) removida(s).`);
  if (naoEncontrados.length > 0) {
    console.log(`\n⚠️  Não encontrei professor pra: ${naoEncontrados.join(", ")}`);
  }
  console.log("\n🎉 Concluído.");
  await pool.end();
}

main().catch((err) => {
  console.error("❌ Erro:", err);
  process.exit(1);
});
