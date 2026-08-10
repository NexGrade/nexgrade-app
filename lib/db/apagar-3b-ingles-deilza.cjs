const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ESCOLA_ID = 'org_3HCLFry0r48pfutN7ChZIip3IWL';
const APLICAR = process.argv.includes('--aplicar');

function loadDatabaseUrl() {
  const envPath = path.join(__dirname, '.env');
  const raw = fs.readFileSync(envPath, 'utf8');
  const match = raw.split('\n').find((l) => l.trim().startsWith('DATABASE_URL='));
  return match.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
}

async function main() {
  const client = new Client({ connectionString: loadDatabaseUrl() });
  await client.connect();

  console.log(APLICAR ? 'MODO: APLICAR' : 'MODO: DRY-RUN');

  const { rows } = await client.query(
    `SELECT td.id, t.nome AS turma, d.nome AS disciplina, td.professor_id, p.nome AS professor,
            im.carga_horaria_semanal AS matriz, td.carga_horaria_semanal_override AS override
     FROM turma_disciplinas td
     JOIN turmas t ON t.id = td.turma_id
     JOIN disciplinas d ON d.id = td.disciplina_id
     JOIN professores p ON p.id = td.professor_id
     LEFT JOIN itens_matriz im ON im.matriz_curricular_id = t.matriz_curricular_id AND im.disciplina_id = td.disciplina_id
     WHERE t.escola_id = $1 AND t.nome = '3B' AND d.codigo_sae = '1501'`,
    [ESCOLA_ID]
  );
  if (rows.length !== 1) {
    console.error(`ERRO: esperava 1 vínculo, achei ${rows.length}.`);
    await client.end();
    process.exit(1);
  }
  const v = rows[0];
  if (v.matriz !== null || v.professor !== 'Deilza S B K') {
    console.error(`ERRO: dados inesperados -- matriz=${v.matriz}, professor="${v.professor}". Parando por segurança.`);
    await client.end();
    process.exit(1);
  }
  console.log(`  vinculo_id=${v.id} | ${v.turma} / "${v.disciplina}" | professor="${v.professor}" | matriz=${v.matriz} | override=${v.override} -> APAGAR`);

  if (!APLICAR) {
    console.log('\n(dry-run) Nada foi gravado. Rode com --aplicar para gravar de verdade.');
    await client.end();
    return;
  }

  await client.query('BEGIN');
  try {
    await client.query(`DELETE FROM turma_disciplinas WHERE id = $1`, [v.id]);
    await client.query('COMMIT');
    console.log('\n✓ Apagado e commitado.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro — rollback feito:', err.message);
  }

  await client.end();
}

main().catch((err) => { console.error('Erro:', err.message); process.exit(1); });
