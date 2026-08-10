const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ESCOLA_ID = 'org_3HCLFry0r48pfutN7ChZIip3IWL';
const DIAS = ['Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta'];

function loadDatabaseUrl() {
  const envPath = path.join(__dirname, '.env');
  const raw = fs.readFileSync(envPath, 'utf8');
  const match = raw.split('\n').find((l) => l.trim().startsWith('DATABASE_URL='));
  return match.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
}

async function main() {
  const client = new Client({ connectionString: loadDatabaseUrl() });
  await client.connect();

  const { rows: turma } = await client.query(
    `SELECT id, matriz_curricular_id FROM turmas WHERE escola_id = $1 AND nome = '3D TEC'`,
    [ESCOLA_ID]
  );
  const turmaId = turma[0].id;

  const { rows: td } = await client.query(
    `SELECT d.nome AS disciplina, p.id AS professor_id, p.nome AS professor, im.carga_horaria_semanal AS horas
     FROM turma_disciplinas td
     JOIN disciplinas d ON d.id = td.disciplina_id
     JOIN professores p ON p.id = td.professor_id
     LEFT JOIN itens_matriz im ON im.matriz_curricular_id = $2 AND im.disciplina_id = td.disciplina_id
     WHERE td.turma_id = $1`,
    [turmaId, turma[0].matriz_curricular_id]
  );

  const profIds = [...new Set(td.map((r) => r.professor_id))];
  const livrePorProf = new Map();
  for (const profId of profIds) {
    const { rows: disp } = await client.query(
      `SELECT dia_semana, horario_slot, disponivel FROM disponibilidade_professores
       WHERE professor_id = $1 AND turno = 'noturno'`,
      [profId]
    );
    const bloqueados = new Set(disp.filter((d) => !d.disponivel).map((d) => `${d.dia_semana}-${d.horario_slot}`));
    const livres = [];
    for (let dia = 0; dia < 5; dia++) {
      for (let aula = 1; aula <= 6; aula++) {
        if (!bloqueados.has(`${dia}-${aula}`)) livres.push(`${dia}-${aula}`);
      }
    }
    livrePorProf.set(profId, livres);
  }

  console.log('=== Slots livres por professor/disciplina ===');
  const necessidade = td.map((r) => ({ ...r, livres: livrePorProf.get(r.professor_id) }));
  for (const n of necessidade) {
    console.log(`  ${n.professor} / ${n.disciplina}: precisa ${n.horas}h, tem ${n.livres.length} slots livres ${n.livres.length < n.horas ? '⚠ INSUFICIENTE' : ''}`);
  }

  console.log('\n=== Total por professor ===');
  const porProf = new Map();
  for (const n of necessidade) {
    if (!porProf.has(n.professor_id)) porProf.set(n.professor_id, { nome: n.professor, horas: 0, livres: n.livres });
    porProf.get(n.professor_id).horas += Number(n.horas);
  }
  for (const [, p] of porProf) {
    const folga = p.livres.length - p.horas;
    console.log(`  ${p.nome}: precisa ${p.horas}h, tem ${p.livres.length} livres ${folga < 0 ? '⚠ INSUFICIENTE' : folga === 0 ? '(zero folga)' : `(folga ${folga})`}`);
  }

  console.log('\n=== Colisão entre professores sem folga ===');
  const semFolga = [...porProf.values()].filter((p) => p.livres.length === p.horas);
  const slotParaProfessores = new Map();
  for (const p of semFolga) {
    for (const slot of p.livres) {
      if (!slotParaProfessores.has(slot)) slotParaProfessores.set(slot, []);
      slotParaProfessores.get(slot).push(p.nome);
    }
  }
  let colisoes = 0;
  for (const [slot, nomes] of slotParaProfessores) {
    if (nomes.length > 1) {
      const [dia, aula] = slot.split('-').map(Number);
      console.log(`  ⚠ COLISÃO em ${DIAS[dia]} ${aula}ª: ${nomes.join(', ')}`);
      colisoes++;
    }
  }
  console.log(`\nTotal de colisões: ${colisoes}`);
  if (colisoes === 0) console.log('Nenhuma colisão determinística -- em teoria, existe solução.');

  await client.end();
}

main().catch((err) => { console.error('Erro:', err.message); process.exit(1); });
