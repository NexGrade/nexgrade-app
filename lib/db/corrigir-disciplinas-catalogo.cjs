const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const match = envContent.match(/^DATABASE_URL=(.+)$/m);
if (!match) {
  console.error('DATABASE_URL não encontrado em .env');
  process.exit(1);
}
const dbUrl = match[1].trim();

const shouldCommit = process.argv.includes('--commit');

const updates = [
  { codigo_sae: '4934', nome: 'Teoria e técnica profissional' },
  { codigo_sae: '5570', nome: 'Prática profissional em agenciamento de viagem' },
  { codigo_sae: '5530', nome: 'Aspectos geográficos, culturais, históricos e turísticos do Paraná' },
  { codigo_sae: '5700', nome: 'Programação back-end I' },
  { codigo_sae: '5900', nome: 'Programação back-end II' },
  { codigo_sae: '6633', nome: 'Interação, ensino, serviço e comunidade' },
];

async function main() {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    await client.query('BEGIN');

    for (const u of updates) {
      const res = await client.query(
        'UPDATE disciplinas_catalogo SET nome = $1 WHERE codigo_sae = $2',
        [u.nome, u.codigo_sae]
      );
      console.log(`codigo_sae ${u.codigo_sae}: ${res.rowCount} linha(s) atualizada(s)`);
    }

    const check = await client.query(
      `SELECT codigo_sae, nome FROM disciplinas_catalogo
       WHERE codigo_sae = ANY($1::text[])
       ORDER BY codigo_sae::int`,
      [updates.map(u => u.codigo_sae)]
    );

    console.log('\n--- Verificação ---');
    console.table(check.rows);

    if (shouldCommit) {
      await client.query('COMMIT');
      console.log('\nCOMMIT aplicado — alterações gravadas.');
    } else {
      await client.query('ROLLBACK');
      console.log('\nDRY-RUN — nada foi gravado (ROLLBACK). Rode com --commit pra aplicar de verdade.');
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('ERRO — ROLLBACK aplicado:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
