// SO LEITURA -- verifica o matriz_curricular_id exato de uma turma
// especifica, e se essa matriz realmente existe/bate com o curso certo.
const { Client } = require("pg");

const NOME_TURMA = process.argv[2] || "2MB DES";
const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const turmaR = await client.query(
    `SELECT id, nome, matriz_curricular_id FROM turmas WHERE escola_id = $1 AND nome = $2`,
    [ESCOLA_ID, NOME_TURMA]
  );
  console.log("Turma(s) encontrada(s):", turmaR.rows);

  for (const turma of turmaR.rows) {
    if (turma.matriz_curricular_id == null) {
      console.log(`  -> "${turma.nome}" (id=${turma.id}) NAO tem matriz_curricular_id (esta null)`);
      continue;
    }
    const matrizR = await client.query(
      `SELECT id, curso_id, serie_ano, escola_id FROM matrizes_curriculares WHERE id = $1`,
      [turma.matriz_curricular_id]
    );
    if (matrizR.rows.length === 0) {
      console.log(`  -> "${turma.nome}" (id=${turma.id}) tem matriz_curricular_id=${turma.matriz_curricular_id}, MAS essa matriz NAO EXISTE mais na tabela matrizes_curriculares!`);
      continue;
    }
    const matriz = matrizR.rows[0];
    console.log(`  -> "${turma.nome}" (id=${turma.id}) -> matriz id=${matriz.id}, curso_id=${matriz.curso_id}, serie_ano="${matriz.serie_ano}", escola_id_da_matriz=${matriz.escola_id}`);
    if (matriz.escola_id !== ESCOLA_ID) {
      console.log(`     !!! ATENCAO: a matriz pertence a outra escola (${matriz.escola_id}), nao a esta (${ESCOLA_ID})`);
    }
    const cursoR = await client.query(`SELECT id, nome, nivel FROM cursos WHERE id = $1`, [matriz.curso_id]);
    console.log(`     curso da matriz:`, cursoR.rows[0]);
  }

  await client.end();
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
