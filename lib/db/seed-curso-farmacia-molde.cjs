// seed-curso-farmacia-molde.cjs
//
// Popula o "molde reutilizável" (escolaId = "catalogo_geral") do curso
// Técnico Farmácia Integrado ao Ensino Médio — PPI Noturno, código 2547,
// a partir da Instrução Normativa Conjunta 001/2026 (DEDUC/DPGE/SEED), ANEXO IV.
//
// Uso:
//   node seed-curso-farmacia-molde.cjs            -> dry-run (mostra tudo, ROLLBACK)
//   node seed-curso-farmacia-molde.cjs --commit    -> aplica de verdade (COMMIT)
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

// Disciplinas que ainda não existem em disciplinas_catalogo — serão criadas.
const novasNoCatalogo = [
  { codigo_sae: '809', nome: 'Química aplicada', categoria: 'IFA' },
  { codigo_sae: '4295', nome: 'Fundamentos de farmácia', categoria: 'APF' },
  { codigo_sae: '5515', nome: 'Fundamentos da fisiopatologia', categoria: 'APF' },
];

// Todas as disciplinas do curso, com carga semanal por série [1ª, 2ª, 3ª].
// categoria = categoriaCurricular a gravar no item_matriz (vem da seção do PDF,
// não do categoria_curricular_padrao do catálogo, que é só sugestão default).
const itensCurso = [
  // FORMAÇÃO GERAL BÁSICA (FGB)
  { codigo_sae: '101', nome: 'Língua Portuguesa', categoria: 'FGB', cargas: [2, 3, 3] },
  { codigo_sae: '704', nome: 'Arte', categoria: 'FGB', cargas: [2, 0, 0] },
  { codigo_sae: '601', nome: 'Educação Física', categoria: 'FGB', cargas: [2, 2, 0] },
  { codigo_sae: '1501', nome: 'Língua Inglesa', categoria: 'FGB', cargas: [2, 2, 2] },
  { codigo_sae: '201', nome: 'Matemática', categoria: 'FGB', cargas: [3, 2, 3] },
  { codigo_sae: null, nome: 'Educação Financeira', categoria: 'FGB', cargas: [0, 1, 0] },
  { codigo_sae: null, nome: 'Educação Digital e Computação: Programação e IA', categoria: 'FGB', cargas: [1, 0, 0] },
  { codigo_sae: '1101', nome: 'Química', categoria: 'FGB', cargas: [2, 0, 2] },
  { codigo_sae: '901', nome: 'Física', categoria: 'FGB', cargas: [0, 2, 2] },
  { codigo_sae: '1001', nome: 'Biologia', categoria: 'FGB', cargas: [2, 0, 2] },
  { codigo_sae: '2001', nome: 'Geografia', categoria: 'FGB', cargas: [2, 0, 2] },
  { codigo_sae: '1901', nome: 'História', categoria: 'FGB', cargas: [0, 2, 2] },
  { codigo_sae: '2301', nome: 'Sociologia', categoria: 'FGB', cargas: [0, 2, 0] },
  { codigo_sae: '2201', nome: 'Filosofia', categoria: 'FGB', cargas: [0, 2, 0] },

  // PARTE DIVERSIFICADA (PD) — CELEM, optativa
  { codigo_sae: null, nome: 'Língua Espanhola', categoria: 'PD', cargas: [4, 4, 4] },

  // APROFUNDAMENTO (IFA)
  { codigo_sae: '809', nome: 'Química aplicada', categoria: 'IFA', cargas: [0, 0, 2] },
  { codigo_sae: '4288', nome: 'Bases Biológicas Aplicadas a Saúde', categoria: 'IFA', cargas: [0, 2, 1] },
  { codigo_sae: '126', nome: 'Redação técnica', categoria: 'IFA', cargas: [1, 1, 0] },
  { codigo_sae: '2334', nome: 'Empreendedorismo', categoria: 'IFA', cargas: [2, 0, 0] },

  // ITINERÁRIO FORMATIVO TÉCNICO PROFISSIONAL (APF)
  { codigo_sae: '4290', nome: 'Biossegurança e Segurança do Trabalho', categoria: 'APF', cargas: [0, 1, 0] },
  { codigo_sae: '4344', nome: 'Controle de Qualidade', categoria: 'APF', cargas: [0, 0, 1] },
  { codigo_sae: '4291', nome: 'Dispensação de Produtos Farmacêuticos e Correlatos', categoria: 'APF', cargas: [2, 2, 0] },
  { codigo_sae: '5319', nome: 'Farmácia Hospitalar', categoria: 'APF', cargas: [1, 0, 0] },
  { codigo_sae: '5513', nome: 'Farmacologia I', categoria: 'APF', cargas: [3, 0, 0] },
  { codigo_sae: '5514', nome: 'Farmacologia II', categoria: 'APF', cargas: [0, 2, 0] },
  { codigo_sae: '4294', nome: 'Farmacotécnica', categoria: 'APF', cargas: [0, 0, 3] },
  { codigo_sae: '4295', nome: 'Fundamentos de farmácia', categoria: 'APF', cargas: [2, 0, 0] },
  { codigo_sae: '5515', nome: 'Fundamentos da fisiopatologia', categoria: 'APF', cargas: [0, 2, 0] },
  { codigo_sae: '5320', nome: 'Homeopatia e Fitoterapia', categoria: 'APF', cargas: [0, 0, 1] },
  { codigo_sae: '4296', nome: 'Microbiologia e Parasitologia Básica', categoria: 'APF', cargas: [0, 0, 2] },
  { codigo_sae: '3228', nome: 'Saúde Pública', categoria: 'APF', cargas: [1, 0, 0] },
  { codigo_sae: '3511', nome: 'Toxicologia', categoria: 'APF', cargas: [0, 2, 0] },
  { codigo_sae: '3255', nome: 'Primeiros Socorros', categoria: 'APF', cargas: [0, 0, 2] },
];

