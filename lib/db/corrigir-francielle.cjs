/**
 * corrigir-francielle.cjs
 *
 * 1. Remove as 25 aulas de PAEE erroneamente atribuidas a "Franciele
 *    de Assis" (professora normal, nao faz PAEE).
 * 2. Adiciona 25 aulas de PAEE (so turno vespertino/tarde) para
 *    "Francielle" (ja cadastrada, da aula real de manha e PAEE a
 *    tarde).
 *
 * Uso:
 *   node corrigir-francielle.cjs             (dry-run)
 *   node corrigir-francielle.cjs --aplicar   (aplica)
 */
const { Client } = require("pg");
const fs = require("fs");

const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";
const aplicar = process.argv.includes("--aplicar");

const conteudo = fs.readFileSync(".env", "utf8");
const linha = conteudo.split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
const url = linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");

async function main() {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN");

    const disc = await client.query(
      `SELECT id FROM disciplinas WHERE escola_id = $1 AND nome = 'PAEE'`,
      [ESCOLA_ID],
    );
    const disciplinaId = disc.rows[0].id;

    // Franciele de Assis (1 L) -- professora normal, remover PAEE errado
    const errada = await client.query(
      `SELECT id, nome FROM professores WHERE escola_id = $1 AND nome = 'Franciele de Assis'`,
      [ESCOLA_ID],
    );
    if (errada.rows.length === 0) {
      throw new Error("Professora 'Franciele de Assis' nao encontrada -- confira o nome exato.");
    }
    const idErrada = errada.rows[0].id;
    const paeeErrado = await client.query(
      `SELECT COUNT(*) as total FROM horarios WHERE professor_id = $1 AND disciplina_id = $2`,
      [idErrada, disciplinaId],
    );
    console.log(`Franciele de Assis (id=${idErrada}): ${paeeErrado.rows[0].total} aula(s) de PAEE a remover`);
    if (aplicar) {
      await client.query(`DELETE FROM horarios WHERE professor_id = $1 AND disciplina_id = $2`, [idErrada, disciplinaId]);
    }

    // Francielle (2 L, sem sobrenome) -- ja cadastrada, adicionar PAEE so tarde
    const certa = await client.query(
      `SELECT id, nome FROM professores WHERE escola_id = $1 AND nome = 'Francielle'`,
      [ESCOLA_ID],
    );
    if (certa.rows.length === 0) {
      throw new Error("Professora 'Francielle' nao encontrada -- confira o nome exato no banco.");
    }
    const idCerta = certa.rows[0].id;

    const jaTemPaee = await client.query(
      `SELECT COUNT(*) as total FROM horarios WHERE professor_id = $1 AND disciplina_id = $2`,
      [idCerta, disciplinaId],
    );
    if (Number(jaTemPaee.rows[0].total) > 0) {
      console.log(`Francielle (id=${idCerta}) ja tem ${jaTemPaee.rows[0].total} aula(s) de PAEE -- pulando insercao (evita duplicar)`);
    } else {
      console.log(`Francielle (id=${idCerta}): 25 aula(s) de PAEE (vespertino) serao criadas`);
      if (aplicar) {
        for (let dia = 0; dia < 5; dia++) {
          for (let aula = 1; aula <= 5; aula++) {
            await client.query(
              `INSERT INTO horarios (escola_id, turma_id, disciplina_id, professor_id, dia_semana, numero_aula, turno, versao_grade)
               VALUES ($1, NULL, $2, $3, $4, $5, 'vespertino', 'oficial')`,
              [ESCOLA_ID, disciplinaId, idCerta, dia, aula],
            );
          }
        }
      }
    }

    if (aplicar) {
      await client.query("COMMIT");
      console.log("\nOK: correcao aplicada de verdade (--aplicar usado).");
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
