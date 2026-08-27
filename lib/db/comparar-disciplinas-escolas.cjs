// Compara o total de disciplinas cadastradas por escola, pra
// investigar por que Mario Braga mostra o catalogo inteiro (248) na
// UI enquanto Arlinda mostra so as suas proprias.
//
// Somente LEITURA -- nao altera nada no banco.
//
// Uso:
//   cd C:\Projetos\nexgrade-app
//   node lib/db/comparar-disciplinas-escolas.cjs

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const match = envContent.match(/^DATABASE_URL=(.+)$/m);
if (!match) {
  console.error('ERRO: DATABASE_URL nao encontrada em .env');
  process.exit(1);
}
const databaseUrl = match[1].trim().replace(/^["']|["']$/g, '');

const ESCOLA_ID_MARIO_BRAGA = 'org_3HCMsuYeAwkggR1dxXNzEdzNaX8';
const ESCOLA_ID_ARLINDA = 'org_3HCLFry0r48pfutN7ChZIip3IWL';

async function main() {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    // Total de disciplinas por escola
    const totais = await pool.query(
      `SELECT escola_id, COUNT(*) as total
       FROM disciplinas
       WHERE escola_id IN ($1, $2)
       GROUP BY escola_id`,
      [ESCOLA_ID_MARIO_BRAGA, ESCOLA_ID_ARLINDA]
    );
    console.log('\n--- Total de disciplinas por escola ---');
    for (const row of totais.rows) {
      const nomeEscola = row.escola_id === ESCOLA_ID_MARIO_BRAGA ? 'Mario Braga' : 'Arlinda';
      console.log(`${nomeEscola}: ${row.total}`);
    }

    // Verifica se existe alguma disciplina com escola_id NULL (catalogo
    // global de verdade, se existir esse padrao)
    const semEscola = await pool.query(
      `SELECT COUNT(*) as total FROM disciplinas WHERE escola_id IS NULL`
    );
    console.log(`\nDisciplinas sem escola_id (catalogo global, se existir): ${semEscola.rows[0].total}`);

    // Lista as disciplinas de Arlinda pra comparar o padrao
    const arlinda = await pool.query(
      `SELECT id, nome, codigo_sae, sigla
       FROM disciplinas
       WHERE escola_id = $1
       ORDER BY nome ASC`,
      [ESCOLA_ID_ARLINDA]
    );
    console.log(`\n--- Disciplinas de Arlinda (${arlinda.rows.length}) ---`);
    console.log('id\tcodigo_sae\tsigla\tnome');
    for (const row of arlinda.rows) {
      console.log(`${row.id}\t${row.codigo_sae ?? '(vazio)'}\t${row.sigla ?? '(vazio)'}\t${row.nome}`);
    }

    const outPath = path.join(__dirname, 'disciplinas-arlinda.json');
    fs.writeFileSync(outPath, JSON.stringify(arlinda.rows, null, 2), 'utf8');
    console.log(`\nSalvo tambem em: ${outPath}`);

    // Checa se existe alguma coluna tipo 'ativo'/'visivel' na tabela
    // que poderia explicar filtragem diferente na UI
    const colunas = await pool.query(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_name = 'disciplinas'
       ORDER BY ordinal_position`
    );
    console.log('\n--- Colunas da tabela disciplinas ---');
    for (const row of colunas.rows) {
      console.log(`${row.column_name} (${row.data_type})`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Erro ao consultar:', err);
  process.exit(1);
});
