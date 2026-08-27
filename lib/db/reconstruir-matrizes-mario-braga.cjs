// reconstruir-matrizes-mario-braga.cjs
//
// Operação de ESCRITA. Dry-run por padrão (ROLLBACK). --aplicar para efetivar.
//
// Para cada um dos 22 grupos de currículo (curso+série, ou série pro Fundamental):
//   1. Verifica que todas as turmas do grupo têm o MESMO conjunto de disciplinas
//      (segurança — aborta só aquele grupo se não bater, não trava os outros)
//   2. Cria uma nova linha em matrizes_curriculares
//   3. Cria os itens_matriz correspondentes, usando disciplina_id e
//      carga_horaria_semanal_override de turma_disciplinas (fonte real)
//   4. Atualiza turmas.matriz_curricular_id para todas as turmas do grupo
//
// NÃO apaga as 227 matrizes antigas nem seus itens_matriz remanescentes —
// isso fica pra depois, como limpeza separada, após confirmar que tudo
// funciona com as novas.

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const APLICAR = process.argv.includes('--aplicar');

const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const match = envContent.match(/^DATABASE_URL=(.+)$/m);
const DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, '');

const MARIO_BRAGA_ORG_ID = 'org_3HCMsuYeAwkggR1dxXNzEdzNaX8';

// categoria padrão pragmática — ver aviso na conversa
const CATEGORIA_TECNICO = 'FGB';
const CATEGORIA_REGULAR = 'BNC';

const GRUPOS = [
  { cursoId: 77, serieAno: '1ª Série', turmas: ['1NF ADM'], categoria: CATEGORIA_TECNICO },
  { cursoId: 77, serieAno: '2ª Série', turmas: ['2MA ADM'], categoria: CATEGORIA_TECNICO },
  { cursoId: 77, serieAno: '3ª Série', turmas: ['3MA ADM'], categoria: CATEGORIA_TECNICO },
  { cursoId: 79, serieAno: '1ª Série', turmas: ['1MB DES'], categoria: CATEGORIA_TECNICO },
  { cursoId: 79, serieAno: '2ª Série', turmas: ['2MB DES'], categoria: CATEGORIA_TECNICO },
  { cursoId: 79, serieAno: '3ª Série', turmas: ['3MB DES'], categoria: CATEGORIA_TECNICO },
  { cursoId: 80, serieAno: '1ª Série', turmas: ['1MC FAR'], categoria: CATEGORIA_TECNICO },
  { cursoId: 80, serieAno: '2ª Série', turmas: ['2MC FAR'], categoria: CATEGORIA_TECNICO },
  { cursoId: 72, serieAno: '1ª Série', turmas: ['1MD MA'], categoria: CATEGORIA_TECNICO },
  { cursoId: 72, serieAno: '2ª Série', turmas: ['2MD MA'], categoria: CATEGORIA_TECNICO },
  { cursoId: 41, serieAno: '1ª Série', turmas: ['1ME DOC'], categoria: CATEGORIA_TECNICO },
  { cursoId: 13, serieAno: '1ª Série', turmas: ['1MA EM'], categoria: CATEGORIA_REGULAR },
  { cursoId: 13, serieAno: '2ª Série', turmas: ['2MA EM'], categoria: CATEGORIA_REGULAR },
  { cursoId: 13, serieAno: '3ª Série', turmas: ['3MA EM'], categoria: CATEGORIA_REGULAR },
  { cursoId: 16, serieAno: '1ª Série', turmas: ['1NB'], categoria: CATEGORIA_REGULAR },
  { cursoId: 16, serieAno: '2ª Série', turmas: ['2NB', '2NC'], categoria: CATEGORIA_REGULAR },
  { cursoId: 15, serieAno: '3ª Série', turmas: ['3NB'], categoria: CATEGORIA_REGULAR }, // Itinerário Matemática/Exatas
  { cursoId: 16, serieAno: '3ª Série', turmas: ['3NC'], categoria: CATEGORIA_REGULAR }, // Itinerário Linguagens/Humanas
  { cursoId: 11, serieAno: '6º Ano', turmas: ['6TA', '6TB', '6TC', '6TD', '6TE', '6TF', '6TG', '6TH', '6TI'], categoria: CATEGORIA_REGULAR },
  { cursoId: 11, serieAno: '7º Ano', turmas: ['7TA', '7TB', '7TC', '7TD', '7TE', '7TF', '7TG', '7TH'], categoria: CATEGORIA_REGULAR },
  { cursoId: 11, serieAno: '8º Ano', turmas: ['8MA', '8MB', '8MC', '8MD', '8ME', '8TF', '8TG', '8TH'], categoria: CATEGORIA_REGULAR },
  { cursoId: 11, serieAno: '9º Ano', turmas: ['9MA', '9MB', '9MC', '9MD', '9ME', '9MF', '9TG', '9TH', '9TI'], categoria: CATEGORIA_REGULAR },
];

