/**
 * migrar-paee-para-turma-fantasma.cjs
 *
 * Cria duas turmas "fantasma" (PAEE-Matutino, PAEE-Vespertino) que
 * nunca aparecem pra alunos, servem so pra satisfazer a exigencia
 * tecnica de turma_id NOT NULL em horarios. Migra as 350 aulas PAEE
 * ja inseridas (com turma_id NULL) pra usar essas turmas.
 *
 * Uso:
 *   node migrar-paee-para-turma-fantasma.cjs             (dry-run)
 *   node migrar-paee-para-turma-fantasma.cjs --aplicar   (aplica)
 */
const { Client } = require("pg");
const fs = require("fs");

const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";
const aplicar = process.argv.includes("--aplicar");
const ANO_LETIVO = 2026;

const conteudo = fs.readFileSync(".env", "utf8");
const linha = conteudo.split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
const url = linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");

async function criarOuBuscarTurmaFantasma(client, turno, aplicar) {
  const existente = await client.query(
    `SELECT id FROM turmas WHERE escola_id = $1 AND nome = 'PAEE' AND turno = $2`,
    [ESCOLA_ID, turno],
  );
  if (existente.rows.length > 0) {
    console.log(`Turma fantasma PAEE/${turno} ja existe (id=${existente.rows[0].id})`);
    return existente.rows[0].id;
  }
  console.log(`Turma fantasma PAEE/${turno} sera criada.`);
  if (!aplicar) return null;
  const criada = await client.query(
    `INSERT INTO turmas (escola_id, nome, serie, turno, ano_letivo)
     VALUES ($1, 'PAEE', 'PAEE', $2, $3)
     RETURNING id`,
    [ESCOLA_ID, turno, ANO_LETIVO],
  );
  console.log(`  -> criada com id=${criada.rows[0].id}`);
  return criada.rows[0].id;
}

async function main() {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN");

    const idMatutino = await criarOuBuscarTurmaFantasma(client, "matutino", aplicar);
    const idVespertino = await criarOuBuscarTurmaFantasma(client, "vespertino", aplicar);

    const pendentes = await client.query(
      `SELECT COUNT(*) FILTER (WHERE turno = 'matutino') as manha,
              COUNT(*) FILTER (WHERE turno = 'vespertino') as tarde
       FROM horarios WHERE escola_id = $1 AND turma_id IS NULL`,
      [ESCOLA_ID],
    );
    console.log(`\nAulas pendentes de migracao: manha=${pendentes.rows[0].manha}, tarde=${pendentes.rows[0].tarde}`);

    if (aplicar) {
      await client.query(
        `UPDATE horarios SET turma_id = $1 WHERE escola_id = $2 AND turma_id IS NULL AND turno = 'matutino'`,
        [idMatutino, ESCOLA_ID],
      );
      await client.query(
        `UPDATE horarios SET turma_id = $1 WHERE escola_id = $2 AND turma_id IS NULL AND turno = 'vespertino'`,
        [idVespertino, ESCOLA_ID],
      );

      const restantes = await client.query(
        `SELECT COUNT(*) as total FROM horarios WHERE escola_id = $1 AND turma_id IS NULL`,
        [ESCOLA_ID],
      );
      console.log(`Linhas ainda com turma_id NULL apos migracao: ${restantes.rows[0].total}`);
      if (Number(restantes.rows[0].total) > 0) {
        throw new Error("Ainda ha linhas com turma_id NULL -- abortando antes de reverter o NOT NULL.");
      }

      await client.query("COMMIT");
      console.log("\nOK: migracao aplicada. Agora e seguro reverter turma_id para NOT NULL.");
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
