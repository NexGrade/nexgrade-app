// Script pontual — sincroniza a Hora-Atividade institucional do turno
// MATUTINO (manhã) com a grade real da escola (PDF 22/06 a 26/06),
// corrigindo qualquer HA que os scripts automáticos anteriores tenham
// "adivinhado" errado, e alinhando com o conteúdo real verificado
// diretamente nas tabelas do PDF (linhas de grade reais).
//
// 7 professores tinham um problema sistemático no CSV fornecido: a
// coluna "Segunda" vazia foi omitida em vez de mantida em branco,
// deslocando o resto da semana uma casa pra esquerda (Geovani,
// Hemelly, Maristela, Rafael, Sypriano, Viviane, Franciele de Assis)
// -- corrigido usando o conteúdo real da tabela do PDF.
//
// Fonte: 220 células "HA" confirmadas por extração com bordas de
// tabela reais (pdfplumber find_tables) + verificação manual de
// conteúdo pros 7 casos divergentes.
//
// Não mexe em bloqueios (disponivel=false) nem em nada fora de HA.
//
// Como rodar:
//   pnpm --filter @workspace/scripts exec tsx src/sincronizar_ha_manha.ts

import { db, pool } from "@workspace/db";
import { professoresTable, disponibilidadeTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const ESCOLA_ID = "escola_default";
const TURNO = "matutino";

// (nome no CSV/PDF, diaSemana 0-4, numeroAula 1-6) -- extraído e
// verificado célula por célula contra a grade real 22/06 a 26/06.
const HA_REAL: Array<[string, number, number]> = [
  ["ALINE", 2, 1],
  ["ALINE", 2, 3],
  ["ALINE", 0, 1],
  ["ALINE", 4, 3],
  ["ALINE", 4, 6],
  ["ANDERSON", 0, 3],
  ["ANDERSON", 1, 3],
  ["ANDERSON", 1, 4],
  ["ANDERSON", 1, 5],
  ["ANDRE", 3, 5],
  ["ANDRE", 0, 1],
  ["ANDRE", 0, 5],
  ["ANDRE", 0, 6],
  ["ANDRE", 4, 3],
  ["ARNALDO", 3, 3],
  ["ARNALDO", 4, 3],
  ["CECILIA", 2, 3],
  ["CECILIA", 2, 4],
  ["CESAR", 4, 4],
  ["CHRYSTIAN", 3, 1],
  ["CHRYSTIAN", 3, 3],
  ["CHRYSTIAN", 1, 3],
  ["CHRYSTIAN", 1, 5],
  ["CLEIDE", 2, 1],
  ["CLEIDE", 2, 4],
  ["CLEIDE", 0, 6],
  ["CLEIDE", 1, 3],
  ["CRISLAINE", 2, 2],
  ["CRISLAINE", 2, 4],
  ["CRISLAINE", 3, 3],
  ["CRISLAINE", 4, 4],
  ["CRISLAINE", 1, 2],
  ["CRISLAINE", 1, 4],
  ["CRISLAINE", 1, 5],
  ["CRISTIANE", 2, 1],
  ["CRISTIANE", 3, 1],
  ["CRISTIANE", 0, 1],
  ["CRISTIANE", 0, 6],
  ["CRISTIANE", 4, 6],
  ["CRISTIANE", 1, 6],
  ["DEBORA", 3, 4],
  ["DEBORA", 3, 5],
  ["DEBORA", 3, 6],
  ["DORIVAL", 3, 5],
  ["DORIVAL", 3, 6],
  ["DORIVAL", 0, 2],
  ["DORIVAL", 0, 3],
  ["DORIVAL", 0, 6],
  ["DORIVAL", 1, 3],
  ["EDNILSON", 2, 2],
  ["EDNILSON", 3, 4],
  ["EDNILSON", 4, 4],
  ["EDNILSON", 4, 5],
  ["EDUARDA", 2, 5],
  ["EDUARDA", 3, 6],
  ["EDUARDA", 4, 5],
  ["EDUARDA", 1, 5],
  ["EDUARDA", 1, 6],
  ["ELIANA", 2, 6],
  ["ELIANA", 0, 6],
  ["ELIANA", 1, 6],
  ["ELIANE ROCHA", 3, 6],
  ["ELIANE ROCHA", 1, 3],
  ["ELIANE ROCHA", 1, 6],
  ["ELISABETE", 2, 1],
  ["ELISABETE", 2, 2],
  ["ELISABETE", 3, 5],
  ["ELISABETE", 4, 3],
  ["ELISABETE", 1, 4],
  ["ELISANGELA", 0, 6],
  ["ELISANGELA", 1, 6],
  ["EMANUELE", 2, 2],
  ["EMANUELE", 4, 1],
  ["EMANUELE", 4, 2],
  ["EMANUELE", 1, 3],
  ["EMANUELE", 1, 4],
  ["EMANUELE", 1, 5],
  ["FERNANDA", 3, 4],
  ["FERNANDA", 0, 2],
  ["FERNANDA", 0, 4],
  ["FERNANDA", 4, 3],
  ["FERNANDA", 1, 2],
  ["FRANCIELE DE ASSIS", 0, 4],
  ["FRANCIELE DE ASSIS", 1, 1],
  ["FRANCIELE DE ASSIS", 1, 5],
  ["FRANCIELLE", 0, 1],
  ["GABRIELA", 3, 3],
  ["GABRIELA", 0, 3],
  ["GABRIELA", 4, 3],
  ["GABRIELA", 4, 5],
  ["GABRIELA", 1, 2],
  ["GEOVANI", 2, 4],
  ["GEOVANI", 3, 2],
  ["GEOVANI", 3, 4],
  ["GEVERSON", 0, 3],
  ["GEVERSON", 0, 6],
  ["GEVERSON", 4, 2],
  ["GEVERSON", 4, 4],
  ["GILBERTO", 4, 2],
  ["GILBERTO", 4, 3],
  ["GILBERTO", 4, 4],
  ["GLEICIANE", 0, 2],
  ["GLEICIANE", 0, 5],
  ["GLEICIANE", 4, 4],
  ["GLEICIANE", 1, 4],
  ["GUSTAVO", 3, 5],
  ["GUSTAVO", 0, 3],
  ["GUSTAVO", 0, 5],
  ["GUSTAVO", 1, 3],
  ["GUSTAVO", 1, 4],
  ["HEBERTON", 2, 6],
  ["HEBERTON", 3, 6],
  ["HEBERTON", 4, 4],
  ["HEBERTON", 4, 6],
  ["HEBERTON", 1, 4],
  ["HEBERTON", 1, 6],
  ["HEMELLY", 2, 2],
  ["HEMELLY", 2, 3],
  ["HERICA", 4, 6],
  ["HERICA", 1, 6],
  ["IONE", 0, 2],
  ["IONE", 0, 5],
  ["IONE", 0, 6],
  ["IVANIR", 3, 2],
  ["IVANIR", 0, 3],
  ["IVANIR", 4, 5],
  ["IVANIR", 4, 6],
  ["JACKSON", 3, 3],
  ["JACKSON", 4, 2],
  ["JORDANA", 3, 4],
  ["JORDANA", 4, 3],
  ["JOÃO LUCAS", 2, 2],
  ["JOÃO LUCAS", 2, 4],
  ["JOÃO LUCAS", 0, 2],
  ["JOÃO LUCAS", 0, 5],
  ["JULIANA", 3, 3],
  ["JULIANA", 1, 1],
  ["JULIO", 2, 3],
  ["JULIO", 2, 4],
  ["JULIO", 3, 3],
  ["JULIO", 0, 2],
  ["JULIO", 0, 5],
  ["KETHELIN", 2, 3],
  ["KETHELIN", 3, 2],
  ["KETHELIN", 3, 4],
  ["KETHELIN", 4, 5],
  ["LISIANE", 2, 1],
  ["LISIANE", 2, 2],
  ["LISIANE", 2, 3],
  ["LISIANE", 2, 4],
  ["LISIANE", 2, 5],
  ["LORENA", 2, 4],
  ["LORENA", 0, 4],
  ["LORENA", 4, 3],
  ["LORENA", 4, 5],
  ["LORENA", 1, 3],
  ["LUIS FERNANDO", 2, 5],
  ["MARIO", 2, 3],
  ["MARIO", 4, 4],
  ["MARISE", 0, 2],
  ["MARISE", 1, 3],
  ["MARISE", 1, 4],
  ["MARISTELA", 2, 5],
  ["MARISTELA", 3, 4],
  ["MARISTELA", 4, 2],
  ["MARISTELA", 1, 4],
  ["MARISTELA", 1, 5],
  ["MARTA", 0, 6],
  ["MATHEUS", 2, 6],
  ["MATHEUS", 0, 6],
  ["MATHEUS", 1, 5],
  ["MATHEUS", 1, 6],
  ["PEDRO", 2, 1],
  ["PEDRO", 2, 2],
  ["PRISCILA", 2, 3],
  ["PRISCILA", 0, 3],
  ["PRISCILA", 1, 2],
  ["RAFAEL", 4, 2],
  ["RAFAEL", 4, 3],
  ["RAFAEL", 4, 4],
  ["RAFAEL", 1, 2],
  ["RAFAEL", 1, 3],
  ["RAFAEL", 1, 4],
  ["RICARDO", 2, 1],
  ["RICARDO", 2, 2],
  ["RICARDO", 2, 6],
  ["RICARDO", 3, 6],
  ["ROBERVAL", 2, 6],
  ["ROBSON", 2, 3],
  ["ROBSON", 2, 4],
  ["ROBSON", 2, 5],
  ["ROBSON", 2, 6],
  ["ROBSON", 0, 4],
  ["ROBSON", 0, 5],
  ["RODRIGO", 3, 2],
  ["RODRIGO", 3, 4],
  ["RODRIGO", 0, 4],
  ["RODRIGO", 0, 5],
  ["RODRIGO", 1, 3],
  ["SALETE", 2, 3],
  ["SALETE", 0, 2],
  ["SALETE", 0, 5],
  ["SALETE", 4, 4],
  ["SALETE", 1, 5],
  ["SILMARA", 2, 4],
  ["SILMARA", 3, 4],
  ["SILMARA", 0, 4],
  ["SILMARA", 4, 4],
  ["SILMARA", 1, 4],
  ["SILVANA", 0, 3],
  ["SILVANA", 0, 4],
  ["SIMONE", 3, 5],
  ["SIMONE", 1, 3],
  ["SIMONE", 1, 6],
  ["SYPRIANO", 2, 5],
  ["SYPRIANO", 0, 4],
  ["SYPRIANO", 1, 4],
  ["VIVIANE", 2, 3],
  ["VIVIANE", 2, 5],
  ["VIVIANE", 1, 2],];

async function buscarProfessorPorNome(nomeCsv: string) {
  const todos = await db.select().from(professoresTable).where(eq(professoresTable.escolaId, ESCOLA_ID));
  const exato = todos.find((p) => p.nome.toLowerCase() === nomeCsv.toLowerCase());
  if (exato) return exato;
  const parcial = todos.filter((p) => p.nome.toLowerCase().startsWith(nomeCsv.toLowerCase()));
  if (parcial.length === 1) return parcial[0];
  return null;
}

async function main() {
  console.log("🔧 Sincronizando HA institucional do turno MATUTINO com a grade real...\n");

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
            .set({ horaAtividadeObrigatoria: true, disponivel: true, motivo: "HA real confirmada na grade 22/06-26/06 (manhã)" })
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
          motivo: "HA real confirmada na grade 22/06-26/06 (manhã)",
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