async function main() {
  console.log(APLICAR ? '=== MODO APLICAR ===' : '=== MODO DRY-RUN (ROLLBACK no final) ===');
  console.log(`Total de grupos: ${GRUPOS.length}`);
  const totalTurmasPlanejadas = GRUPOS.reduce((acc, g) => acc + g.turmas.length, 0);
  console.log(`Total de turmas cobertas: ${totalTurmasPlanejadas} (esperado: 53)\n`);

  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const log = { modo: APLICAR ? 'APLICAR' : 'DRY_RUN', timestamp: new Date().toISOString(), grupos: [] };

  try {
    await client.query('BEGIN');

    // Mapear nome de turma -> id
    const turmasRes = await client.query(
      `SELECT id, nome FROM turmas WHERE escola_id = $1`, [MARIO_BRAGA_ORG_ID]
    );
    const idPorNome = new Map(turmasRes.rows.map(r => [r.nome, r.id]));

    let gruposOk = 0, gruposAbortados = 0;

    for (const grupo of GRUPOS) {
      const turmaIds = grupo.turmas.map(nome => {
        const id = idPorNome.get(nome);
        if (!id) throw new Error(`Turma não encontrada: ${nome}`);
        return id;
      });

      // Buscar disciplinas de cada turma do grupo
      const discPorTurma = new Map();
      for (const tid of turmaIds) {
        const r = await client.query(
          `SELECT disciplina_id, carga_horaria_semanal_override FROM turma_disciplinas WHERE turma_id = $1`,
          [tid]
        );
        discPorTurma.set(tid, r.rows);
      }

      // Verificar que todas as turmas do grupo têm o MESMO conjunto de disciplina_id
      const primeiraLista = discPorTurma.get(turmaIds[0]);
      const primeiroSet = new Set(primeiraLista.map(r => r.disciplina_id));
      let todasIguais = true;
      for (const tid of turmaIds) {
        const lista = discPorTurma.get(tid);
        const set = new Set(lista.map(r => r.disciplina_id));
        if (set.size !== primeiroSet.size || ![...set].every(id => primeiroSet.has(id))) {
          todasIguais = false;
        }
      }

      if (!todasIguais) {
        console.error(`\n⚠️  ABORTANDO grupo [${grupo.turmas.join(', ')}] — disciplinas não batem entre as turmas do grupo.`);
        gruposAbortados++;
        log.grupos.push({ ...grupo, status: 'ABORTADO_DIVERGENCIA' });
        continue;
      }

      // Criar a matriz
      const cargaTotal = primeiraLista.reduce((acc, r) => acc + (r.carga_horaria_semanal_override || 0), 0);
      const matrizRes = await client.query(
        `INSERT INTO matrizes_curriculares (escola_id, curso_id, serie_ano, carga_horaria_semanal_total)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [MARIO_BRAGA_ORG_ID, grupo.cursoId, grupo.serieAno, cargaTotal]
      );
      const matrizId = matrizRes.rows[0].id;

      // Criar os itens_matriz
      let itensInseridos = 0;
      for (const r of primeiraLista) {
        await client.query(
          `INSERT INTO itens_matriz
             (matriz_curricular_id, disciplina_id, categoria_curricular, carga_horaria_semanal, grupo_disciplina, eh_padrao_do_grupo, obrigatoria)
           VALUES ($1, $2, $3, $4, NULL, false, true)`,
          [matrizId, r.disciplina_id, grupo.categoria, r.carga_horaria_semanal_override]
        );
        itensInseridos++;
      }

      // Vincular as turmas do grupo à nova matriz
      const updRes = await client.query(
        `UPDATE turmas SET matriz_curricular_id = $1 WHERE id = ANY($2) RETURNING id, nome`,
        [matrizId, turmaIds]
      );

      console.log(`✅ [${grupo.turmas.join(', ')}] -> matriz_id=${matrizId}, ${itensInseridos} itens, carga_total=${cargaTotal}, turmas vinculadas=${updRes.rowCount}`);
      gruposOk++;
      log.grupos.push({
        ...grupo, status: 'OK', matrizId, itensInseridos, cargaTotal,
        turmasVinculadas: updRes.rows,
      });
    }

    console.log(`\n=== RESUMO ===`);
    console.log(`Grupos OK: ${gruposOk}`);
    console.log(`Grupos abortados (divergência): ${gruposAbortados}`);

    // Conferência final: quantas turmas do Mário Braga ficaram com matriz_curricular_id preenchido
    const confRes = await client.query(
      `SELECT COUNT(*) AS com_matriz, (SELECT COUNT(*) FROM turmas WHERE escola_id = $1) AS total
       FROM turmas WHERE escola_id = $1 AND matriz_curricular_id IS NOT NULL`,
      [MARIO_BRAGA_ORG_ID]
    );
    console.log(`Turmas com matriz_curricular_id preenchido: ${confRes.rows[0].com_matriz} / ${confRes.rows[0].total}`);

    if (APLICAR) {
      await client.query('COMMIT');
      console.log('\n✅ COMMIT realizado.');
    } else {
      await client.query('ROLLBACK');
      console.log('\n↩️  ROLLBACK (dry-run). Rode com --aplicar para efetivar.');
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('ERRO — ROLLBACK executado:', err);
    process.exit(1);
  } finally {
    const logPath = path.join(__dirname, `log-reconstrucao-matrizes-${APLICAR ? 'APLICADO' : 'dryrun'}-${Date.now()}.json`);
    fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
    console.log(`\nLog salvo em: ${logPath}`);
    await client.end();
  }
}

main().catch(err => {
  console.error('ERRO:', err);
  process.exit(1);
});
