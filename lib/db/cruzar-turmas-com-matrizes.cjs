// cruzar-turmas-com-matrizes.cjs
// LEITURA APENAS — nenhuma escrita no banco.
//
// Para cada turma do Mário Braga:
//   1. Pega o conjunto real de disciplina_id usadas (via turma_disciplinas)
//   2. Compara esse conjunto contra os itens_matriz de CADA matriz_curricular
//      da escola, contando quantas disciplinas coincidem
//   3. Rankeia as matrizes candidatas por sobreposição (interseção / união)
//
// Isso evita decidir por nome de curso — decide pelos dados reais de uso.

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

function jaccard(setA, setB) {
  const intersecao = [...setA].filter(x => setB.has(x)).length;
  const uniao = new Set([...setA, ...setB]).size;
  return uniao === 0 ? 0 : intersecao / uniao;
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    // Turmas
    const turmasRes = await client.query(
      `SELECT id, nome, serie, turno, nivel_ensino FROM turmas WHERE escola_id = $1 ORDER BY nome`,
      [MARIO_BRAGA_ORG_ID]
    );

    // Disciplinas reais por turma
    const tdRes = await client.query(
      `SELECT turma_id, disciplina_id FROM turma_disciplinas
       WHERE turma_id IN (SELECT id FROM turmas WHERE escola_id = $1)`,
      [MARIO_BRAGA_ORG_ID]
    );
    const disciplinasPorTurma = new Map(); // turma_id -> Set(disciplina_id)
    for (const row of tdRes.rows) {
      if (!disciplinasPorTurma.has(row.turma_id)) disciplinasPorTurma.set(row.turma_id, new Set());
      disciplinasPorTurma.get(row.turma_id).add(row.disciplina_id);
    }

    // Matrizes + curso + itens
    const matrizesRes = await client.query(
      `SELECT mc.id, mc.curso_id, mc.serie_ano, c.nome AS curso_nome
       FROM matrizes_curriculares mc
       LEFT JOIN cursos c ON c.id = mc.curso_id
       WHERE mc.escola_id = $1`,
      [MARIO_BRAGA_ORG_ID]
    );
    const itensRes = await client.query(
      `SELECT matriz_curricular_id, disciplina_id FROM itens_matriz
       WHERE matriz_curricular_id IN (SELECT id FROM matrizes_curriculares WHERE escola_id = $1)`,
      [MARIO_BRAGA_ORG_ID]
    );
    const disciplinasPorMatriz = new Map(); // matriz_id -> Set(disciplina_id)
    for (const row of itensRes.rows) {
      if (!disciplinasPorMatriz.has(row.matriz_curricular_id)) disciplinasPorMatriz.set(row.matriz_curricular_id, new Set());
      disciplinasPorMatriz.get(row.matriz_curricular_id).add(row.disciplina_id);
    }

    // Nomes das disciplinas para exibir (mais legível que ids)
    const nomesRes = await client.query(`SELECT id, nome FROM disciplinas WHERE escola_id = $1`, [MARIO_BRAGA_ORG_ID]);
    const nomePorId = new Map(nomesRes.rows.map(r => [r.id, r.nome]));

    const resultado = [];

    console.log(`Total de turmas: ${turmasRes.rows.length}\n`);

    for (const turma of turmasRes.rows) {
      const discTurma = disciplinasPorTurma.get(turma.id) || new Set();

      const candidatas = [];
      for (const m of matrizesRes.rows) {
        const discMatriz = disciplinasPorMatriz.get(m.id);
        if (!discMatriz || discMatriz.size === 0) continue; // pula matrizes vazias
        const score = jaccard(discTurma, discMatriz);
        const intersecao = [...discTurma].filter(x => discMatriz.has(x)).length;
        if (intersecao > 0) {
          candidatas.push({ matrizId: m.id, cursoNome: m.curso_nome, serieAno: m.serie_ano, score, intersecao, totalMatriz: discMatriz.size });
        }
      }
      candidatas.sort((a, b) => b.score - a.score);
      const top3 = candidatas.slice(0, 3);

      console.log(`\nTurma ${turma.nome} (${turma.serie}, ${turma.turno}, ${turma.nivel_ensino}) — ${discTurma.size} disciplinas reais`);
      if (top3.length === 0) {
        console.log('  ⚠️  NENHUMA matriz com sobreposição encontrada.');
      } else {
        for (const c of top3) {
          console.log(`  matriz_id=${c.matrizId} [${c.cursoNome} — ${c.serieAno}] score=${c.score.toFixed(2)} (${c.intersecao}/${discTurma.size} disciplinas da turma batem, matriz tem ${c.totalMatriz} no total)`);
        }
      }

      resultado.push({
        turmaId: turma.id,
        turmaNome: turma.nome,
        serie: turma.serie,
        turno: turma.turno,
        nivelEnsino: turma.nivel_ensino,
        disciplinasReais: [...discTurma].map(id => ({ id, nome: nomePorId.get(id) })),
        candidatas: top3,
      });
    }

    const outPath = path.join(__dirname, 'cruzamento-turmas-matrizes.json');
    fs.writeFileSync(outPath, JSON.stringify(resultado, null, 2));
    console.log(`\n\nSalvo em: ${outPath}`);

    // Resumo
    const semCandidata = resultado.filter(r => r.candidatas.length === 0).length;
    const comCandidataForte = resultado.filter(r => r.candidatas.length > 0 && r.candidatas[0].score >= 0.7).length;
    const comCandidataFraca = resultado.filter(r => r.candidatas.length > 0 && r.candidatas[0].score < 0.7).length;
    console.log(`\n=== RESUMO ===`);
    console.log(`Turmas sem nenhuma matriz candidata: ${semCandidata}`);
    console.log(`Turmas com candidata forte (score >= 0.7): ${comCandidataForte}`);
    console.log(`Turmas com candidata fraca (score < 0.7): ${comCandidataFraca}`);
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('ERRO:', err);
  process.exit(1);
});
