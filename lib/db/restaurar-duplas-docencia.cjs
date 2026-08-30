// Restaura os pares de dupla docência na matriz curricular. A correção
// em massa anterior (corrigir-todas-divergencias-professor.cjs) só
// mantinha o professor "dominante" por combinação turma+disciplina,
// perdendo o segundo professor dos 6 pares reais de dupla docência em
// "Rec. Aprend. Matemática" (Julio Cesar + Juliana/Matheus Tavares).
// Este script adiciona de volta a linha que falta pra cada par.
//
// Uso:
//   node restaurar-duplas-docencia.cjs            → dry-run (ROLLBACK)
//   node restaurar-duplas-docencia.cjs --aplicar   → aplica de verdade (COMMIT)

const { Client } = require("pg");
const APLICAR = process.argv.includes("--aplicar");
const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";

// pares confirmados pela grade real: (turma, os dois professores)
const PARES = [
  { turma: "9MA", profs: ["Julio Cesar dos Santos", "Juliana"] },
  { turma: "9MB", profs: ["Julio Cesar dos Santos", "Juliana"] },
  { turma: "9MC", profs: ["Julio Cesar dos Santos", "Juliana"] },
  { turma: "9MD", profs: ["Julio Cesar dos Santos", "Juliana"] },
  { turma: "9ME", profs: ["Julio Cesar dos Santos", "Matheus Tavares"] },
  { turma: "9MF", profs: ["Julio Cesar dos Santos", "Matheus Tavares"] },
];
const DISCIPLINA = "Rec. Aprend. Matemática";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("ERRO: DATABASE_URL não definida nesta sessão.");
    process.exit(1);
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");

    for (const par of PARES) {
      const linhaAtual = (await client.query(`
        SELECT td.id, td.turma_id, td.disciplina_id, td.carga_horaria_semanal_override, p.nome AS professor_atual
        FROM turma_disciplinas td
        JOIN turmas t ON t.id = td.turma_id
        JOIN disciplinas d ON d.id = td.disciplina_id
        LEFT JOIN professores p ON p.id = td.professor_id
        WHERE t.nome = $1 AND d.nome = $2 AND t.escola_id = $3
      `, [par.turma, DISCIPLINA, ESCOLA_ID])).rows[0];

      if (!linhaAtual) {
        console.log(`[PULA] ${par.turma}: não achou linha existente pra "${DISCIPLINA}"`);
        continue;
      }

      const faltante = par.profs.find(p => p !== linhaAtual.professor_atual);
      if (!faltante) {
        console.log(`[OK] ${par.turma}: já tem "${linhaAtual.professor_atual}", nada faltando`);
        continue;
      }

      const profFaltante = (await client.query(
        `SELECT id FROM professores WHERE nome = $1 AND escola_id = $2`,
        [faltante, ESCOLA_ID]
      )).rows[0];

      if (!profFaltante) {
        console.log(`[ERRO] ${par.turma}: professor "${faltante}" não encontrado no cadastro`);
        continue;
      }

      // confere se já não existe (evita duplicar em reruns)
      const jaExiste = (await client.query(
        `SELECT id FROM turma_disciplinas WHERE turma_id = $1 AND disciplina_id = $2 AND professor_id = $3`,
        [linhaAtual.turma_id, linhaAtual.disciplina_id, profFaltante.id]
      )).rows[0];
      if (jaExiste) {
        console.log(`[JÁ EXISTE] ${par.turma}: linha pra "${faltante}" já está lá`);
        continue;
      }

      await client.query(`
        INSERT INTO turma_disciplinas (turma_id, disciplina_id, professor_id, carga_horaria_semanal_override)
        VALUES ($1, $2, $3, $4)
      `, [linhaAtual.turma_id, linhaAtual.disciplina_id, profFaltante.id, linhaAtual.carga_horaria_semanal_override]);

      console.log(`[ADICIONA] ${par.turma}: "${linhaAtual.professor_atual}" (já tinha) + "${faltante}" (restaurado)`);
    }

    if (APLICAR) {
      await client.query("COMMIT");
      console.log("\n✅ APLICADO.");
    } else {
      await client.query("ROLLBACK");
      console.log("\n🔎 DRY-RUN — rode com --aplicar.");
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("ERRO:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}
main();
