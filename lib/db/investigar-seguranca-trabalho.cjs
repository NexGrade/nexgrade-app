/**
 * investigar-seguranca-trabalho.cjs
 * Script SOMENTE LEITURA.
 *
 * Investiga os dois registros "Segurança do Trabalho" no catálogo
 * (id=583 codigo_sae=4014 em uso; id=786 codigo_sae=4376 nunca usado)
 * pra entender se são cursos distintos ou duplicata de cadastro.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function carregarDatabaseUrl() {
  const envPath = path.join(__dirname, '.env');
  const conteudo = fs.readFileSync(envPath, 'utf8');
  const linha = conteudo.split('\n').find((l) => l.trim().startsWith('DATABASE_URL='));
  if (!linha) throw new Error('DATABASE_URL não encontrada no .env');
  let valor = linha.slice(linha.indexOf('=') + 1).trim();
  return valor.replace(/^["']|["']$/g, '');
}

async function main() {
  const client = new Client({ connectionString: carregarDatabaseUrl() });
  await client.connect();
  const linhasSaida = [];
  const log = (msg = '') => { linhasSaida.push(String(msg)); console.log(msg); };
  try {
    const { rows } = await client.query(
      `SELECT id, nome, codigo_sae, categoria_curricular_padrao, carga_semanal_sugerida, tipo_sala_exigido
       FROM disciplinas_catalogo WHERE id IN (583, 786)`
    );
    for (const r of rows) log(JSON.stringify(r, null, 2));

    // Checa uso em ambas as escolas (via disciplinas) e no molde
    const { rows: usos } = await client.query(
      `SELECT id, escola_id, nome, codigo_sae FROM disciplinas WHERE codigo_sae IN ('4014','4376')`
    );
    log('\n--- Uso em disciplinas (escolas + molde) ---');
    for (const u of usos) log(JSON.stringify(u));

    // Checa se algum itens_matriz referencia essas disciplinas do molde
    const idsNoMolde = usos.filter(u => u.escola_id === 'catalogo_geral').map(u => u.id);
    if (idsNoMolde.length > 0) {
      const { rows: matrizUso } = await client.query(
        `SELECT COUNT(*) AS total, disciplina_id FROM itens_matriz WHERE disciplina_id = ANY($1) GROUP BY disciplina_id`,
        [idsNoMolde]
      );
      log('\n--- Uso em itens_matriz ---');
      for (const m of matrizUso) log(JSON.stringify(m));
    }
  } finally {
    await client.end();
    fs.writeFileSync(path.join(__dirname, 'investigar-seguranca-trabalho-relatorio.txt'), linhasSaida.join('\n'), { encoding: 'utf8' });
  }
}
main();
