// Seed: cadastra os 31 cursos oficiais (14 modalidades de Fundamental/Médio
// + 17 cursos técnicos) com suas matrizes curriculares completas, direto no
// banco — sem precisar clicar em cada um na interface.
//
// Segue o mesmo padrão de conexão do test_migrate.cjs (usa DATABASE_URL do
// ambiente). Roda de dentro de lib/db:
//
//   $env:DATABASE_URL = (Get-Content .env | Select-String "^DATABASE_URL=").ToString().Split("=", 2)[1]
//   node seed-matrizes-oficiais.cjs
//
// Resolve disciplinas por nome (usa a existente, ou cria automaticamente
// se não existir) — mesma lógica já usada na tela de "Aplicar modelo
// oficial". Idempotente na parte de disciplinas (não duplica), mas NÃO é
// idempotente em cursos/matrizes — rodar duas vezes cria cursos duplicados.
// Se precisar rodar de novo, limpe cursos/matrizes na interface antes.

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const ESCOLA_ID = "escola_default";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL não está definida. Rode:');
    console.error('   $env:DATABASE_URL = "postgresql://..."');
    process.exit(1);
  }

  const dadosPath = path.join(__dirname, "seed_data.json");
  if (!fs.existsSync(dadosPath)) {
    console.error(`❌ Arquivo não encontrado: ${dadosPath}`);
    console.error("   Coloque seed_data.json na mesma pasta deste script.");
    process.exit(1);
  }
  const cursos = JSON.parse(fs.readFileSync(dadosPath, "utf-8"));

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  console.log(`🔄 Iniciando seed de ${cursos.length} cursos...`);

  // Cache de disciplinas já resolvidas nesta execução, pra não repetir
  // SELECT/INSERT pra mesma disciplina várias vezes.
  const disciplinaCache = new Map();

  async function resolverDisciplina(client, nome, cargaSemanal, categoria) {
    const chave = nome.trim().toLowerCase();
    if (disciplinaCache.has(chave)) return disciplinaCache.get(chave);

    const existente = await client.query(
      `select id from disciplinas where escola_id = $1 and lower(nome) = $2 limit 1`,
      [ESCOLA_ID, chave],
    );
    if (existente.rows.length > 0) {
      disciplinaCache.set(chave, existente.rows[0].id);
      return existente.rows[0].id;
    }

    const cores = ["#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6"];
    const cor = cores[disciplinaCache.size % cores.length];

    const criada = await client.query(
      `insert into disciplinas (escola_id, nome, carga_semanal, cor, categoria_curricular_padrao)
       values ($1, $2, $3, $4, $5) returning id`,
      [ESCOLA_ID, nome, cargaSemanal, cor, categoria],
    );
    const id = criada.rows[0].id;
    disciplinaCache.set(chave, id);
    return id;
  }

  const client = await pool.connect();
  let cursosOk = 0;
  let matrizesOk = 0;
  let itensOk = 0;
  let disciplinasNovas = 0;
  const disciplinasAntesDoRun = new Set();

  try {
    for (const curso of cursos) {
      try {
        await client.query("BEGIN");

        const cursoResult = await client.query(
          `insert into cursos (escola_id, nome, codigo_curso, nivel, eixo_tecnologico)
           values ($1, $2, $3, $4, $5) returning id`,
          [ESCOLA_ID, curso.nome_curso, curso.codigoCurso, curso.nivel, curso.eixoTecnologico],
        );
        const cursoId = cursoResult.rows[0].id;
        cursosOk++;

        for (const serie of curso.series) {
          let cargaTotal = 0;
          const itensResolvidos = [];

          for (const item of serie.itens) {
            const antesSize = disciplinaCache.size;
            const disciplinaId = await resolverDisciplina(client, item.nome, item.carga, item.categoria);
            if (disciplinaCache.size > antesSize) disciplinasNovas++;
            itensResolvidos.push({ disciplinaId, ...item });
            cargaTotal += item.carga;
          }

          const matrizResult = await client.query(
            `insert into matrizes_curriculares (escola_id, curso_id, serie_ano, carga_horaria_semanal_total)
             values ($1, $2, $3, $4) returning id`,
            [ESCOLA_ID, cursoId, serie.serieAno, cargaTotal],
          );
          const matrizId = matrizResult.rows[0].id;
          matrizesOk++;

          for (const item of itensResolvidos) {
            await client.query(
              `insert into itens_matriz (matriz_curricular_id, disciplina_id, categoria_curricular, carga_horaria_semanal, obrigatoria)
               values ($1, $2, $3, $4, $5)`,
              [matrizId, item.disciplinaId, item.categoria, item.carga, item.obrigatoria],
            );
            itensOk++;
          }
        }

        await client.query("COMMIT");
        console.log(`  ✓ ${curso.nome_curso}`);
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`  ✗ ERRO em "${curso.nome_curso}": ${err.message}`);
      }
    }
  } finally {
    client.release();
    await pool.end();
  }

  console.log("");
  console.log("✅ Seed concluído.");
  console.log(`   Cursos criados: ${cursosOk}/${cursos.length}`);
  console.log(`   Matrizes criadas: ${matrizesOk}`);
  console.log(`   Itens de matriz criados: ${itensOk}`);
  console.log(`   Disciplinas novas criadas: ${disciplinasNovas}`);
}

main().catch((err) => {
  console.error("❌ Erro fatal:", err);
  process.exit(1);
});
