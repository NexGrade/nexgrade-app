// auditar-professores-disciplinas.cjs
// Script SOMENTE LEITURA — não altera nada no banco.
// Escola alvo: Mário Braga (org_3HCMsuYeAwkggR1dxXNzEdzNaX8)
//
// Cobre:
//   1. Professor Alecksey (busca detalhada)
//   2. Lista completa de professores + contagens de vínculo
//   3. Professores com nome/email suspeitos (placeholder, asterisco, números)
//   4. Lista completa de disciplinas da escola
//   5. Disciplinas possivelmente duplicadas (nome normalizado igual)
//   6. Divergência entre carga esperada (matriz/override) e aulas reais agendadas
//
// Uso:
//   node auditar-professores-disciplinas.cjs > auditoria-output.txt 2>&1

const fs = require('fs');
const { Client } = require('pg');

const ESCOLA_ID = 'org_3HCMsuYeAwkggR1dxXNzEdzNaX8'; // Mário Braga

function getDatabaseUrl() {
  const envContent = fs.readFileSync('.env', 'utf8');
  const match = envContent.match(/^DATABASE_URL=(.+)$/m);
  if (!match) throw new Error('DATABASE_URL não encontrada no .env');
  let url = match[1].trim();
  url = url.replace(/^["']|["']$/g, '');
  return url;
}

// Normaliza nome de disciplina removendo numeração romana/arábica no final,
// pra detectar duplicatas como "MATEMÁTICA I" vs "MATEMATICA 1"
function normalizarNomeDisciplina(nome) {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .toUpperCase()
    .replace(/\s+(I|II|III|IV|V|VI|VII|VIII|IX|X|1|2|3|4|5|6|7|8|9|10)\s*$/i, '')
    .trim();
}

async function main() {
  const client = new Client({
    connectionString: getDatabaseUrl(),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log(`Conectado. Escola alvo: ${ESCOLA_ID}\n`);

  // ===== 1. Professor Alecksey =====
  console.log('========================================');
  console.log('1. PROFESSOR ALECKSEY');
  console.log('========================================');
  const alecksey = await client.query(
    `SELECT id, nome, email, cpf, matricula, telefone, carga_horaria_total, ativo
     FROM professores
     WHERE escola_id = $1 AND nome ILIKE '%alecksey%'`,
    [ESCOLA_ID]
  );
  if (alecksey.rows.length === 0) {
    console.log('NENHUM professor com nome contendo "alecksey" encontrado nesta escola.');
  } else {
    for (const p of alecksey.rows) {
      console.log(`\nid=${p.id} | nome="${p.nome}" | email=${p.email} | ativo=${p.ativo} | carga_horaria_total=${p.carga_horaria_total}`);

      const disc = await client.query(
        `SELECT pd.disciplina_id, d.nome
         FROM professor_disciplinas pd
         JOIN disciplinas d ON d.id = pd.disciplina_id
         WHERE pd.professor_id = $1`,
        [p.id]
      );
      console.log(`  Disciplinas vinculadas (professor_disciplinas): ${disc.rows.length}`);
      disc.rows.forEach((d) => console.log(`    - [${d.disciplina_id}] ${d.nome}`));

      const titular = await client.query(
        `SELECT td.turma_id, t.nome AS turma_nome, td.disciplina_id, d.nome AS disciplina_nome
         FROM turma_disciplinas td
         JOIN turmas t ON t.id = td.turma_id
         JOIN disciplinas d ON d.id = td.disciplina_id
         WHERE td.professor_id = $1 OR td.professor_apoio_id = $1`,
        [p.id]
      );
      console.log(`  Vínculos em turma_disciplinas (titular ou apoio): ${titular.rows.length}`);
      titular.rows.forEach((t) =>
        console.log(`    - turma ${t.turma_nome} [${t.turma_id}] / ${t.disciplina_nome} [${t.disciplina_id}]`)
      );

      const aulas = await client.query(`SELECT COUNT(*)::int AS total FROM horarios WHERE professor_id = $1`, [p.id]);
      console.log(`  Aulas agendadas em "horarios": ${aulas.rows[0].total}`);

      const aulasExp = await client.query(`SELECT COUNT(*)::int AS total FROM horarios_experimentais WHERE professor_id = $1`, [p.id]);
      console.log(`  Aulas em "horarios_experimentais": ${aulasExp.rows[0].total}`);

      const licenca = await client.query(
        `SELECT * FROM licencas_professores WHERE professor_id = $1 OR professor_substituto_id = $1`,
        [p.id]
      );
      console.log(`  Registros em "licencas_professores": ${licenca.rows.length}`);

      const disponib = await client.query(
        `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE disponivel = true)::int AS disponiveis
         FROM disponibilidade_professores WHERE professor_id = $1`,
        [p.id]
      );
      console.log(`  Disponibilidade cadastrada: ${disponib.rows[0].total} slots (${disponib.rows[0].disponiveis} disponíveis)`);
    }
  }

  // ===== 2. Lista completa de professores =====
  console.log('\n========================================');
  console.log('2. TODOS OS PROFESSORES DA ESCOLA');
  console.log('========================================');
  const todosProf = await client.query(
    `SELECT p.id, p.nome, p.email, p.ativo, p.carga_horaria_total,
       (SELECT COUNT(*) FROM professor_disciplinas pd WHERE pd.professor_id = p.id)::int AS n_disciplinas,
       (SELECT COUNT(*) FROM turma_disciplinas td WHERE td.professor_id = p.id)::int AS n_turmas_titular,
       (SELECT COUNT(*) FROM horarios h WHERE h.professor_id = p.id)::int AS n_aulas_horario
     FROM professores p
     WHERE p.escola_id = $1
     ORDER BY p.nome`,
    [ESCOLA_ID]
  );
  console.log(`Total: ${todosProf.rows.length} professores\n`);
  console.log('id | nome | ativo | disciplinas_vinc | turmas_titular | aulas_em_horarios');
  todosProf.rows.forEach((p) => {
    console.log(`${p.id} | ${p.nome} | ${p.ativo} | ${p.n_disciplinas} | ${p.n_turmas_titular} | ${p.n_aulas_horario}`);
  });

  // ===== 3. Nomes/emails suspeitos =====
  console.log('\n========================================');
  console.log('3. PROFESSORES COM NOME/EMAIL SUSPEITOS');
  console.log('========================================');
  const suspeitos = await client.query(
    `SELECT id, nome, email, ativo
     FROM professores
     WHERE escola_id = $1
       AND (
         email ILIKE '%pendente%' OR
         email ILIKE '%corrigir%' OR
         nome LIKE '%*%' OR
         nome ~ '[0-9]'
       )
     ORDER BY nome`,
    [ESCOLA_ID]
  );
  if (suspeitos.rows.length === 0) {
    console.log('Nenhum encontrado com esses critérios.');
  } else {
    suspeitos.rows.forEach((p) => console.log(`id=${p.id} | nome="${p.nome}" | email=${p.email} | ativo=${p.ativo}`));
  }

  // ===== 4. Disciplinas da escola =====
  console.log('\n========================================');
  console.log('4. DISCIPLINAS DA ESCOLA');
  console.log('========================================');
  const disciplinas = await client.query(
    `SELECT id, nome, sigla, carga_semanal, codigo_sae, categoria_curricular_padrao, sem_turma
     FROM disciplinas
     WHERE escola_id = $1
     ORDER BY nome`,
    [ESCOLA_ID]
  );
  console.log(`Total: ${disciplinas.rows.length} disciplinas\n`);
  disciplinas.rows.forEach((d) => {
    console.log(
      `[${d.id}] ${d.nome} | sigla=${d.sigla || '-'} | carga_semanal=${d.carga_semanal} | categoria=${d.categoria_curricular_padrao || '-'} | sem_turma=${d.sem_turma}`
    );
  });

  // ===== 5. Disciplinas possivelmente duplicadas =====
  console.log('\n========================================');
  console.log('5. DISCIPLINAS POSSIVELMENTE DUPLICADAS');
  console.log('(mesmo nome normalizado, ids diferentes)');
  console.log('========================================');
  const grupos = new Map();
  disciplinas.rows.forEach((d) => {
    const chave = normalizarNomeDisciplina(d.nome);
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(d);
  });
  let algumaDuplicata = false;
  for (const [chave, itens] of grupos.entries()) {
    if (itens.length > 1) {
      algumaDuplicata = true;
      console.log(`\nGrupo "${chave}":`);
      itens.forEach((d) => console.log(`  [${d.id}] ${d.nome} (carga_semanal=${d.carga_semanal})`));
    }
  }
  if (!algumaDuplicata) console.log('Nenhuma duplicata aparente encontrada.');

  // ===== 6. Divergência de carga de aulas =====
  console.log('\n========================================');
  console.log('6. CARGA ESPERADA vs AULAS REAIS (horarios)');
  console.log('por turma + disciplina — só turmas não-fantasma');
  console.log('========================================');
  const cargas = await client.query(
    `SELECT
       td.turma_id, t.nome AS turma_nome, t.turno,
       td.disciplina_id, d.nome AS disciplina_nome,
       COALESCE(td.carga_horaria_semanal_override, d.carga_semanal) AS carga_esperada,
       (SELECT COUNT(*)::int FROM horarios h WHERE h.turma_id = td.turma_id AND h.disciplina_id = td.disciplina_id) AS aulas_reais
     FROM turma_disciplinas td
     JOIN turmas t ON t.id = td.turma_id
     JOIN disciplinas d ON d.id = td.disciplina_id
     WHERE t.escola_id = $1 AND t.fantasma = false
     ORDER BY t.turno, t.nome, d.nome`,
    [ESCOLA_ID]
  );

  // separa: turmas sem nenhum horário gerado ainda vs turmas com divergência real
  const semHorarioGerado = new Map(); // turma_id -> turma_nome
  const divergencias = [];
  const totaisPorTurma = new Map(); // turma_id -> {temAlgumHorario}
  for (const row of cargas.rows) {
    if (row.aulas_reais > 0) {
      if (!totaisPorTurma.has(row.turma_id)) totaisPorTurma.set(row.turma_id, true);
    }
  }
  for (const row of cargas.rows) {
    const turmaTemHorario = totaisPorTurma.has(row.turma_id);
    if (!turmaTemHorario) {
      semHorarioGerado.set(row.turma_id, `${row.turma_nome} (${row.turno})`);
    } else if (row.carga_esperada !== row.aulas_reais) {
      divergencias.push(row);
    }
  }

  console.log(`\nTurmas SEM nenhum horário gerado ainda (${semHorarioGerado.size}):`);
  [...semHorarioGerado.values()].forEach((n) => console.log(`  - ${n}`));

  console.log(`\nDivergências reais (turma já tem grade, mas carga não bate) — ${divergencias.length}:`);
  divergencias.forEach((r) => {
    console.log(
      `  - ${r.turma_nome} (${r.turno}) / ${r.disciplina_nome}: esperado=${r.carga_esperada}, real=${r.aulas_reais}`
    );
  });

  await client.end();
  console.log('\nFim da auditoria.');
}

main().catch((err) => {
  console.error('Erro:', err.message);
  process.exit(1);
});
