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
      `SELECT id, nome, codigo_sae, categoria_curricular_padrao, carga_semanal_sugerida
       FROM disciplinas_catalogo WHERE nome ILIKE '%nos If%' OR nome ILIKE '%administra%if%'`
    );
    log(`Encontrados: ${rows.length}`);
    for (const r of rows) {
      log(JSON.stringify(r, null, 2));
    }

    // Também procura se existe alguma disciplina com nome parecido que tenha "IF" completo por extenso,
    // pra ver se há uma pista de contexto (mesmo curso/eixo).
    const { rows: parecidas } = await client.query(
      `SELECT id, nome, codigo_sae FROM disciplinas_catalogo
       WHERE codigo_sae IS NOT NULL
       ORDER BY id`
    );
    // não precisa logar tudo, só confirma total
    log(`\nTotal disciplinas com codigo_sae preenchido: ${parecidas.length}`);
  } finally {
    await client.end();
    fs.writeFileSync(path.join(__dirname, 'checar-disciplina-if-relatorio.txt'), linhasSaida.join('\n'), { encoding: 'utf8' });
  }
}
main();
