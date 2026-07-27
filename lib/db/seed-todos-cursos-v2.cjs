// seed-todos-cursos-v2.cjs
//
// Popula o molde reutilizável (escolaId = "catalogo_geral") para os 35 cursos
// técnicos extraídos da Instrução Normativa Conjunta 001/2026 (DEDUC/DPGE/SEED),
// variante padrão "Integrado ao Ensino Médio" (3.000h, forma_oferta = integrada).
//
// DIFERENÇA da v1: uma transação POR CURSO (não uma gigante pra tudo).
// Se cair no meio, só perde o curso em andamento — os anteriores já
// commitados ficam valendo. É seguro rodar de novo: cursos que já
// existem (mesmo codigo_curso sob catalogo_geral) são pulados.
//
// Uso:
//   node seed-todos-cursos-v2.cjs             -> dry-run (mostra tudo, ROLLBACK por curso)
//   node seed-todos-cursos-v2.cjs --commit     -> aplica de verdade (COMMIT por curso)
//
// Roda de dentro de lib/db.

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ESCOLA_ID_MOLDE = 'catalogo_geral';

const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const match = envContent.match(/^DATABASE_URL=(.+)$/m);
if (!match) {
  console.error('DATABASE_URL não encontrado em .env');
  process.exit(1);
}
const dbUrl = match[1].trim();
const shouldCommit = process.argv.includes('--commit');

const cursosData = JSON.parse(fs.readFileSync(path.join(__dirname, 'cursos_data.json'), 'utf8'));

