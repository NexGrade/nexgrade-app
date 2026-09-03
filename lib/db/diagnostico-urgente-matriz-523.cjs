// SO LEITURA -- URGENTE. Verifica o estado atual da matriz 523
// (excluida sem querer) e se os itens dela (itens_matriz) ainda
// existem no banco -- isso decide se da pra reconstruir.
const { Client } = require("pg");

const MATRIZ_ID = 523;
const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";
const CURSO_ID = 79;

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log("=== 1) A matriz ainda existe na tabela matrizes_curriculares? ===");
  const matrizR = await client.query(`SELECT * FROM matrizes_curriculares WHERE id = $1`, [MATRIZ_ID]);
  console.log(matrizR.rows.length > 0 ? matrizR.rows[0] : "NAO EXISTE MAIS");

  console.log("\n=== 2) Os itens_matriz (disciplinas + carga horaria) dessa matriz ainda existem? ===");
  const itensR = await client.query(`SELECT * FROM itens_matriz WHERE matriz_curricular_id = $1`, [MATRIZ_ID]);
  console.log(`Quantidade de itens encontrados: ${itensR.rows.length}`);
  if (itensR.rows.length > 0) {
    for (const item of itensR.rows) {
      const discR = await client.query(`SELECT nome FROM disciplinas WHERE id = $1`, [item.disciplina_id]);
      console.log(`  item id=${item.id} disciplina_id=${item.disciplina_id} (${discR.rows[0]?.nome ?? "?"}) carga=${item.carga_horaria_semanal}`);
    }
  }

  console.log("\n=== 3) Outras matrizes do mesmo curso (pra comparar estrutura, ex.: 1a e 3a serie) ===");
  const outrasR = await client.query(
    `SELECT id, serie_ano, carga_horaria_semanal_total FROM matrizes_curriculares WHERE curso_id = $1 ORDER BY serie_ano`,
    [CURSO_ID]
  );
  console.log(outrasR.rows);

  console.log("\n=== 4) Turmas que ainda apontam pra matriz_curricular_id=523 (ficaram orfas) ===");
  const turmasR = await client.query(
    `SELECT id, nome FROM turmas WHERE escola_id = $1 AND matriz_curricular_id = $2`,
    [ESCOLA_ID, MATRIZ_ID]
  );
  console.log(turmasR.rows);

  await client.end();
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
