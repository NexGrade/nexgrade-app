// Varredura de vínculos "fantasma": turma_disciplinas onde existe um
// carga_horaria_semanal_override definido manualmente, mas NÃO existe
// nenhuma entrada correspondente em itens_matriz (matriz_curricular_id +
// disciplina_id da turma).
//
// Por que isso importa: o override sempre tem prioridade sobre a matriz
// real na hora de montar a grade (tanto no motor heuristico quanto no
// CP-SAT). Se alguem cria um override "no chute" pra uma disciplina que
// na verdade nao existe pra aquela turma, o sistema nunca vai reclamar
// sozinho -- so aparece como sobrecarga real de professor la na frente,
// na hora de gerar a grade. Foi exatamente o que aconteceu hoje com
// Fisica II/III e Quimica I na 3A e Lingua Inglesa na 3B.
//
// Uso: node auditar-vinculos-fantasma.cjs [--turno=matutino|vespertino|noturno]
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ESCOLA_ID = process.argv.find((a) => a.startsWith('--escola='))?.split('=')[1] || 'org_3HCLFry0r48pfutN7ChZIip3IWL';
const TURNO = process.argv.find((a) => a.startsWith('--turno='))?.split('=')[1];

function loadDatabaseUrl() {
  const envPath = path.join(__dirname, '.env');
  const raw = fs.readFileSync(envPath, 'utf8');
  const match = raw.split('\n').find((l) => l.trim().startsWith('DATABASE_URL='));
  return match.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
}

async function main() {
  const client = new Client({ connectionString: loadDatabaseUrl() });
  await client.connect();

  const turnoFiltro = TURNO ? `AND t.turno = '${TURNO}'` : '';
  const { rows } = await client.query(
    `SELECT td.id AS vinculo_id, t.nome AS turma, t.turno, d.nome AS disciplina, d.codigo_sae,
            p.nome AS professor, td.carga_horaria_semanal_override AS override
     FROM turma_disciplinas td
     JOIN turmas t ON t.id = td.turma_id
     JOIN disciplinas d ON d.id = td.disciplina_id
     LEFT JOIN professores p ON p.id = td.professor_id
     LEFT JOIN itens_matriz im ON im.matriz_curricular_id = t.matriz_curricular_id AND im.disciplina_id = td.disciplina_id
     WHERE t.escola_id = $1 ${turnoFiltro}
       AND td.carga_horaria_semanal_override IS NOT NULL
       AND im.id IS NULL
     ORDER BY t.turno, t.nome, d.nome`,
    [ESCOLA_ID]
  );

  console.log(`Vínculos com override mas SEM entrada na matriz real: ${rows.length}\n`);
  if (rows.length === 0) {
    console.log('Nenhum encontrado -- nada suspeito no momento.');
  } else {
    console.log('⚠ Candidatos a "vínculo fantasma" -- confirmar contra a grade real antes de mexer:');
    for (const r of rows) {
      console.log(`  [${r.turno}] ${r.turma} / "${r.disciplina}" (sae=${r.codigo_sae}) | professor="${r.professor}" | override=${r.override}h (vinculo_id=${r.vinculo_id})`);
    }
  }

  await client.end();
}

main().catch((err) => { console.error('Erro:', err.message); process.exit(1); });
