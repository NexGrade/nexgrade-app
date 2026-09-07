/**
 * reverter-ha-sincronizada.cjs
 *
 * Remove APENAS as linhas de disponibilidade_professores inseridas pelo
 * sincronizar-disponibilidade-07-11-09.cjs com motivo de HA (marcadas
 * "Sincronizado do PDF oficial Urania (HA)..."). Essas linhas travavam
 * o professor ANTES da geracao do CP-SAT, o que e o mesmo bug ja
 * identificado nesta sessao (INFEASIBLE na segunda etapa). A HA real
 * deve ser calculada e aplicada SOMENTE depois da grade gerada, via
 * calcular-e-posicionar-ha.cjs.
 *
 * Nao mexe nas linhas de bloqueio real (tracos) nem nas de ESPECIAL
 * (PAEE/COORD/etc), que continuam validas.
 *
 * Uso:
 *   node reverter-ha-sincronizada.cjs            (dry-run)
 *   node reverter-ha-sincronizada.cjs --aplicar   (remove)
 */
const { Client } = require('pg');

const APLICAR = process.argv.includes('--aplicar');

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const check = await c.query(
      `SELECT COUNT(*) AS total FROM disponibilidade_professores WHERE motivo LIKE 'Sincronizado do PDF oficial Urania (HA)%'`
    );
    console.log(`Linhas de HA sincronizada encontradas: ${check.rows[0].total}`);

    if (!APLICAR) {
      console.log('DRY-RUN -- rode com --aplicar para remover.');
      return;
    }

    const del = await c.query(
      `DELETE FROM disponibilidade_professores WHERE motivo LIKE 'Sincronizado do PDF oficial Urania (HA)%'`
    );
    console.log(`APLICADO: ${del.rowCount} linhas removidas.`);
  } finally {
    await c.end();
  }
}

main().catch(e => { console.error(e); process.exitCode = 1; });
