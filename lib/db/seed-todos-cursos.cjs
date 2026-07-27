// seed-todos-cursos.cjs
//
// Popula o molde reutilizável (escolaId = "catalogo_geral") para os 35 cursos
// técnicos extraídos da Instrução Normativa Conjunta 001/2026 (DEDUC/DPGE/SEED),
// variante padrão "Integrado ao Ensino Médio" (3.000h, forma_oferta = integrada).
//
// Lê os dados de cursos_data.json (mesma pasta). Cada curso já validado:
// soma dos itens de cada seção bate exatamente com os totais impressos no PDF.
//
// Uso:
//   node seed-todos-cursos.cjs             -> dry-run (mostra tudo, ROLLBACK)
//   node seed-todos-cursos.cjs --commit     -> aplica de verdade (COMMIT)
//
// Roda de dentro de lib/db (mesmo padrão dos scripts anteriores).

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

async function main() {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  const disciplinaIdPorChave = {}; // chave = codigo_sae ou nome em minusculo -> id em disciplinasTable
  let totalCursos = 0;
  let totalMatrizes = 0;
  let totalItens = 0;
  let totalDisciplinasCriadasCatalogo = 0;
  let totalDisciplinasCriadasMolde = 0;
  let totalDisciplinasReaproveitadas = 0;

  try {
    await client.query('BEGIN');

    for (const curso of cursosData) {
      console.log(`\n=== ${curso.codigo_curso} - ${curso.nome} ===`);
      if (curso.baixa_confianca_eixo) {
        console.log(`  [aviso] eixo_tecnologico "${curso.eixo_tecnologico}" é um palpite de baixa confiança — vale conferir.`);
      }

      // 1) Garantir cada disciplina do curso no catálogo global e no molde
      for (const item of curso.itens) {
        const chave = item.codigo_sae ? `sae:${item.codigo_sae}` : `nome:${item.nome.trim().toLowerCase()}`;

        if (!(chave in disciplinaIdPorChave)) {
          // 1a) catálogo global (disciplinas_catalogo)
          let catalogoRow;
          if (item.codigo_sae) {
            catalogoRow = await client.query(
              'SELECT id FROM disciplinas_catalogo WHERE codigo_sae = $1',
              [item.codigo_sae]
            );
          } else {
            catalogoRow = await client.query(
              'SELECT id FROM disciplinas_catalogo WHERE lower(nome) = lower($1)',
              [item.nome]
            );
          }
          if (catalogoRow.rowCount === 0) {
            await client.query(
              `INSERT INTO disciplinas_catalogo (nome, codigo_sae, categoria_curricular_padrao, carga_semanal_sugerida)
               VALUES ($1, $2, $3, $4)`,
              [item.nome, item.codigo_sae || null, item.categoria, 2]
            );
            totalDisciplinasCriadasCatalogo++;
          }

          // 1b) molde (disciplinasTable sob escolaId catalogo_geral)
          const existente = await client.query(
            'SELECT id FROM disciplinas WHERE escola_id = $1 AND lower(nome) = lower($2)',
            [ESCOLA_ID_MOLDE, item.nome]
          );
          if (existente.rowCount > 0) {
            disciplinaIdPorChave[chave] = existente.rows[0].id;
            totalDisciplinasReaproveitadas++;
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
            totalDisciplinasCriadasMolde++;
          }
        }
      }

      // 2) Curso
      const cursoIns = await client.query(
        `INSERT INTO cursos (escola_id, nome, codigo_curso, nivel, eixo_tecnologico, forma_oferta)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [ESCOLA_ID_MOLDE, curso.nome, curso.codigo_curso, 'tecnico', curso.eixo_tecnologico, 'integrada']
      );
      const cursoId = cursoIns.rows[0].id;
      totalCursos++;

      // 3) Matrizes (3 séries) + itens
      for (let serie = 1; serie <= 3; serie++) {
        const cargaTotalSerie = curso.itens.reduce((sum, item) => sum + item.cargas[serie - 1], 0);
        const matrizIns = await client.query(
          `INSERT INTO matrizes_curriculares (escola_id, curso_id, serie_ano, carga_horaria_semanal_total)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [ESCOLA_ID_MOLDE, cursoId, String(serie), cargaTotalSerie]
        );
        const matrizId = matrizIns.rows[0].id;
        totalMatrizes++;

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
        totalItens += itensCriados;
        const bateu = cargaTotalSerie === curso.grand_total[serie - 1];
        console.log(`  ${serie}ª série: matriz id ${matrizId}, carga total ${cargaTotalSerie} (esperado ${curso.grand_total[serie - 1]}) ${bateu ? 'OK' : '⚠️ DIVERGENTE'}, ${itensCriados} itens`);
      }
    }

    console.log('\n=== RESUMO ===');
    console.log(`Cursos criados: ${totalCursos}`);
    console.log(`Matrizes curriculares criadas: ${totalMatrizes}`);
    console.log(`Itens de matriz criados: ${totalItens}`);
    console.log(`Disciplinas novas no catálogo global: ${totalDisciplinasCriadasCatalogo}`);
    console.log(`Disciplinas novas no molde (catalogo_geral): ${totalDisciplinasCriadasMolde}`);
    console.log(`Disciplinas reaproveitadas (já existiam no molde): ${totalDisciplinasReaproveitadas}`);

    if (shouldCommit) {
      await client.query('COMMIT');
      console.log('\nCOMMIT aplicado — todos os cursos gravados.');
    } else {
      await client.query('ROLLBACK');
      console.log('\nDRY-RUN — nada foi gravado (ROLLBACK). Rode com --commit pra aplicar de verdade.');
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('ERRO — ROLLBACK aplicado:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
