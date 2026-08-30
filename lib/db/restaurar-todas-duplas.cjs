// Restaura TODOS os pares de dupla docencia encontrados no PDF por turma
// do Urania (27 pares no total -- 6 ja tinham sido corrigidos antes no
// matutino, os outros 21 sao novos, principalmente vespertino 6o e 9o ano).
// Pra cada par, adiciona a linha que falta em turma_disciplinas (o
// professor que ja esta la, mantem; o que falta, adiciona).
//
// Uso:
//   node restaurar-todas-duplas.cjs            \u2192 dry-run (ROLLBACK)
//   node restaurar-todas-duplas.cjs --aplicar   \u2192 aplica de verdade (COMMIT)

const { Client } = require("pg");
const APLICAR = process.argv.includes("--aplicar");
const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";

const PARES = [
  {
    "turma": "9MA",
    "disciplina": "Rec. Aprend. Matemática",
    "professores": [
      "Juliana",
      "Julio Cesar dos Santos"
    ]
  },
  {
    "turma": "9MB",
    "disciplina": "Rec. Aprend. Matemática",
    "professores": [
      "Juliana",
      "Julio Cesar dos Santos"
    ]
  },
  {
    "turma": "9MC",
    "disciplina": "Rec. Aprend. Matemática",
    "professores": [
      "Juliana",
      "Julio Cesar dos Santos"
    ]
  },
  {
    "turma": "9MD",
    "disciplina": "Rec. Aprend. Matemática",
    "professores": [
      "Juliana",
      "Julio Cesar dos Santos"
    ]
  },
  {
    "turma": "9ME",
    "disciplina": "Rec. Aprend. Matemática",
    "professores": [
      "Julio Cesar dos Santos",
      "Matheus Tavares"
    ]
  },
  {
    "turma": "9MF",
    "disciplina": "Rec. Aprend. Matemática",
    "professores": [
      "Julio Cesar dos Santos",
      "Matheus Tavares"
    ]
  },
  {
    "turma": "6TA",
    "disciplina": "Rec. Aprend. L. Port",
    "professores": [
      "Cecília Favoretto Jez",
      "Ivanir"
    ]
  },
  {
    "turma": "6TA",
    "disciplina": "Rec. Aprend. Matemática",
    "professores": [
      "Andre Pizoni Cardoso",
      "Pedro Antonio Marcolino"
    ]
  },
  {
    "turma": "6TB",
    "disciplina": "Rec. Aprend. L. Port",
    "professores": [
      "Cecília Favoretto Jez",
      "Ivanir"
    ]
  },
  {
    "turma": "6TB",
    "disciplina": "Rec. Aprend. Matemática",
    "professores": [
      "Andre Pizoni Cardoso",
      "Lisiane"
    ]
  },
  {
    "turma": "6TC",
    "disciplina": "Rec. Aprend. Matemática",
    "professores": [
      "Lisiane",
      "Pedro Antonio Marcolino"
    ]
  },
  {
    "turma": "6TC",
    "disciplina": "Rec. Aprend. L. Port",
    "professores": [
      "Cecília Favoretto Jez",
      "Ivanir"
    ]
  },
  {
    "turma": "6TD",
    "disciplina": "Rec. Aprend. Matemática",
    "professores": [
      "Lisiane",
      "Pedro Antonio Marcolino"
    ]
  },
  {
    "turma": "6TD",
    "disciplina": "Rec. Aprend. L. Port",
    "professores": [
      "Ivanir",
      "Silmara Barros"
    ]
  },
  {
    "turma": "6TE",
    "disciplina": "Rec. Aprend. L. Port",
    "professores": [
      "Ivanir",
      "Silmara Barros"
    ]
  },
  {
    "turma": "6TE",
    "disciplina": "Rec. Aprend. Matemática",
    "professores": [
      "Lisiane",
      "Pedro Antonio Marcolino"
    ]
  },
  {
    "turma": "6TF",
    "disciplina": "Rec. Aprend. Matemática",
    "professores": [
      "Lisiane",
      "Pedro Antonio Marcolino"
    ]
  },
  {
    "turma": "6TF",
    "disciplina": "Rec. Aprend. L. Port",
    "professores": [
      "Ivanir",
      "Silmara Barros"
    ]
  },
  {
    "turma": "6TG",
    "disciplina": "Rec. Aprend. L. Port",
    "professores": [
      "Ivanir",
      "Silmara Barros"
    ]
  },
  {
    "turma": "6TG",
    "disciplina": "Rec. Aprend. Matemática",
    "professores": [
      "Lisiane",
      "Pedro Antonio Marcolino"
    ]
  },
  {
    "turma": "6TH",
    "disciplina": "Rec. Aprend. L. Port",
    "professores": [
      "Ivanir",
      "Silmara Barros"
    ]
  },
  {
    "turma": "6TH",
    "disciplina": "Rec. Aprend. Matemática",
    "professores": [
      "Gilberto",
      "Lisiane"
    ]
  },
  {
    "turma": "6TI",
    "disciplina": "Rec. Aprend. L. Port",
    "professores": [
      "Ivanir",
      "Silmara Barros"
    ]
  },
  {
    "turma": "6TI",
    "disciplina": "Rec. Aprend. Matemática",
    "professores": [
      "Gilberto",
      "Lisiane"
    ]
  },
  {
    "turma": "9TG",
    "disciplina": "Rec. Aprend. Matemática",
    "professores": [
      "Gilberto",
      "Lisiane"
    ]
  },
  {
    "turma": "9TH",
    "disciplina": "Rec. Aprend. Matemática",
    "professores": [
      "Gilberto",
      "Lisiane"
    ]
  },
  {
    "turma": "9TI",
    "disciplina": "Rec. Aprend. Matemática",
    "professores": [
      "Gilberto",
      "Lisiane"
    ]
  }
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

    let adicionados = 0, jaCompletos = 0, erros = 0;

    for (const par of PARES) {
      const linhaAtual = (await client.query(`
        SELECT td.id, td.turma_id, td.disciplina_id, td.carga_horaria_semanal_override, p.nome AS professor_atual
        FROM turma_disciplinas td
        JOIN turmas t ON t.id = td.turma_id
        JOIN disciplinas d ON d.id = td.disciplina_id
        LEFT JOIN professores p ON p.id = td.professor_id
        WHERE t.nome = $1 AND d.nome = $2 AND t.escola_id = $3
      `, [par.turma, par.disciplina, ESCOLA_ID])).rows[0];

      if (!linhaAtual) {
        console.log(`[SEM LINHA BASE] ${par.turma} / ${par.disciplina}: não achou linha existente na matriz`);
        erros++;
        continue;
      }

      const faltante = par.professores.find(p => p !== linhaAtual.professor_atual);
      if (!faltante) {
        jaCompletos++;
        continue;
      }

      const profFaltante = (await client.query(
        `SELECT id FROM professores WHERE nome = $1 AND escola_id = $2`,
        [faltante, ESCOLA_ID]
      )).rows[0];

      if (!profFaltante) {
        console.log(`[PROFESSOR NÃO ACHADO] ${par.turma} / ${par.disciplina}: "${faltante}"`);
        erros++;
        continue;
      }

      const jaExiste = (await client.query(
        `SELECT id FROM turma_disciplinas WHERE turma_id = $1 AND disciplina_id = $2 AND professor_id = $3`,
        [linhaAtual.turma_id, linhaAtual.disciplina_id, profFaltante.id]
      )).rows[0];
      if (jaExiste) {
        jaCompletos++;
        continue;
      }

      await client.query(`
        INSERT INTO turma_disciplinas (turma_id, disciplina_id, professor_id, carga_horaria_semanal_override)
        VALUES ($1, $2, $3, $4)
      `, [linhaAtual.turma_id, linhaAtual.disciplina_id, profFaltante.id, linhaAtual.carga_horaria_semanal_override]);

      console.log(`[ADICIONA] ${par.turma} / ${par.disciplina}: "${linhaAtual.professor_atual}" (já tinha) + "${faltante}" (restaurado)`);
      adicionados++;
    }

    console.log(`\n=== Resumo: ${adicionados} adicionados, ${jaCompletos} já completos, ${erros} com erro/aviso ===`);

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
