import pg from 'pg';
const c = new pg.Client({connectionString: process.env.DATABASE_URL, ssl:{rejectUnauthorized:false}});
await c.connect();

const ESCOLA_ID = 'escola_default';
const ANO = 2026;

const eventos = [
  ['2026-01-01', 'feriado', 'Confraternização Universal', false],
  ['2026-02-16', 'feriado', 'Carnaval', false],
  ['2026-02-17', 'feriado', 'Carnaval', false],
  ['2026-04-03', 'feriado', 'Sexta-feira Santa', false],
  ['2026-04-21', 'feriado', 'Tiradentes', false],
  ['2026-05-01', 'feriado', 'Dia do Trabalho', false],
  ['2026-06-04', 'feriado', 'Corpus Christi', false],
  ['2026-09-07', 'feriado', 'Independência do Brasil', false],
  ['2026-10-12', 'feriado', 'Nossa Senhora Aparecida', false],
  ['2026-11-02', 'feriado', 'Finados', false],
  ['2026-11-15', 'feriado', 'Proclamação da República', false],
  ['2026-11-20', 'feriado', 'Consciência Negra', false],
  ['2026-12-25', 'feriado', 'Natal', false],
];

try {
  await c.query('BEGIN');
  await c.query('DELETE FROM calendario_escolar WHERE escola_id = $1 AND ano = $2', [ESCOLA_ID, ANO]);
  await c.query('DELETE FROM trimestres_letivos WHERE escola_id = $1 AND ano = $2', [ESCOLA_ID, ANO]);

  for (const [data, tipo, descricao, diaLetivo] of eventos) {
    await c.query(
      'INSERT INTO calendario_escolar (escola_id, ano, data, tipo, descricao, dia_letivo) VALUES ($1,$2,$3,$4,$5,$6)',
      [ESCOLA_ID, ANO, data, tipo, descricao, diaLetivo]
    );
  }

  await c.query('COMMIT');
  console.log(`✅ ${eventos.length} feriados de ${ANO} inseridos.`);
} catch (err) {
  await c.query('ROLLBACK');
  console.error('❌ ERRO:', err.message);
} finally {
  await c.end();
}