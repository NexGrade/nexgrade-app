// SO LEITURA -- busca a matriz curricular da 3a serie noturno do curso
// "Itinerario Linguagens e Ciencias Humanas" (ou nome parecido) pra
// usar de referencia.
const { Client } = require("pg");

const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // acha o(s) curso(s) cujo nome bate com "linguagens" e "ciencias humanas"
  const cursosR = await client.query(
    `SELECT id, nome, nivel FROM cursos WHERE escola_id = $1 AND nome ILIKE '%Linguagens%'`,
    [ESCOLA_ID]
  );
  console.log("Cursos encontrados com 'Linguagens' no nome:");
  console.log(cursosR.rows);

  for (const curso of cursosR.rows) {
    console.log(`\n=== Matrizes do curso "${curso.nome}" (id=${curso.id}) ===`);
    const matrizesR = await client.query(
      `SELECT id, serie_ano, carga_horaria_semanal_total FROM matrizes_curriculares WHERE curso_id = $1 ORDER BY serie_ano`,
      [curso.id]
    );
    console.log(matrizesR.rows);

    for (const matriz of matrizesR.rows) {
      const itensR = await client.query(
        `SELECT im.disciplina_id, im.categoria_curricular, im.carga_horaria_semanal, d.nome
         FROM itens_matriz im JOIN disciplinas d ON d.id = im.disciplina_id
         WHERE im.matriz_curricular_id = $1 ORDER BY d.nome`,
        [matriz.id]
      );
      console.log(`\n  -- Matriz id=${matriz.id} (${matriz.serie_ano}, ${matriz.carga_horaria_semanal_total}h/semana) --`);
      for (const item of itensR.rows) {
        console.log(`     ${item.nome} -- ${item.carga_horaria_semanal}h -- categoria: ${item.categoria_curricular}`);
      }
    }
  }

  // tambem lista as turmas noturnas 3a serie desse(s) curso(s), pra achar o turno certo
  console.log("\n=== Turmas noturnas 3a serie (verificacao cruzada) ===");
  const turmasR = await client.query(
    `SELECT id, nome, turno, serie, matriz_curricular_id FROM turmas
     WHERE escola_id = $1 AND turno = 'noturno' AND serie ILIKE '%3%'`,
    [ESCOLA_ID]
  );
  console.log(turmasR.rows);

  await client.end();
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
