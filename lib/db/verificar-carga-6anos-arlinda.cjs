// Script de DIAGNÓSTICO (somente leitura, não altera nada no banco).
// Verifica a carga horária semanal cadastrada por turma e disciplina
// para os 6º anos da Arlinda, comparando com a capacidade máxima
// (25h = 5 aulas/dia x 5 dias, padrão Ensino Fundamental).
//
// v2: corrigido o join com itens_matriz -- turma_disciplinas nao tem
// item_matriz_id; o vinculo real e via turmas.matriz_curricular_id +
// disciplina_id.
//
// Uso: node lib/db/verificar-carga-6anos-arlinda.cjs

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const envPath = path.join(__dirname, ".env");
const envContent = fs.readFileSync(envPath, "utf-8");
const match = envContent.match(/DATABASE_URL=(.+)/);
if (!match) {
  console.error("DATABASE_URL não encontrada no .env");
  process.exit(1);
}
const DATABASE_URL = match[1].trim();

const ESCOLA_ARLINDA = "org_3HCLFry0r48pfutN7ChZIip3IWL";
const CAPACIDADE_FUNDAMENTAL = 25; // 5 aulas/dia x 5 dias

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    // 1. Lista as turmas de 6º ano da Arlinda (inclui matriz_curricular_id)
    const turmasRes = await client.query(
      `SELECT id, nome, nivel_ensino, turno, matriz_curricular_id
       FROM turmas
       WHERE escola_id = $1
         AND nome ILIKE '6%'
       ORDER BY nome`,
      [ESCOLA_ARLINDA]
    );

    if (turmasRes.rows.length === 0) {
      console.log("Nenhuma turma de 6º ano encontrada para essa escola.");
      return;
    }

    console.log(`Encontradas ${turmasRes.rows.length} turmas de 6º ano:\n`);

    for (const turma of turmasRes.rows) {
      console.log(
        `\n=== ${turma.nome} (id=${turma.id}, turno=${turma.turno}, nivelEnsino=${turma.nivel_ensino}, matrizId=${turma.matriz_curricular_id}) ===`
      );

      // 2. Disciplinas vinculadas à turma (turma_disciplinas), com join em
      //    itens_matriz via disciplina_id + matriz_curricular_id da turma
      const vinculosRes = await client.query(
        `SELECT
           d.nome AS disciplina,
           td.professor_id,
           p.nome AS professor_nome,
           td.carga_horaria_semanal_override AS override,
           im.carga_horaria_semanal AS carga_matriz
         FROM turma_disciplinas td
         LEFT JOIN disciplinas d ON d.id = td.disciplina_id
         LEFT JOIN professores p ON p.id = td.professor_id
         LEFT JOIN itens_matriz im
           ON im.disciplina_id = td.disciplina_id
           AND im.matriz_curricular_id = $2
         WHERE td.turma_id = $1
         ORDER BY d.nome`,
        [turma.id, turma.matriz_curricular_id]
      );

      let cargaTotal = 0;
      let temFantasma = false;
      let temSemProfessor = false;

      for (const v of vinculosRes.rows) {
        const cargaEfetiva = v.override ?? v.carga_matriz ?? 0;
        cargaTotal += Number(cargaEfetiva);

        const flags = [];
        if (v.override !== null && v.carga_matriz === null) {
          flags.push("⚠ FANTASMA (override sem itens_matriz)");
          temFantasma = true;
        }
        if (v.professor_id === null) {
          flags.push("⚠ SEM PROFESSOR (professor_id nulo)");
          temSemProfessor = true;
        }

        console.log(
          `  ${(v.disciplina ?? "??").padEnd(35)} carga=${cargaEfetiva}h  professor=${v.professor_nome ?? "NULO"}  ${flags.join(" ")}`
        );
      }

      console.log(`  --------------------------------------------------`);
      console.log(`  TOTAL CADASTRADO: ${cargaTotal}h  (capacidade Fundamental: ${CAPACIDADE_FUNDAMENTAL}h)`);

      if (cargaTotal < CAPACIDADE_FUNDAMENTAL) {
        console.log(`  ❌ FALTA ${CAPACIDADE_FUNDAMENTAL - cargaTotal}h — provável causa das aulas vagas nesta turma`);
      } else if (cargaTotal > CAPACIDADE_FUNDAMENTAL) {
        console.log(`  ⚠ EXCEDE em ${cargaTotal - CAPACIDADE_FUNDAMENTAL}h — pode gerar INFEASIBLE ou sobrecarga`);
      } else {
        console.log(`  ✅ Carga exata`);
      }
      if (temFantasma) console.log(`  ⚠ Esta turma tem vínculo(s) fantasma — rode auditar-vinculos-fantasma.cjs`);
      if (temSemProfessor) console.log(`  ⚠ Esta turma tem vínculo(s) sem professor — causa fallback silencioso`);

      // 3. Verifica se "Ensino Religioso" existe na matriz da turma
      //    mas NAO esta vinculado em turma_disciplinas (disciplina
      //    inteira faltando, padrao ja visto na 2B)
      const faltantesRes = await client.query(
        `SELECT d.nome, im.carga_horaria_semanal
         FROM itens_matriz im
         JOIN disciplinas d ON d.id = im.disciplina_id
         WHERE im.matriz_curricular_id = $1
           AND NOT EXISTS (
             SELECT 1 FROM turma_disciplinas td
             WHERE td.turma_id = $2 AND td.disciplina_id = im.disciplina_id
           )`,
        [turma.matriz_curricular_id, turma.id]
      );
      if (faltantesRes.rows.length > 0) {
        console.log(`  ❌ DISCIPLINAS NA MATRIZ MAS SEM VÍNCULO NA TURMA:`);
        for (const f of faltantesRes.rows) {
          console.log(`     - ${f.nome} (${f.carga_horaria_semanal}h)`);
        }
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Erro:", err);
  process.exit(1);
});
