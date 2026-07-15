// Corrige 6 cursos técnicos que ficaram com código E conteúdo técnico
// ERRADOS — eu tinha assumido, sem confirmar direito, que os códigos
// 2544-2549 eram "correções" dos códigos 2511/2523/2507/2538/2509/2535.
// Isso estava errado: são apenas nomes parecidos, mas cursos genuinamente
// diferentes. O que está no banco hoje sob 2544-2549 tem o conteúdo
// técnico TROCADO — precisa voltar pro código certo com os itens certos.
//
//   $env:DATABASE_URL = (Get-Content .env | Select-String "^DATABASE_URL=").ToString().Split("=", 2)[1]
//   node fix-cursos-codigo-errado.cjs

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const ESCOLA_ID = "escola_default";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("❌ DATABASE_URL não está definida.");
    process.exit(1);
  }

  const dados = JSON.parse(fs.readFileSync(path.join(__dirname, "correcao_retificados_final.json"), "utf-8"));
  const { mapaCodigoErradoParaCerto, nomesCorretos, itensCorretosPorCodigo } = dados;

  const pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();

  const disciplinaCache = new Map();

  async function resolverDisciplina(nome, cargaSemanal, codigoSae) {
    const chave = `${nome.toLowerCase()}|${codigoSae}`;
    if (disciplinaCache.has(chave)) return disciplinaCache.get(chave);

    const existente = await client.query(
      `select id from disciplinas where escola_id = $1 and lower(nome) = $2 and codigo_sae = $3 limit 1`,
      [ESCOLA_ID, nome.toLowerCase(), codigoSae],
    );
    if (existente.rows.length > 0) {
      disciplinaCache.set(chave, existente.rows[0].id);
      return existente.rows[0].id;
    }

    const cores = ["#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6"];
    const cor = cores[disciplinaCache.size % cores.length];
    const criada = await client.query(
      `insert into disciplinas (escola_id, nome, carga_semanal, cor, codigo_sae, categoria_curricular_padrao)
       values ($1, $2, $3, $4, $5, 'IFP') returning id`,
      [ESCOLA_ID, nome, cargaSemanal, cor, codigoSae],
    );
    disciplinaCache.set(chave, criada.rows[0].id);
    return criada.rows[0].id;
  }

  let cursosCorrigidos = 0;
  let cursosNaoEncontrados = 0;
  let itensRemovidosTotal = 0;
  let itensInseridosTotal = 0;

  for (const [codigoErrado, codigoCerto] of Object.entries(mapaCodigoErradoParaCerto)) {
    const cursoResult = await client.query(
      `select id, nome from cursos where escola_id = $1 and codigo_curso = $2 and nivel = 'tecnico'`,
      [ESCOLA_ID, codigoErrado],
    );
    if (cursoResult.rows.length === 0) {
      console.log(`  ⚠ Curso com código ${codigoErrado} não encontrado no banco — pulando.`);
      cursosNaoEncontrados++;
      continue;
    }

    for (const curso of cursoResult.rows) {
      // 1. Corrige o código e o nome do curso
      await client.query(
        `update cursos set codigo_curso = $1, nome = $2 where id = $3`,
        [codigoCerto, nomesCorretos[codigoCerto], curso.id],
      );

      // 2. Pra cada matriz (série) desse curso, remove os itens IFP errados
      //    e insere os corretos
      const matrizesResult = await client.query(
        `select id, serie_ano from matrizes_curriculares where curso_id = $1 order by id`,
        [curso.id],
      );

      const itensCorretosDoCurso = itensCorretosPorCodigo[codigoCerto];
      const seriesLabels = ["1ª Série", "2ª Série", "3ª Série"];

      for (const matriz of matrizesResult.rows) {
        const serieIdx = seriesLabels.indexOf(matriz.serie_ano);
        if (serieIdx === -1) continue;

        // Remove os itens IFP errados desta série
        const removidos = await client.query(
          `delete from itens_matriz where matriz_curricular_id = $1 and categoria_curricular = 'IFP' returning id`,
          [matriz.id],
        );
        itensRemovidosTotal += removidos.rows.length;

        // Insere os itens corretos (só os que têm carga > 0 nesta série)
        let cargaAdicionada = 0;
        for (const item of itensCorretosDoCurso) {
          const carga = item.cargas[serieIdx];
          if (carga <= 0) continue;
          const disciplinaId = await resolverDisciplina(item.nome, carga, item.codigo);
          await client.query(
            `insert into itens_matriz (matriz_curricular_id, disciplina_id, categoria_curricular, carga_horaria_semanal, obrigatoria)
             values ($1, $2, 'IFP', $3, true)`,
            [matriz.id, disciplinaId, carga],
          );
          cargaAdicionada += carga;
          itensInseridosTotal++;
        }

        // Recalcula a carga total da matriz (soma de tudo: FGB + IFP + PD)
        const totalResult = await client.query(
          `select coalesce(sum(carga_horaria_semanal), 0) as total from itens_matriz where matriz_curricular_id = $1`,
          [matriz.id],
        );
        await client.query(
          `update matrizes_curriculares set carga_horaria_semanal_total = $1 where id = $2`,
          [totalResult.rows[0].total, matriz.id],
        );
      }
    }

    cursosCorrigidos++;
    console.log(`  ✓ ${codigoErrado} -> ${codigoCerto} (${nomesCorretos[codigoCerto]})`);
  }

  client.release();
  await pool.end();

  console.log("");
  console.log("✅ Correção concluída.");
  console.log(`   Cursos corrigidos: ${cursosCorrigidos}/6`);
  console.log(`   Cursos não encontrados: ${cursosNaoEncontrados}`);
  console.log(`   Itens errados removidos: ${itensRemovidosTotal}`);
  console.log(`   Itens corretos inseridos: ${itensInseridosTotal}`);
}

main().catch((err) => {
  console.error("❌ Erro fatal:", err);
  process.exit(1);
});
