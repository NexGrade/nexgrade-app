// Exporta o catalogo de disciplinas do Mario Braga (id, nome,
// codigoSae, sigla) para um JSON legivel, pra cruzar com as siglas
// usadas na grade horaria real (MAT, LPORT, R MAT, HIST, etc.) sem
// adivinhar a correspondencia.
//
// Somente LEITURA -- nao altera nada no banco.
//
// Uso:
//   cd C:\Projetos\nexgrade-app
//   node lib/db/exportar-disciplinas-mario-braga.cjs

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Le a DATABASE_URL do .env em lib/db/.env (mesmo padrao usado nos
// outros scripts .cjs deste projeto)
const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const match = envContent.match(/^DATABASE_URL=(.+)$/m);
if (!match) {
  console.error('ERRO: DATABASE_URL nao encontrada em .env');
  process.exit(1);
}
const databaseUrl = match[1].trim().replace(/^["']|["']$/g, '');

const ESCOLA_ID_MARIO_BRAGA = 'org_3HCMsuYeAwkggR1dxXNzEdzNaX8';

async function main() {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const result = await pool.query(
      `SELECT id, nome, codigo_sae, sigla
       FROM disciplinas
       WHERE escola_id = $1
       ORDER BY nome ASC`,
      [ESCOLA_ID_MARIO_BRAGA]
    );

    console.log(`\nTotal de disciplinas cadastradas para o Mario Braga: ${result.rows.length}\n`);
    console.log('id\tcodigo_sae\tsigla\tnome');
    for (const row of result.rows) {
      console.log(`${row.id}\t${row.codigo_sae ?? '(vazio)'}\t${row.sigla ?? '(vazio)'}\t${row.nome}`);
    }

    const outPath = path.join(__dirname, 'disciplinas-mario-braga.json');
    fs.writeFileSync(outPath, JSON.stringify(result.rows, null, 2), 'utf8');
    console.log(`\nSalvo tambem em: ${outPath}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Erro ao consultar:', err);
  process.exit(1);
});
