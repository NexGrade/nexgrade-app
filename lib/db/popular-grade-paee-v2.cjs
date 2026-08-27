/**
 * popular-grade-paee-v2.cjs
 *
 * Versao corrigida: grava o campo `turno` em cada linha de horarios
 * para disciplinas semTurma (PAEE), resolvendo a ambiguidade de
 * professores que dao PAEE em mais de um turno no mesmo dia/numero
 * de aula (Doraci e Noeli).
 *
 * Uso:
 *   node popular-grade-paee-v2.cjs             (dry-run)
 *   node popular-grade-paee-v2.cjs --aplicar   (aplica)
 */
const { Client } = require("pg");
const fs = require("fs");

const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";
const aplicar = process.argv.includes("--aplicar");

// nome -> lista de turnos em que da PAEE (25 aulas por turno)
const PLANO = {
  "Camila": ["matutino"],
  "Sueli": ["matutino"],
  "Clair": ["vespertino"],
  "Hericleia": ["vespertino"],
  "Kauana": ["vespertino"],
  "Rosinei": ["vespertino"],
  "Silvana": ["vespertino"],
  "Doraci": ["matutino", "vespertino"],
  "Noeli": ["matutino", "vespertino"],
  "Fernanda": ["vespertino"],
  "Franciele de Assis": ["vespertino"],
};

const conteudo = fs.readFileSync(".env", "utf8");
const linha = conteudo.split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
const url = linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");

async function main() {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN");

    const disc = await client.query(
      `SELECT id, sem_turma FROM disciplinas WHERE escola_id = $1 AND nome = 'PAEE'`,
      [ESCOLA_ID],
    );
    if (disc.rows.length === 0) {
      throw new Error("Disciplina PAEE nao encontrada.");
    }
    const disciplinaId = disc.rows[0].id;
    const jaMarcada = disc.rows[0].sem_turma;
    console.log(`Disciplina PAEE id=${disciplinaId}, semTurma atual=${jaMarcada}`);
    if (!jaMarcada && aplicar) {
      await client.query(`UPDATE disciplinas SET sem_turma = true WHERE id = $1`, [disciplinaId]);
      console.log("  -> marcada como semTurma=true");
    }

    console.log(`\n${Object.keys(PLANO).length} professor(es) no plano:`);
    for (const [nome, turnos] of Object.entries(PLANO)) {
      const prof = await client.query(
        `SELECT id FROM professores WHERE escola_id = $1 AND nome ILIKE $2`,
        [ESCOLA_ID, `%${nome}%`],
      );
      if (prof.rows.length === 0) {
        console.log(`  [NAO ENCONTRADO] ${nome} -- pulando`);
        continue;
      }
      const professorId = prof.rows[0].id;

      const jaTemGrade = await client.query(
        `SELECT COUNT(*) as total FROM horarios WHERE professor_id = $1 AND disciplina_id = $2`,
        [professorId, disciplinaId],
      );
      if (Number(jaTemGrade.rows[0].total) > 0) {
        console.log(`  [JA TEM GRADE] ${nome} (id=${professorId}) -- ${jaTemGrade.rows[0].total} aula(s) ja existente(s), pulando`);
        continue;
      }

      let totalInserido = 0;
      for (const turno of turnos) {
        for (let dia = 0; dia < 5; dia++) {
          for (let aula = 1; aula <= 5; aula++) {
            totalInserido++;
            if (aplicar) {
              await client.query(
                `INSERT INTO horarios (escola_id, turma_id, disciplina_id, professor_id, dia_semana, numero_aula, turno, versao_grade)
                 VALUES ($1, NULL, $2, $3, $4, $5, $6, 'oficial')`,
                [ESCOLA_ID, disciplinaId, professorId, dia, aula, turno],
              );
            }
          }
        }
      }
      console.log(`  [CRIAR] ${nome} (id=${professorId}) -- ${totalInserido} aula(s) em ${turnos.join(" + ")}`);
    }

    if (aplicar) {
      await client.query("COMMIT");
      console.log("\nOK: grade de PAEE populada de verdade (--aplicar usado), com turno explicito em cada linha.");
    } else {
      await client.query("ROLLBACK");
      console.log("\nDRY-RUN -- nada foi alterado. Rode com --aplicar para confirmar.");
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("ERRO:", err.message);
  process.exit(1);
});