async function processarCurso(client, curso, disciplinaIdPorChave, contadores) {
  await client.query('BEGIN');
  try {
    // pular se o curso ja existe (idempotencia p/ reexecucao segura)
    const jaExiste = await client.query(
      'SELECT id FROM cursos WHERE escola_id = $1 AND codigo_curso = $2',
      [ESCOLA_ID_MOLDE, curso.codigo_curso]
    );
    if (jaExiste.rowCount > 0) {
      console.log(`  [pulado] curso ${curso.codigo_curso} já existe (id ${jaExiste.rows[0].id})`);
      await client.query('ROLLBACK');
      contadores.pulados++;
      return;
    }

    for (const item of curso.itens) {
      const chave = item.codigo_sae ? `sae:${item.codigo_sae}` : `nome:${item.nome.trim().toLowerCase()}`;
      if (!(chave in disciplinaIdPorChave)) {
        let catalogoRow;
        if (item.codigo_sae) {
          catalogoRow = await client.query('SELECT id FROM disciplinas_catalogo WHERE codigo_sae = $1', [item.codigo_sae]);
        } else {
          catalogoRow = await client.query('SELECT id FROM disciplinas_catalogo WHERE lower(nome) = lower($1)', [item.nome]);
        }
        if (catalogoRow.rowCount === 0) {
          await client.query(
            `INSERT INTO disciplinas_catalogo (nome, codigo_sae, categoria_curricular_padrao, carga_semanal_sugerida)
             VALUES ($1, $2, $3, $4)`,
            [item.nome, item.codigo_sae || null, item.categoria, 2]
          );
          contadores.novasCatalogo++;
        }

        const existente = await client.query(
          'SELECT id FROM disciplinas WHERE escola_id = $1 AND lower(nome) = lower($2)',
          [ESCOLA_ID_MOLDE, item.nome]
        );
        if (existente.rowCount > 0) {
          disciplinaIdPorChave[chave] = existente.rows[0].id;
          contadores.reaproveitadas++;
        } else {
          const cargasValidas = item.cargas.filter(c => c > 0);
          const cargaMedia = cargasValidas.length
            ? Math.max(1, Math.round(cargasValidas.reduce((a, b) => a + b, 0) / cargasValidas.length))
            : 2;
          const ins = await client.query(
            `INSERT INTO disciplinas (escola_id, nome, codigo_sae, carga_semanal, categoria_curricular_padrao)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [ESCOLA_ID_MOLDE, item.nome, item.codigo_sae || null, cargaMedia, item.categoria]
          );
          disciplinaIdPorChave[chave] = ins.rows[0].id;
          contadores.novasMolde++;
        }
      }
    }

    const cursoIns = await client.query(
      `INSERT INTO cursos (escola_id, nome, codigo_curso, nivel, eixo_tecnologico, forma_oferta)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [ESCOLA_ID_MOLDE, curso.nome, curso.codigo_curso, 'tecnico', curso.eixo_tecnologico, 'integrada']
    );
    const cursoId = cursoIns.rows[0].id;

    for (let serie = 1; serie <= 3; serie++) {
      const cargaTotalSerie = curso.itens.reduce((sum, item) => sum + item.cargas[serie - 1], 0);
      const matrizIns = await client.query(
        `INSERT INTO matrizes_curriculares (escola_id, curso_id, serie_ano, carga_horaria_semanal_total)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [ESCOLA_ID_MOLDE, cursoId, String(serie), cargaTotalSerie]
      );
      const matrizId = matrizIns.rows[0].id;

      let itensCriados = 0;
      for (const item of curso.itens) {
        const carga = item.cargas[serie - 1];
        if (carga <= 0) continue;
        const chave = item.codigo_sae ? `sae:${item.codigo_sae}` : `nome:${item.nome.trim().toLowerCase()}`;
        await client.query(
          `INSERT INTO itens_matriz (matriz_curricular_id, disciplina_id, categoria_curricular, carga_horaria_semanal, obrigatoria)
           VALUES ($1, $2, $3, $4, $5)`,
          [matrizId, disciplinaIdPorChave[chave], item.categoria, carga, true]
        );
        itensCriados++;
      }
      contadores.itens += itensCriados;
      const bateu = cargaTotalSerie === curso.grand_total[serie - 1];
      console.log(`  ${serie}ª série: matriz id ${matrizId}, carga total ${cargaTotalSerie} (esperado ${curso.grand_total[serie - 1]}) ${bateu ? 'OK' : '⚠️ DIVERGENTE'}, ${itensCriados} itens`);
    }

    if (shouldCommit) {
      await client.query('COMMIT');
      contadores.cursos++;
    } else {
      await client.query('ROLLBACK');
      contadores.cursos++;
    }
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw err;
  }
}

async function main() {
  const client = new Client({ connectionString: dbUrl });
  client.on('error', (err) => {
    console.error('\n[erro de conexão]', err.message);
  });
  await client.connect();

  const disciplinaIdPorChave = {};
  const contadores = { cursos: 0, pulados: 0, itens: 0, novasCatalogo: 0, novasMolde: 0, reaproveitadas: 0 };

  for (const curso of cursosData) {
    console.log(`\n=== ${curso.codigo_curso} - ${curso.nome} ===`);
    if (curso.baixa_confianca_eixo) {
      console.log(`  [aviso] eixo_tecnologico "${curso.eixo_tecnologico}" é palpite de baixa confiança.`);
    }
    try {
      await processarCurso(client, curso, disciplinaIdPorChave, contadores);
    } catch (err) {
      console.error(`  [ERRO neste curso] ${err.message} — pulando pro próximo.`);
    }
  }

  console.log('\n=== RESUMO ===');
  console.log(`Cursos processados com sucesso: ${contadores.cursos}`);
  console.log(`Cursos pulados (já existiam): ${contadores.pulados}`);
  console.log(`Itens de matriz criados: ${contadores.itens}`);
  console.log(`Disciplinas novas no catálogo global: ${contadores.novasCatalogo}`);
  console.log(`Disciplinas novas no molde (catalogo_geral): ${contadores.novasMolde}`);
  console.log(`Disciplinas reaproveitadas: ${contadores.reaproveitadas}`);
  console.log(shouldCommit ? '\nCOMMIT aplicado por curso ao longo da execução.' : '\nDRY-RUN — nada foi gravado (ROLLBACK por curso). Rode com --commit pra aplicar de verdade.');

  await client.end();
}

main().catch((err) => {
  console.error('ERRO FATAL:', err.message);
  process.exit(1);
});
