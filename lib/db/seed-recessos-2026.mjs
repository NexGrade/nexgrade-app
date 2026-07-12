import pg from 'pg';
const c = new pg.Client({connectionString: process.env.DATABASE_URL, ssl:{rejectUnauthorized:false}});
await c.connect();

const ESCOLA_ID = 'escola_default';
const ANO = 2026;

const recessos = [
  ['2026-05-15', 'Recesso entre 1º e 2º Trimestre'],
  ['2026-05-16', 'Recesso entre 1º e 2º Trimestre'],
  ['2026-05-17', 'Recesso entre 1º e 2º Trimestre'],
  ['2026-07-13', 'Recesso Escolar'],
  ['2026-07-14', 'Recesso Escolar'],
  ['2026-07-15', 'Recesso Escolar'],
  ['2026-07-16', 'Recesso Escolar'],
  ['2026-07-17', 'Recesso Escolar'],
  ['2026-07-18', 'Recesso Escolar'],
  ['2026-07-19', 'Recesso Escolar'],
  ['2026-07-20', 'Recesso Escolar'],
  ['2026-07-21', 'Recesso Escolar'],
  ['2026-07-22', 'Recesso Escolar'],
  ['2026-09-05', 'Recesso entre 2º e 3º Trimestre'],
  ['2026-09-06', 'Recesso entre 2º e 3º Trimestre'],
  ['2026-09-07', 'Recesso entre 2º e 3º Trimestre'],
];

try {
  await c.query('BEGIN');
  await c.query("DELETE FROM calendario_escolar WHERE escola_id = $1 AND ano = $2 AND tipo = 'recesso'", [ESCOLA_ID, ANO]);

  for (const [data, descricao] of recessos) {
    await c.query(
      'INSERT INTO calendario_escolar (escola_id, ano, data, tipo, descricao, dia_letivo) VALUES ($1,$2,$3,$4,$5,$6)',
      [ESCOLA_ID, ANO, data, 'recesso', descricao, false]
    );
  }

  await c.query('COMMIT');
  console.log(`✅ ${recessos.length} dias de recesso inseridos.`);
} catch (err) {
  await c.query('ROLLBACK');
  console.error('❌ ERRO:', err.message);
} finally {
  await c.end();
}