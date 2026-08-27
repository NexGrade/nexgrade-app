// Corrige as 12 aulas do Alecksey (id 841) que não entraram na sincronização
// automática porque o horário já estava ocupado por outro professor (dado
// desatualizado). Para cada uma das 12 aulas: remove quem estiver no slot
// (turma+dia+aula) e insere o Alecksey na disciplina certa.
//
// Uso:
//   node corrigir-alecksey.cjs            → dry-run (ROLLBACK)
//   node corrigir-alecksey.cjs --aplicar   → aplica de verdade (COMMIT)

const { Client } = require("pg");
const APLICAR = process.argv.includes("--aplicar");
const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";
const PROFESSOR_ID = 841; // Alecksey

// (turmaCodigo, diaSemana [0=Seg..4=Sex], numeroAula, disciplinaNome)
const AULAS_ALECKSEY = [
  ["1MC FAR", 4, 1, "Biologia"],
  ["1MD MA", 4, 2, "Biologia"],
  ["1MD MA", 1, 3, "Gestão de Resíduos"],
  ["1MB DES", 2, 3, "Biologia"],
  ["1MA EM", 3, 3, "Biologia"],
  ["1MD MA", 1, 4, "Gestão de Resíduos"],
  ["1MD MA", 2, 4, "Biologia"],
  ["1MA EM", 3, 4, "Biologia"],
  ["1ME DOC", 4, 4, "Biologia"],
  ["1MC FAR", 1, 5, "Biologia"],
  ["1ME DOC", 3, 5, "Biologia"],
  ["1MB DES", 4, 6, "Biologia"],
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("ERRO: DATABASE_URL não definida nesta sessão.");
    process.exit(1);
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query("BEGIN");

    let inseridas = 0, substituidas = 0, erros = 0;

    for (const [turmaCodigo, dia, aula, disciplinaNome] of AULAS_ALECKSEY) {
      const [turma] = (await client.query(
        `SELECT id FROM turmas WHERE nome = $1 AND escola_id = $2 AND turno = 'matutino'`,
        [turmaCodigo, ESCOLA_ID]
      )).rows;
      if (!turma) {
        console.log(`  [ERRO] turma "${turmaCodigo}" não encontrada.`);
        erros++;
        continue;
      }

      const [disc] = (await client.query(
        `SELECT id FROM disciplinas WHERE nome = $1 AND escola_id = $2`,
        [disciplinaNome, ESCOLA_ID]
      )).rows;
      if (!disc) {
        console.log(`  [ERRO] disciplina "${disciplinaNome}" não encontrada.`);
        erros++;
        continue;
      }

      const ocupantes = (await client.query(`
        SELECT h.id, p.nome AS professor_nome, d.nome AS disciplina_nome
        FROM horarios h
        JOIN professores p ON p.id = h.professor_id
        JOIN disciplinas d ON d.id = h.disciplina_id
        WHERE h.turma_id = $1 AND h.dia_semana = $2 AND h.numero_aula = $3 AND h.escola_id = $4
      `, [turma.id, dia, aula, ESCOLA_ID])).rows;

      const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex"];
      const label = `${turmaCodigo} | ${DIAS[dia]} aula ${aula}`;

      if (ocupantes.length > 0) {
        for (const o of ocupantes) {
          console.log(`  [SUBSTITUI] ${label}: remove "${o.professor_nome}" (${o.disciplina_nome}), insere Alecksey (${disciplinaNome})`);
          await client.query(`DELETE FROM horarios WHERE id = $1`, [o.id]);
        }
        substituidas++;
      } else {
        console.log(`  [INSERE] ${label}: Alecksey (${disciplinaNome}) — slot estava vazio`);
      }

      await client.query(
        `INSERT INTO horarios (escola_id, turma_id, disciplina_id, professor_id, dia_semana, numero_aula) VALUES ($1,$2,$3,$4,$5,$6)`,
        [ESCOLA_ID, turma.id, disc.id, PROFESSOR_ID, dia, aula]
      );
      inseridas++;
    }

    console.log(`\nTotal: ${inseridas} aula(s) do Alecksey inserida(s), ${substituidas} substituindo outro professor, ${erros} erro(s).`);

    if (APLICAR) {
      await client.query("COMMIT");
      console.log("\n✅ APLICADO.");
    } else {
      await client.query("ROLLBACK");
      console.log("\n🔎 DRY-RUN — nada foi salvo. Revise a lista acima e rode com --aplicar.");
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
