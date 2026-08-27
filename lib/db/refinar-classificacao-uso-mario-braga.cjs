// refinar-classificacao-uso-mario-braga.cjs
// LEITURA APENAS — nenhuma escrita no banco.
//
// Correção do script anterior: uma disciplina só deve ser considerada
// "em uso real" se:
//   (a) aparece em turma_disciplinas (vínculo direto com turma), OU
//   (b) aparece em itens_matriz cuja matriz_curricular_id pertence a
//       uma turma que existe atualmente
//
// Disciplinas que só aparecem em itens_matriz cuja matriz_curricular_id
// NÃO corresponde a nenhuma turma atual são "itens_matriz órfãos" —
// não devem contar como currículo real em uso.
//
// Saída: 3 grupos
//   EM-USO-REAL            -> fica no Mário Braga
//   SO-ITENS-MATRIZ-ORFAO  -> candidata a limpeza (não é currículo vivo)
//   NUNCA-REFERENCIADA     -> candidata ao catálogo SEED

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
  console.error(`ERRO: não encontrei .env em ${envPath}`);
  process.exit(1);
}
const envContent = fs.readFileSync(envPath, 'utf8');
const match = envContent.match(/^DATABASE_URL=(.+)$/m);
if (!match) {
  console.error('ERRO: DATABASE_URL não encontrada no .env');
  process.exit(1);
}
const DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, '');

const MARIO_BRAGA_ORG_ID = 'org_3HCMsuYeAwkggR1dxXNzEdzNaX8';

async function main() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    // 1) matriz_curricular_id que pertencem a turmas VIVAS do Mário Braga
    const turmasRes = await client.query(
      `SELECT DISTINCT matriz_curricular_id FROM turmas
       WHERE escola_id = $1 AND matriz_curricular_id IS NOT NULL`,
      [MARIO_BRAGA_ORG_ID]
    );
    const matrizesVivas = new Set(turmasRes.rows.map(r => r.matriz_curricular_id));
    console.log(`Matrizes curriculares vivas (usadas por turmas atuais do Mário Braga): ${matrizesVivas.size}`);

    // 2) todas as disciplinas do Mário Braga
    const disciplinasRes = await client.query(
      `SELECT id, nome, codigo_sae, sigla, carga_semanal
       FROM disciplinas WHERE escola_id = $1 ORDER BY nome`,
      [MARIO_BRAGA_ORG_ID]
    );
    const disciplinas = disciplinasRes.rows;

    // 3) turma_disciplinas por disciplina (vínculo direto)
    const tdRes = await client.query(
      `SELECT disciplina_id, COUNT(*) AS n
       FROM turma_disciplinas
       WHERE disciplina_id IN (SELECT id FROM disciplinas WHERE escola_id = $1)
       GROUP BY disciplina_id`,
      [MARIO_BRAGA_ORG_ID]
    );
    const tdMap = new Map(tdRes.rows.map(r => [r.disciplina_id, Number(r.n)]));

    // 4) itens_matriz por disciplina, com a matriz_curricular_id de cada ocorrência
    const imRes = await client.query(
      `SELECT disciplina_id, matriz_curricular_id
       FROM itens_matriz
       WHERE disciplina_id IN (SELECT id FROM disciplinas WHERE escola_id = $1)`,
      [MARIO_BRAGA_ORG_ID]
    );
    const imByDisc = new Map(); // disciplina_id -> [matriz_curricular_id, ...]
    for (const row of imRes.rows) {
      if (!imByDisc.has(row.disciplina_id)) imByDisc.set(row.disciplina_id, []);
      imByDisc.get(row.disciplina_id).push(row.matriz_curricular_id);
    }

    // 5) classificar
    const emUsoReal = [];
    const soItensMatrizOrfao = [];
    const nuncaReferenciada = [];

    for (const d of disciplinas) {
      const nTD = tdMap.get(d.id) || 0;
      const matrizesDaDisc = imByDisc.get(d.id) || [];
      const temMatrizViva = matrizesDaDisc.some(m => matrizesVivas.has(m));

      const registro = {
        id: d.id,
        nome: d.nome,
        codigo_sae: d.codigo_sae,
        turma_disciplinas: nTD,
        itens_matriz_total: matrizesDaDisc.length,
        itens_matriz_vivos: matrizesDaDisc.filter(m => matrizesVivas.has(m)).length,
      };

      if (nTD > 0 || temMatrizViva) {
        emUsoReal.push(registro);
      } else if (matrizesDaDisc.length > 0) {
        soItensMatrizOrfao.push(registro);
      } else {
        nuncaReferenciada.push(registro);
      }
    }

    console.log('\n=== RESULTADO REFINADO ===');
    console.log(`EM USO REAL (turma_disciplinas ou matriz viva): ${emUsoReal.length}`);
    console.log(`SÓ EM ITENS_MATRIZ ÓRFÃO (matriz sem turma viva): ${soItensMatrizOrfao.length}`);
    console.log(`NUNCA REFERENCIADA: ${nuncaReferenciada.length}`);
    console.log(`Total: ${emUsoReal.length + soItensMatrizOrfao.length + nuncaReferenciada.length} (deve bater com ${disciplinas.length})`);

    console.log('\n--- SÓ EM ITENS_MATRIZ ÓRFÃO (todas) ---');
    console.table(soItensMatrizOrfao);

    const outDir = __dirname;
    fs.writeFileSync(path.join(outDir, 'disciplinas-EM-USO-REAL.json'), JSON.stringify(emUsoReal, null, 2));
    fs.writeFileSync(path.join(outDir, 'disciplinas-SO-ITENS-MATRIZ-ORFAO.json'), JSON.stringify(soItensMatrizOrfao, null, 2));
    fs.writeFileSync(path.join(outDir, 'disciplinas-NUNCA-REFERENCIADA.json'), JSON.stringify(nuncaReferenciada, null, 2));
    console.log('\nSalvo: disciplinas-EM-USO-REAL.json, disciplinas-SO-ITENS-MATRIZ-ORFAO.json, disciplinas-NUNCA-REFERENCIADA.json');
    console.log('Nenhuma alteração foi feita no banco (script somente leitura).');
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('ERRO:', err);
  process.exit(1);
});
