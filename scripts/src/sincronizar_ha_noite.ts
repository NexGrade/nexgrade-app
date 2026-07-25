// Script pontual — sincroniza a Hora-Atividade institucional do turno
// NOTURNO com a grade real da escola (PDF 22/06 a 26/06), corrigindo
// qualquer HA que os scripts automáticos anteriores tenham "adivinhado"
// errado, e adicionando as que realmente existem na grade mas não
// tinham sido marcadas.
//
// Fonte: 34 células "HA" extraídas diretamente do CSV real enviado.
// Não mexe em bloqueios (disponivel=false) nem em nada fora de HA.
//
// Como rodar:
//   pnpm --filter @workspace/scripts exec tsx src/sincronizar_ha_noite.ts

import { db, pool } from "@workspace/db";
import { professoresTable, disponibilidadeTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const ESCOLA_ID = "escola_default";
const TURNO = "noturno";

// (nome no CSV real, diaSemana 0-4, numeroAula 1-5) -- extraído
// diretamente da grade real 22/06 a 26/06.
const HA_REAL: Array<[string, number, number]> = [
  ["ANDERSON", 1, 3], ["ANDERSON", 1, 5], ["ANDERSON", 2, 3],
  ["ANTONIO SILVA", 1, 3], ["ANTONIO SILVA", 1, 4], ["ANTONIO SILVA", 3, 2], ["ANTONIO SILVA", 3, 3],
  ["ARNALDO", 3, 3], ["ARNALDO", 3, 4],
  ["CLEIDE", 1, 4],
  ["DAIANE", 2, 1], ["DAIANE", 2, 4],
  ["DORIVAL", 0, 4], ["DORIVAL", 0, 5],
  ["ELIANE", 2, 1], ["ELIANE", 2, 2],
  ["ELISANGELA", 0, 3], ["ELISANGELA", 0, 4], ["ELISANGELA", 1, 3],
  ["FELIPE", 0, 1], ["FELIPE", 0, 5],
  ["GEVERSON", 3, 5],
  ["GLEICIANE", 4, 3],
  ["IVETE", 0, 3], ["IVETE", 0, 4],
  ["ROBERVAL", 0, 1], ["ROBERVAL", 0, 3], ["ROBERVAL", 3, 1], ["ROBERVAL", 3, 2],
  ["RODRIGO", 2, 4],
  ["TIAGO", 0, 3], ["TIAGO", 4, 2],
  ["WILLIAN", 0, 4], ["WILLIAN", 0, 5],
];

// Profissionais que aparecem na grade noturna mas SEM nenhuma célula de
// HA marcada nela (0 entradas em HA_REAL) -- registrados aqui só pra
// deixar explícito que a ausência é intencional (conferida no CSV, não
// esquecida), não um professor que ficou de fora sem querer.
const SEM_HA_NO_CSV = ["CARLOS", "GEVERSON" /* só 1 HA, já coberto */, "HIBRIDA-1NB", "HIBRIDA-2NB", "HIBRIDA-2NC", "JOÃO LUCAS", "SONEIDE", "SYPRIANO", "VIVIANE"];

async function buscarProfessorPorNome(nomeCsv: string) {
  // Normaliza: nossos placeholders usam "Híbrida (1NB)" etc; os demais
  // batem por nome (case-insensitive), com pequenos ajustes conhecidos.
  const mapaEspecial: Record<string, string> = {
    "HIBRIDA-1NB": "Híbrida (1NB)",
    "HIBRIDA-2NB": "Híbrida (2NB)",
    "HIBRIDA-2NC": "Híbrida (2NC)",
  };
  const nomeAlvo = mapaEspecial[nomeCsv] ?? nomeCsv;

  const todos = await db.select().from(professoresTable).where(eq(professoresTable.escolaId, ESCOLA_ID));
  const exato = todos.find((p) => p.nome.toLowerCase() === nomeAlvo.toLowerCase());
  if (exato) return exato;
  // fallback: começa com o mesmo nome (cobre "Eliane" vs "Eliane Rocha", etc.)
  const parcial = todos.filter((p) => p.nome.toLowerCase().startsWith(nomeAlvo.toLowerCase()));
  if (parcial.length === 1) return parcial[0];
  return null;
}

async function main() {
  console.log("🔧 Sincronizando HA institucional do turno NOTURNO com a grade real...\n");

  const porProfessor = new Map<string, Array<[number, number]>>();
  HA_REAL.forEach(([nome, dia, aula]) => {
    if (!porProfessor.has(nome)) porProfessor.set(nome, []);
    porProfessor.get(nome)!.push([dia, aula]);
  });

  let adicionadas = 0;
  let removidasErradas = 0;
  const naoEncontrados: string[] = [];
  const ambiguos: string[] = [];

  for (const [nomeCsv, haReaisDoProf] of porProfessor) {
    const professor = await buscarProfessorPorNome(nomeCsv);
    if (!professor) {
      naoEncontrados.push(nomeCsv);
      continue;
    }

    const existentes = await db.select().from(disponibilidadeTable)
      .where(and(eq(disponibilidadeTable.professorId, professor.id), eq(disponibilidadeTable.turno, TURNO)));

    const haReaisSet = new Set(haReaisDoProf.map(([d, a]) => `${d}-${a}`));

    // Remove HA marcada que NÃO bate com a realidade (provavelmente
    // vinda do preenchimento automático anterior, que só adivinhava).
    for (const row of existentes) {
      if (!row.horaAtividadeObrigatoria) continue;
      const chave = `${row.diaSemana}-${row.horarioSlot}`;
      if (!haReaisSet.has(chave)) {
        await db.delete(disponibilidadeTable).where(eq(disponibilidadeTable.id, row.id));
        removidasErradas++;
      }
    }

    // Adiciona (ou corrige pra HA) o que é real e ainda não está certo.
    for (const [dia, aula] of haReaisDoProf) {
      const jaExiste = existentes.find((r) => r.diaSemana === dia && r.horarioSlot === aula);
      if (jaExiste) {
        if (!jaExiste.horaAtividadeObrigatoria) {
          await db.update(disponibilidadeTable)
            .set({ horaAtividadeObrigatoria: true, disponivel: true, motivo: "HA real confirmada na grade 22/06-26/06" })
            .where(eq(disponibilidadeTable.id, jaExiste.id));
          adicionadas++;
        }
        // se já existe e já é HA, não faz nada
      } else {
        await db.insert(disponibilidadeTable).values({
          professorId: professor.id,
          diaSemana: dia,
          horarioSlot: aula,
          disponivel: true,
          turno: TURNO,
          horaAtividadeObrigatoria: true,
          motivo: "HA real confirmada na grade 22/06-26/06",
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
