const { Client } = require('pg');
const APLICAR = process.argv.includes('--aplicar');

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const antes = await c.query(
    `SELECT COUNT(*) AS total FROM disponibilidade_professores WHERE motivo LIKE 'Hora-atividade institucional (recalculada automaticamente)%'`
  );
  console.log('Linhas de HA auto-calculada encontradas:', antes.rows[0].total);
  if (APLICAR) {
    const del = await c.query(`DELETE FROM disponibilidade_professores WHERE motivo LIKE 'Hora-atividade institucional (recalculada automaticamente)%'`);
    console.log('APLICADO:', del.rowCount, 'linhas removidas.');
  } else {
    console.log('DRY-RUN -- rode com --aplicar para remover.');
  }
  await c.end();
}
main().catch(e => { console.error(e); process.exit(1); });