async function main() {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    await client.query('BEGIN');

    // 1) Criar disciplinas que ainda não existem no catálogo global
    for (const d of novasNoCatalogo) {
      const existe = await client.query(
        'SELECT id FROM disciplinas_catalogo WHERE codigo_sae = $1',
        [d.codigo_sae]
      );
      if (existe.rowCount === 0) {
        await client.query(
          `INSERT INTO disciplinas_catalogo (nome, codigo_sae, categoria_curricular_padrao, carga_semanal_sugerida)
           VALUES ($1, $2, $3, $4)`,
          [d.nome, d.codigo_sae, d.categoria, 2]
        );
        console.log(`[catálogo] criado: ${d.codigo_sae} - ${d.nome}`);
      } else {
        console.log(`[catálogo] já existia: ${d.codigo_sae} - ${d.nome}`);
      }
    }

    // 2) Espelhar cada disciplina do curso em disciplinasTable sob escolaId = catalogo_geral
    const disciplinaIdPorNome = {};
    for (const item of itensCurso) {
      const existente = await client.query(
        'SELECT id FROM disciplinas WHERE escola_id = $1 AND nome = $2',
        [ESCOLA_ID_MOLDE, item.nome]
      );
      if (existente.rowCount > 0) {
        disciplinaIdPorNome[item.nome] = existente.rows[0].id;
        console.log(`[disciplinas/molde] já existia: ${item.nome} (id ${existente.rows[0].id})`);
      } else {
        const cargaMedia = Math.max(1, Math.round(
          item.cargas.filter(c => c > 0).reduce((a, b) => a + b, 0) /
          Math.max(1, item.cargas.filter(c => c > 0).length)
        ));
        const ins = await client.query(
          `INSERT INTO disciplinas (escola_id, nome, codigo_sae, carga_semanal, categoria_curricular_padrao)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [ESCOLA_ID_MOLDE, item.nome, item.codigo_sae, cargaMedia, item.categoria]
        );
        disciplinaIdPorNome[item.nome] = ins.rows[0].id;
        console.log(`[disciplinas/molde] criada: ${item.nome} (id ${ins.rows[0].id})`);
      }
    }

    // 3) Criar o curso
    const cursoIns = await client.query(
      `INSERT INTO cursos (escola_id, nome, codigo_curso, nivel, eixo_tecnologico, forma_oferta)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        ESCOLA_ID_MOLDE,
        'Técnico Farmácia Integrado ao Ensino Médio (PPI Noturno)',
        '2547',
        'tecnico',
        'ambiente_saude',
        'integrada',
      ]
    );
    const cursoId = cursoIns.rows[0].id;
    console.log(`\n[curso] criado: id ${cursoId}`);

    // 4) Criar as 3 matrizes curriculares (uma por série) + os itens
    for (let serie = 1; serie <= 3; serie++) {
      const cargaTotalSerie = itensCurso.reduce((sum, item) => sum + item.cargas[serie - 1], 0);
      const matrizIns = await client.query(
        `INSERT INTO matrizes_curriculares (escola_id, curso_id, serie_ano, carga_horaria_semanal_total)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [ESCOLA_ID_MOLDE, cursoId, String(serie), cargaTotalSerie]
      );
      const matrizId = matrizIns.rows[0].id;
      console.log(`[matriz] ${serie}ª série criada: id ${matrizId} (carga total ${cargaTotalSerie})`);

      let itensCriados = 0;
      for (const item of itensCurso) {
        const carga = item.cargas[serie - 1];
        if (carga <= 0) continue;
        await client.query(
          `INSERT INTO itens_matriz (matriz_curricular_id, disciplina_id, categoria_curricular, carga_horaria_semanal, obrigatoria)
           VALUES ($1, $2, $3, $4, $5)`,
          [matrizId, disciplinaIdPorNome[item.nome], item.categoria, carga, true]
        );
        itensCriados++;
      }
      console.log(`  -> ${itensCriados} itens de matriz criados para a ${serie}ª série`);
    }

    if (shouldCommit) {
      await client.query('COMMIT');
      console.log('\nCOMMIT aplicado — molde do curso Farmácia gravado.');
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
