// Script pontual — auditoria final: garante que TODAS as HA reais
// confirmadas diretamente nas tabelas do PDF (bordas de grade reais,
// nomes já corrigidos onde havia troca confirmada) estejam marcadas na
// disponibilidade, nos 3 turnos. Só ADICIONA o que falta -- não apaga
// nada (a limpeza de HA erradas já foi feita nos scripts anteriores).
//
// Isso cobre o caso de slots que ficaram "vagos" na tela de
// Disponibilidade quando deveriam estar marcados como HA.
//
// Como rodar:
//   pnpm --filter @workspace/scripts exec tsx src/completar_ha_final.ts

import { db, pool } from "@workspace/db";
import { professoresTable, disponibilidadeTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const ESCOLA_ID = "escola_default";

const HA_MANHA: Array<[string, number, number]> = [
  ["ALINE", 0, 1],
  ["ALINE", 2, 1],
  ["ALINE", 2, 3],
  ["ALINE", 4, 3],
  ["ALINE", 4, 6],
  ["ANDERSON", 0, 3],
  ["ANDERSON", 1, 3],
  ["ANDERSON", 1, 4],
  ["ANDERSON", 1, 5],
  ["ANDRE", 0, 1],
  ["ANDRE", 0, 5],
  ["ANDRE", 0, 6],
  ["ANDRE", 3, 5],
  ["ANDRE", 4, 3],
  ["ARNALDO", 3, 3],
  ["ARNALDO", 4, 3],
  ["CECILIA", 2, 3],
  ["CECILIA", 2, 4],
  ["CESAR", 4, 4],
  ["CHRYSTIAN", 1, 3],
  ["CHRYSTIAN", 1, 5],
  ["CHRYSTIAN", 3, 1],
  ["CHRYSTIAN", 3, 3],
  ["CLEIDE", 0, 6],
  ["CLEIDE", 1, 3],
  ["CLEIDE", 2, 1],
  ["CLEIDE", 2, 4],
  ["CRISLAINE", 1, 2],
  ["CRISLAINE", 1, 4],
  ["CRISLAINE", 1, 5],
  ["CRISLAINE", 2, 2],
  ["CRISLAINE", 2, 4],
  ["CRISLAINE", 3, 3],
  ["CRISLAINE", 4, 4],
  ["CRISTIANE", 0, 1],
  ["CRISTIANE", 0, 6],
  ["CRISTIANE", 1, 6],
  ["CRISTIANE", 2, 1],
  ["CRISTIANE", 3, 1],
  ["CRISTIANE", 4, 6],
  ["DORIVAL", 0, 2],
  ["DORIVAL", 0, 3],
  ["DORIVAL", 0, 6],
  ["DORIVAL", 1, 3],
  ["DORIVAL", 3, 5],
  ["DORIVAL", 3, 6],
  ["EDNILSON", 2, 2],
  ["EDNILSON", 3, 4],
  ["EDNILSON", 4, 4],
  ["EDNILSON", 4, 5],
  ["EDUARDA", 1, 5],
  ["EDUARDA", 4, 5],
  ["ELIANA", 0, 6],
  ["ELIANA", 1, 6],
  ["ELIANA", 2, 6],
  ["ELIANE ROCHA", 1, 3],
  ["ELIANE ROCHA", 1, 6],
  ["ELIANE ROCHA", 3, 6],
  ["ELISABETE", 1, 4],
  ["ELISABETE", 2, 1],
  ["ELISABETE", 2, 2],
  ["ELISABETE", 3, 5],
  ["ELISABETE", 4, 3],
  ["ELISANGELA", 0, 6],
  ["ELISANGELA", 1, 6],
  ["EMANUELE", 1, 3],
  ["EMANUELE", 1, 4],
  ["EMANUELE", 1, 5],
  ["EMANUELE", 2, 2],
  ["EMANUELE", 4, 1],
  ["EMANUELE", 4, 2],
  ["FERNANDA", 0, 2],
  ["FERNANDA", 0, 4],
  ["FERNANDA", 1, 2],
  ["FERNANDA", 3, 4],
  ["FERNANDA", 4, 3],
  ["FRANCIELE DE ASSIS", 0, 4],
  ["FRANCIELE DE ASSIS", 1, 1],
  ["FRANCIELE DE ASSIS", 1, 5],
  ["FRANCIELLE", 0, 1],
  ["GABRIELA", 0, 3],
  ["GABRIELA", 1, 2],
  ["GABRIELA", 3, 3],
  ["GABRIELA", 4, 3],
  ["GABRIELA", 4, 5],
  ["GEOVANI", 2, 4],
  ["GEOVANI", 3, 2],
  ["GEOVANI", 3, 4],
  ["GEVERSON", 0, 3],
  ["GEVERSON", 0, 6],
  ["GEVERSON", 4, 2],
  ["GEVERSON", 4, 4],
  ["GLEICIANE", 0, 2],
  ["GLEICIANE", 0, 5],
  ["GLEICIANE", 1, 4],
  ["GLEICIANE", 4, 4],
  ["GUSTAVO", 0, 3],
  ["GUSTAVO", 0, 5],
  ["GUSTAVO", 1, 3],
  ["GUSTAVO", 1, 4],
  ["GUSTAVO", 3, 5],
  ["HEBERTON", 1, 4],
  ["HEBERTON", 1, 6],
  ["HEBERTON", 2, 6],
  ["HEBERTON", 3, 6],
  ["HEBERTON", 4, 4],
  ["HEBERTON", 4, 6],
  ["HEMELLY", 2, 2],
  ["HEMELLY", 2, 3],
  ["HERICA", 1, 6],
  ["HERICA", 4, 6],
  ["IONE", 0, 2],
  ["IONE", 0, 5],
  ["IONE", 0, 6],
  ["IVANIR", 0, 3],
  ["IVANIR", 3, 2],
  ["IVANIR", 4, 5],
  ["IVANIR", 4, 6],
  ["JACKSON", 3, 3],
  ["JACKSON", 4, 2],
  ["JORDANA", 3, 4],
  ["JORDANA", 4, 3],
  ["JOÃO LUCAS", 0, 2],
  ["JOÃO LUCAS", 0, 5],
  ["JOÃO LUCAS", 2, 2],
  ["JOÃO LUCAS", 2, 4],
  ["JULIANA", 1, 1],
  ["JULIANA", 3, 3],
  ["JULIO", 0, 2],
  ["JULIO", 0, 5],
  ["JULIO", 2, 3],
  ["JULIO", 2, 4],
  ["JULIO", 3, 3],
  ["KETHELIN", 2, 3],
  ["KETHELIN", 3, 2],
  ["KETHELIN", 3, 4],
  ["KETHELIN", 4, 5],
  ["LORENA", 0, 4],
  ["LORENA", 1, 3],
  ["LORENA", 2, 4],
  ["LORENA", 4, 3],
  ["LORENA", 4, 5],
  ["LUIS FERNANDO", 2, 5],
  ["MARIO", 2, 3],
  ["MARIO", 4, 4],
  ["MARISE", 0, 2],
  ["MARISE", 1, 3],
  ["MARISE", 1, 4],
  ["MARISTELA", 1, 4],
  ["MARISTELA", 1, 5],
  ["MARISTELA", 2, 5],
  ["MARISTELA", 3, 4],
  ["MARISTELA", 4, 2],
  ["MATHEUS", 0, 6],
  ["MATHEUS", 1, 5],
  ["MATHEUS", 1, 6],
  ["MATHEUS", 2, 6],
  ["PEDRO", 2, 1],
  ["PEDRO", 2, 2],
  ["PRISCILA", 0, 3],
  ["PRISCILA", 1, 2],
  ["PRISCILA", 2, 3],
  ["RAFAEL", 1, 4],
  ["RICARDO", 2, 1],
  ["RICARDO", 2, 2],
  ["RICARDO", 2, 6],
  ["RICARDO", 3, 6],
  ["ROBERVAL", 2, 6],
  ["ROBSON", 0, 4],
  ["ROBSON", 0, 5],
  ["RODRIGO", 0, 4],
  ["RODRIGO", 0, 5],
  ["RODRIGO", 1, 3],
  ["RODRIGO", 3, 2],
  ["RODRIGO", 3, 4],
  ["SALETE", 0, 2],
  ["SALETE", 0, 5],
  ["SALETE", 1, 5],
  ["SALETE", 2, 3],
  ["SALETE", 4, 4],
  ["SILMARA", 0, 4],
  ["SILMARA", 1, 4],
  ["SILMARA", 2, 4],
  ["SILMARA", 3, 4],
  ["SILMARA", 4, 4],
  ["SIMONE", 0, 3],
  ["SIMONE", 0, 4],
  ["SONEIDE", 1, 3],
  ["SONEIDE", 1, 6],
  ["SONEIDE", 3, 5],
  ["SYPRIANO", 0, 4],
  ["SYPRIANO", 1, 4],
  ["SYPRIANO", 2, 5],
  ["VIVIANE", 1, 2],
  ["VIVIANE", 2, 3],
  ["VIVIANE", 2, 5],];

const HA_TARDE: Array<[string, number, number]> = [
  ["ANDERSON", 1, 4],
  ["ANDERSON", 3, 1],
  ["ANDERSON", 4, 3],
  ["ANDERSON", 4, 4],
  ["ANDRE", 0, 3],
  ["ANDREIA", 2, 1],
  ["ANDREIA", 2, 3],
  ["ANDREIA", 3, 2],
  ["ANDREIA", 3, 3],
  ["ANDREIA", 4, 2],
  ["ANTONIO SILVA", 2, 2],
  ["CLAIR", 1, 3],
  ["CLAIR", 2, 1],
  ["CLAIR", 2, 2],
  ["CRISTIANE", 1, 2],
  ["CRISTIANE", 4, 2],
  ["DAIANE", 0, 2],
  ["DAIANE", 0, 3],
  ["DAIANE", 1, 2],
  ["DAIANE", 2, 2],
  ["DAIANE", 4, 3],
  ["DORIVAL", 0, 2],
  ["DORIVAL", 0, 4],
  ["EDNILSON", 4, 3],
  ["EDUARDA", 0, 2],
  ["EDUARDA", 0, 3],
  ["EDUARDA", 3, 3],
  ["EDUARDA", 3, 4],
  ["EDUARDO", 0, 3],
  ["EDUARDO", 0, 4],
  ["EDUARDO", 0, 5],
  ["EDUARDO", 2, 3],
  ["EDUARDO", 2, 4],
  ["EDUARDO", 2, 5],
  ["ELECIANA", 2, 2],
  ["ELECIANA", 2, 4],
  ["ELECIANA", 3, 2],
  ["ELIANE ROCHA", 2, 3],
  ["ELIANE ROCHA", 2, 4],
  ["ELIANE ROCHA", 2, 5],
  ["ELISANGELA", 2, 1],
  ["ELISANGELA", 2, 2],
  ["ELISANGELA", 2, 3],
  ["EMANUELE", 0, 4],
  ["EMANUELE", 2, 3],
  ["EMANUELE", 2, 4],
  ["FRANCIELE DE ASSIS", 0, 1],
  ["FRANCIELE DE ASSIS", 1, 1],
  ["FRANCIELE DE ASSIS", 3, 2],
  ["FRANCIELE DE ASSIS", 3, 4],
  ["FRANCIELE DE ASSIS", 4, 4],
  ["GABRIELA", 1, 3],
  ["GABRIELA", 1, 4],
  ["GABRIELA", 4, 2],
  ["GABRIELA", 4, 3],
  ["GABRIELA", 4, 5],
  ["GEVERSON", 2, 3],
  ["GEVERSON", 3, 3],
  ["GEVERSON", 3, 4],
  ["HEBERTON", 2, 1],
  ["HERICA", 1, 5],
  ["HERICA", 4, 5],
  ["IVANIR", 0, 2],
  ["IVANIR", 2, 3],
  ["IVANIR", 2, 4],
  ["IVANIR", 2, 5],
  ["IVANIR", 3, 3],
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
  ["LUCIANE", 1, 5],
  ["LUCIANE", 3, 5],
  ["MARCIO", 0, 2],
  ["MARCIO", 1, 2],
  ["MARCIO", 1, 3],
  ["MARCIO", 4, 2],
  ["MARIO", 3, 2],
  ["MARIO", 3, 3],
  ["MARIO", 4, 1],
  ["MARIO", 4, 2],
  ["MARIO", 4, 4],
  ["MARISE", 1, 3],
  ["MARISE", 1, 4],
  ["MARISE", 3, 2],
  ["MARISE", 3, 4],
  ["MARISE", 4, 4],
  ["MARISTELA", 0, 2],
  ["MARISTELA", 1, 3],
  ["MARISTELA", 2, 2],
  ["MARISTELA", 3, 3],
  ["MARISTELA", 3, 4],
  ["MARLETE", 0, 2],
  ["MARLETE", 0, 5],
  ["MARTA", 0, 2],
  ["MARTA", 0, 3],
  ["MARTA", 4, 1],
  ["MARTA", 4, 2],
  ["MARTA", 4, 3],
  ["MATHEUS", 0, 3],
  ["MATHEUS", 3, 1],
  ["MATHEUS", 3, 2],
  ["MATHEUS", 3, 5],
  ["MELINA", 2, 1],
  ["MELINA", 3, 2],
  ["NELSON", 0, 5],
  ["NELSON", 1, 2],
  ["NELSON", 1, 4],
  ["NELSON", 1, 5],
  ["NELSON", 4, 1],
  ["PATRICIA", 1, 5],
  ["PAULO", 2, 5],
  ["PEDRO", 0, 3],
  ["PEDRO", 1, 3],
  ["PEDRO", 3, 3],
  ["PRISCILA", 0, 4],
  ["RAFAEL", 0, 4],
  ["RAFAEL", 1, 4],
  ["ROBSON", 1, 4],
  ["SILMARA", 1, 2],
  ["SILMARA", 1, 4],
  ["SILMARA", 2, 3],
  ["SILMARA", 2, 4],
  ["SILMARA", 3, 3],
  ["SONEIDE", 0, 5],
  ["SONEIDE", 1, 5],
  ["SONEIDE", 3, 5],
  ["SYPRIANO", 1, 1],
  ["SYPRIANO", 1, 2],
  ["SYPRIANO", 4, 2],
  ["SYPRIANO", 4, 4],
  ["WELLINGTON", 0, 1],
  ["WELLINGTON", 1, 1],
  ["WELLINGTON", 2, 1],
  ["WEREDIANA", 0, 3],
  ["WEREDIANA", 3, 3],];

const HA_NOITE: Array<[string, number, number]> = [
  ["ANDERSON", 1, 3],
  ["ANDERSON", 1, 5],
  ["ANDERSON", 2, 3],
  ["ANTONIO SILVA", 1, 3],
  ["ANTONIO SILVA", 1, 4],
  ["ANTONIO SILVA", 3, 2],
  ["ANTONIO SILVA", 3, 3],
  ["ARNALDO", 3, 3],
  ["ARNALDO", 3, 4],
  ["CLEIDE", 1, 4],
  ["DAIANE", 2, 1],
  ["DAIANE", 2, 4],
  ["DORIVAL", 0, 4],
  ["DORIVAL", 0, 5],
  ["ELIANE", 2, 1],
  ["ELIANE", 2, 2],
  ["ELISANGELA", 0, 3],
  ["ELISANGELA", 0, 4],
  ["ELISANGELA", 1, 3],
  ["FELIPE", 0, 1],
  ["FELIPE", 0, 5],
  ["GEVERSON", 3, 5],
  ["GLEICIANE", 4, 3],
  ["IVETE", 0, 3],
  ["IVETE", 0, 4],
  ["ROBERVAL", 0, 1],
  ["ROBERVAL", 0, 3],
  ["ROBERVAL", 3, 1],
  ["ROBERVAL", 3, 2],
  ["RODRIGO", 2, 4],
  ["TIAGO", 0, 3],
  ["TIAGO", 4, 2],
  ["WILLIAN", 0, 4],
  ["WILLIAN", 0, 5],  // Slot 18:00 (numeroAula=0), confirmado por coordenadas, ja tratado
  // em script anterior -- incluido aqui so por completude/idempotencia.
  ["ANTONIO SILVA", 1, 0],
  ["ELIANE", 2, 0],
  ["ELIANE", 3, 0],
];

const TURNOS: Array<{ nome: string; turno: string; dados: Array<[string, number, number]> }> = [
  { nome: "MANHÃ", turno: "matutino", dados: HA_MANHA },
  { nome: "TARDE", turno: "vespertino", dados: HA_TARDE },
  { nome: "NOITE", turno: "noturno", dados: HA_NOITE },
];

async function buscarProfessorPorNome(todos: typeof professoresCache, nomePdf: string) {
  const exato = todos.find((p) => p.nome.toLowerCase() === nomePdf.toLowerCase());
  if (exato) return exato;
  const parcial = todos.filter((p) => p.nome.toLowerCase().startsWith(nomePdf.toLowerCase()));
  if (parcial.length === 1) return parcial[0];
  return null;
}

let professoresCache: Awaited<ReturnType<typeof carregarProfessores>>;
async function carregarProfessores() {
  return db.select().from(professoresTable).where(eq(professoresTable.escolaId, ESCOLA_ID));
}

async function main() {
  console.log("🔧 Auditoria final de HA — completando o que ainda falta nos 3 turnos...\n");
  professoresCache = await carregarProfessores();

  let totalAdicionadas = 0;
  const naoEncontrados = new Set<string>();

  for (const { nome, turno, dados } of TURNOS) {
    const porProfessor = new Map<string, Array<[number, number]>>();
    dados.forEach(([nomeP, dia, aula]) => {
      if (!porProfessor.has(nomeP)) porProfessor.set(nomeP, []);
      porProfessor.get(nomeP)!.push([dia, aula]);
    });

    let adicionadasTurno = 0;
    for (const [nomePdf, celulas] of porProfessor) {
      const professor = await buscarProfessorPorNome(professoresCache, nomePdf);
      if (!professor) {
        naoEncontrados.add(`${nomePdf} (${turno})`);
        continue;
      }

      const existentes = await db.select().from(disponibilidadeTable)
        .where(and(eq(disponibilidadeTable.professorId, professor.id), eq(disponibilidadeTable.turno, turno)));

      for (const [dia, aula] of celulas) {
        const jaExiste = existentes.find((r) => r.diaSemana === dia && r.horarioSlot === aula);
        if (jaExiste) {
          if (!jaExiste.horaAtividadeObrigatoria) {
            await db.update(disponibilidadeTable)
              .set({ horaAtividadeObrigatoria: true, disponivel: true, motivo: "HA real confirmada (auditoria final, grade 22/06-26/06)" })
              .where(eq(disponibilidadeTable.id, jaExiste.id));
            adicionadasTurno++;
          }
        } else {
          await db.insert(disponibilidadeTable).values({
            professorId: professor.id,
            diaSemana: dia,
            horarioSlot: aula,
            disponivel: true,
            turno,
            horaAtividadeObrigatoria: true,
            motivo: "HA real confirmada (auditoria final, grade 22/06-26/06)",
          });
          adicionadasTurno++;
        }
      }
    }
    console.log(`✅ ${nome}: ${adicionadasTurno} HA adicionada(s)/corrigida(s)`);
    totalAdicionadas += adicionadasTurno;
  }

  console.log(`\n📊 Total: ${totalAdicionadas} HA adicionada(s)/corrigida(s) no geral.`);
  if (naoEncontrados.size > 0) {
    console.log(`\n⚠️  Não encontrei professor pra: ${[...naoEncontrados].join(", ")}`);
  }
  console.log("\n🎉 Concluído.");
  await pool.end();
}

main().catch((err) => {
  console.error("❌ Erro:", err);
  process.exit(1);
});
