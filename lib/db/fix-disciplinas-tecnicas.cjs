// Corrige as disciplinas técnicas que ficaram "coladas" por engano durante
// o seed original (nomes truncados que colidiram, ex: "Fundamentos de"
// representando tanto "Fundamentos de Eletroeletrônica" quanto
// "Fundamentos de Farmácia" na mesma linha).
//
// Estratégia: para cada curso técnico já cadastrado, busca os itens da
// matriz NA ORDEM em que foram inseridos (mesma ordem do documento
// original, preservada porque o insert foi em lote/bulk). Cruza essa
// ordem com reconciliacao.json (que tem o código real de cada posição)
// pra saber COM CERTEZA qual disciplina cada item deveria ser — e corrige
// o vínculo (disciplina_id) quando estiver apontando pra disciplina errada.
//
// Roda de dentro de lib/db:
//   $env:DATABASE_URL = (Get-Content .env | Select-String "^DATABASE_URL=").ToString().Split("=", 2)[1]
//   node fix-disciplinas-tecnicas.cjs

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const ESCOLA_ID = "escola_default";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL não está definida.');
    process.exit(1);
  }

  const dadosPath = path.join(__dirname, "reconciliacao.json");
  const { codigoParaNome, porCurso } = JSON.parse(fs.readFileSync(dadosPath, "utf-8"));

  const pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();

  let cursosAnalisados = 0;
  let cursosNaoEncontrados = 0;
  let seriesComContagemDiferente = 0;
  let itensCorrigidos = 0;
  let itensJaCorretos = 0;
  let disciplinasCriadas = 0;

  // Cache de disciplinas por (nome+codigoSae) já resolvidas nesta execução
  const disciplinaCache = new Map();

  async function resolverDisciplinaCorreta(codigoUc) {
    const nomeCorreto = codigoParaNome[codigoUc];
    if (!nomeCorreto) return null;
    const chave = `${nomeCorreto.toLowerCase()}|${codigoUc}`;
    if (disciplinaCache.has(chave)) return disciplinaCache.get(chave);

    // Busca disciplina exata (nome + código SAE batendo)
    const existente = await client.query(
      `select id from disciplinas where escola_id = $1 and lower(nome) = $2 and codigo_sae = $3 limit 1`,
      [ESCOLA_ID, nomeCorreto.toLowerCase(), codigoUc],
    );
    if (existente.rows.length > 0) {
      disciplinaCache.set(chave, existente.rows[0].id);
      return existente.rows[0].id;
    }

    // Não existe ainda com esse código específico — cria nova (mesmo que
    // já exista uma disciplina com nome parecido mas código diferente,
    // já que aqui estamos justamente separando os casos que colidiram).
    const cores = ["#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6"];
    const cor = cores[disciplinaCache.size % cores.length];
    const criada = await client.query(
      `insert into disciplinas (escola_id, nome, carga_semanal, cor, codigo_sae, categoria_curricular_padrao)
       values ($1, $2, $3, $4, $5, 'IFP') returning id`,
      [ESCOLA_ID, nomeCorreto, 2, cor, codigoUc],
    );
    disciplinasCriadas++;
    disciplinaCache.set(chave, criada.rows[0].id);
    return criada.rows[0].id;
  }

  for (const [codigoCurso, series] of Object.entries(porCurso)) {
    const cursoResult = await client.query(
      `select id, nome from cursos where escola_id = $1 and codigo_curso = $2 and nivel = 'tecnico'`,
      [ESCOLA_ID, codigoCurso],
    );
    if (cursoResult.rows.length === 0) {
      cursosNaoEncontrados++;
      continue;
    }
    cursosAnalisados++;

    for (const curso of cursoResult.rows) {
      const matrizesResult = await client.query(
        `select id, serie_ano from matrizes_curriculares where curso_id = $1 order by id`,
        [curso.id],
      );

      for (const matriz of matrizesResult.rows) {
        const itensEsperados = series[matriz.serie_ano];
        if (!itensEsperados) continue;

        const itensDb = await client.query(
          `select id, disciplina_id, categoria_curricular from itens_matriz
           where matriz_curricular_id = $1 and categoria_curricular = 'IFP'
           order by id`,
          [matriz.id],
        );

        if (itensDb.rows.length !== itensEsperados.length) {
          seriesComContagemDiferente++;
          console.log(`  ⚠ ${curso.nome} — ${matriz.serie_ano}: banco tem ${itensDb.rows.length} itens IFP, documento espera ${itensEsperados.length}. Pulando (contagem não bate).`);
          continue;
        }

        for (let i = 0; i < itensDb.rows.length; i++) {
          const dbItem = itensDb.rows[i];
          const esperado = itensEsperados[i];
          const disciplinaCorretaId = await resolverDisciplinaCorreta(esperado.codigo);
          if (!disciplinaCorretaId) continue;

          if (dbItem.disciplina_id !== disciplinaCorretaId) {
            await client.query(`update itens_matriz set disciplina_id = $1 where id = $2`, [disciplinaCorretaId, dbItem.id]);
            itensCorrigidos++;
          } else {
            itensJaCorretos++;
          }
        }
      }
    }
  }

  client.release();
  await pool.end();

  console.log("");
  console.log("✅ Reconciliação concluída.");
  console.log(`   Cursos técnicos encontrados no banco: ${cursosAnalisados}`);
  console.log(`   Cursos do documento não encontrados no banco: ${cursosNaoEncontrados}`);
  console.log(`   Séries com contagem de itens diferente (puladas): ${seriesComContagemDiferente}`);
  console.log(`   Itens corrigidos (vínculo trocado): ${itensCorrigidos}`);
  console.log(`   Itens já estavam corretos: ${itensJaCorretos}`);
  console.log(`   Disciplinas novas criadas: ${disciplinasCriadas}`);
}

main().catch((err) => {
  console.error("❌ Erro fatal:", err);
  process.exit(1);
});
