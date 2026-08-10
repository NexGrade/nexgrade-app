const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ESCOLA_ID = 'org_3HCLFry0r48pfutN7ChZIip3IWL';

function loadDatabaseUrl() {
  const envPath = path.join(__dirname, '.env');
  const raw = fs.readFileSync(envPath, 'utf8');
  const match = raw.split('\n').find((l) => l.trim().startsWith('DATABASE_URL='));
  return match.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
}

async function main() {
  const client = new Client({ connectionString: loadDatabaseUrl() });
  await client.connect();

  const { rows: turmas } = await client.query(
    `SELECT id, nome, matriz_curricular_id FROM turmas WHERE escola_id = $1 AND turno = 'vespertino'`,
    [ESCOLA_ID]
  );
  const turmaIds = turmas.map((t) => t.id);
  const turmaById = new Map(turmas.map((t) => [t.id, t]));

  const { rows: td } = await client.query(
    `SELECT td.turma_id, td.professor_id, p.nome AS professor,
            COALESCE(im.carga_horaria_semanal, td.carga_horaria_semanal_override) AS horas
     FROM turma_disciplinas td
     JOIN professores p ON p.id = td.professor_id
     JOIN turmas t ON t.id = td.turma_id
     LEFT JOIN itens_matriz im ON im.matriz_curricular_id = t.matriz_curricular_id AND im.disciplina_id = td.disciplina_id
     WHERE td.turma_id = ANY($1::int[]) AND td.professor_id IS NOT NULL`,
    [turmaIds]
  );

  const somaPorProfessor = new Map();
  for (const r of td) {
    if (!somaPorProfessor.has(r.professor_id)) somaPorProfessor.set(r.professor_id, { nome: r.professor, horas: 0, turmas: new Set() });
    const entry = somaPorProfessor.get(r.professor_id);
    entry.horas += Number(r.horas || 0);
    entry.turmas.add(turmaById.get(r.turma_id).nome);
  }

  console.log('Verificando cada professor...\n');
  const suspeitos = [];
  for (const [profId, entry] of somaPorProfessor) {
    const { rows: disp } = await client.query(
      `SELECT dia_semana, horario_slot FROM disponibilidade_professores
       WHERE professor_id = $1 AND (turno = 'vespertino' OR turno IS NULL) AND disponivel = false`,
      [profId]
    );
    const bloqueados = new Set(disp.map((d) => `${d.dia_semana}-${d.horario_slot}`));
    let livres = 0;
    for (let dia = 0; dia < 5; dia++) for (let aula = 1; aula <= 5; aula++) if (!bloqueados.has(`${dia}-${aula}`)) livres++;

    if (entry.horas > livres) {
      suspeitos.push({ nome: entry.nome, horas: entry.horas, livres, turmas: [...entry.turmas] });
    }
  }

  suspeitos.sort((a, b) => (b.horas - b.livres) - (a.horas - a.livres));
  console.log(`=== Professores SOBRECARREGADOS (precisam de mais horas do que têm livre) ===`);
  for (const s of suspeitos) {
    console.log(`  ${s.nome}: precisa ${s.horas}h, só tem ${s.livres} livres (falta ${s.horas - s.livres}h) — turmas: ${s.turmas.join(', ')}`);
  }
  console.log(`\nTotal de professores sobrecarregados: ${suspeitos.length}`);

  await client.end();
}

main().catch((err) => { console.error('Erro:', err.message); process.exit(1); });
