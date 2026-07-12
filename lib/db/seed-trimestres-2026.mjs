import pg from 'pg';
const c = new pg.Client({connectionString: process.env.DATABASE_URL, ssl:{rejectUnauthorized:false}});
await c.connect();

const ESCOLA_ID = 'escola_default';
const ANO = 2026;

const trimestres = [
  [1, '2026-02-05', '2026-05-14', 63],
  [2, '2026-05-18', '2026-09-04', 68],
  [3, '2026-09-08', '2026-12-18', 70],
];

try {
  await c.query('BEGIN');
  await c.query('DELETE FROM trimestres_letivos WHERE escola_id = $1 AND ano = $2', [ESCOLA_ID, ANO]);

  for (const [trimestre, inicio, fim, dias] of trimestres) {
    await c.query(
      'INSERT INTO trimestres_letivos (escola_id, ano, trimestre, data_inicio, data_fim, dias_letivos) VALUES ($1,$2,$3,$4,$5,$6)',
      [ESCOLA_ID, ANO, trimestre, inicio, fim, dias]
    );
  }

  // Também insere os marcos de início/fim de trimestre como eventos no calendário
  for (const [trimestre, inicio, fim] of trimestres) {
    await c.query(
      'INSERT INTO calendario_escolar (escola_id, ano, data, tipo, descricao, dia_letivo) VALUES ($1,$2,$3,$4,$5,$6)',
      [ESCOLA_ID, ANO, inicio, 'inicio_trimestre', `Início do ${trimestre}º Trimestre`, true]
    );
    await c.query(
      'INSERT INTO calendario_escolar (escola_id, ano, data, tipo, descricao, dia_letivo) VALUES ($1,$2,$3,$4,$5,$6)',
      [ESCOLA_ID, ANO, fim, 'fim_trimestre', `Fim do ${trimestre}º Trimestre`, true]
    );
  }

  await c.query('COMMIT');
  console.log(`✅ ${trimestres.length} trimestres inseridos (201 dias letivos totais).`);
} catch (err) {
  await c.query('ROLLBACK');
  console.error('❌ ERRO:', err.message);
} finally {
  await c.end();
}