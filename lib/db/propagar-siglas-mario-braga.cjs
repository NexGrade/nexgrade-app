/**
 * propagar-siglas-mario-braga.cjs
 *
 * Propaga a coluna `sigla` do catalogo mestre (disciplinas_catalogo)
 * para as disciplinas da escola Mario Braga, casando por NOME EXATO
 * (nao existe FK entre as duas tabelas hoje).
 *
 * So atualiza linhas onde disciplinas.sigla esta NULL -- nunca
 * sobrescreve uma sigla ja preenchida manualmente.
 *
 * Uso:
 *   node propagar-siglas-mario-braga.cjs             (dry-run, so mostra o que faria)
 *   node propagar-siglas-mario-braga.cjs --aplicar    (aplica de verdade)
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

    const preview = await client.query(
      `SELECT d.id, d.nome, dc.sigla AS sigla_nova
       FROM disciplinas d
       JOIN disciplinas_catalogo dc ON dc.nome = d.nome
       WHERE d.escola_id = $1
         AND (d.sigla IS NULL OR d.sigla = '')
         AND dc.sigla IS NOT NULL AND dc.sigla != ''
       ORDER BY d.nome`,
      [ESCOLA_ID],
    );

    console.log(`${preview.rows.length} disciplina(s) vao receber sigla do catalogo:`);
    for (const row of preview.rows.slice(0, 20)) {
      console.log(`  - ${row.nome}  ->  "${row.sigla_nova}"`);
    }
    if (preview.rows.length > 20) {
      console.log(`  ... e mais ${preview.rows.length - 20}`);
    }

    const semMatch = await client.query(
      `SELECT d.nome
       FROM disciplinas d
       WHERE d.escola_id = $1
         AND (d.sigla IS NULL OR d.sigla = '')
         AND NOT EXISTS (
           SELECT 1 FROM disciplinas_catalogo dc
           WHERE dc.nome = d.nome AND dc.sigla IS NOT NULL AND dc.sigla != ''
         )
       ORDER BY d.nome`,
      [ESCOLA_ID],
    );
    console.log(`\n${semMatch.rows.length} disciplina(s) SEM correspondencia no catalogo (continuam sem sigla, mostram nome completo):`);
    for (const row of semMatch.rows.slice(0, 15)) {
      console.log(`  - ${row.nome}`);
    }
    if (semMatch.rows.length > 15) {
      console.log(`  ... e mais ${semMatch.rows.length - 15}`);
    }

    if (aplicar) {
      const resultado = await client.query(
        `UPDATE disciplinas d
         SET sigla = dc.sigla
         FROM disciplinas_catalogo dc
         WHERE dc.nome = d.nome
           AND d.escola_id = $1
           AND (d.sigla IS NULL OR d.sigla = '')
           AND dc.sigla IS NOT NULL AND dc.sigla != ''`,
        [ESCOLA_ID],
      );
      await client.query("COMMIT");
      console.log(`\nOK: ${resultado.rowCount} disciplina(s) atualizada(s) de verdade (--aplicar usado).`);
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
