// Importação completa dos dados reais da escola: apaga os professores
// atuais (com tudo que depende deles) e cadastra os professores, turmas,
// disciplinas e vínculos (professor + turma + disciplina + carga)
// extraídos das planilhas reais fornecidas pela escola.
//
//   $env:DATABASE_URL = (Get-Content .env | Select-String "^DATABASE_URL=").ToString().Split("=", 2)[1]
//   node import-dados-reais.cjs

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

  const dados = JSON.parse(fs.readFileSync(path.join(__dirname, "import_final.json"), "utf-8"));
  const { professores, turmas, vinculos } = dados;

  const pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();

  try {
    // ── 1. Apaga professores atuais e tudo que depende deles ──
    console.log("🗑️  Apagando professores atuais e vínculos...");
    await client.query(`delete from professor_disciplinas where professor_id in (select id from professores where escola_id = $1)`, [ESCOLA_ID]);
    await client.query(`delete from disponibilidade_professores where professor_id in (select id from professores where escola_id = $1)`, [ESCOLA_ID]);
    await client.query(`delete from licencas_professores where professor_id in (select id from professores where escola_id = $1)`, [ESCOLA_ID]);
    await client.query(`delete from horarios where professor_id in (select id from professores where escola_id = $1)`, [ESCOLA_ID]);
    await client.query(`delete from aulas_fixas where professor_id in (select id from professores where escola_id = $1)`, [ESCOLA_ID]);
    await client.query(`delete from limites_diarios_professor where professor_id in (select id from professores where escola_id = $1)`, [ESCOLA_ID]);
    await client.query(`update turma_disciplinas set professor_id = null where professor_id in (select id from professores where escola_id = $1)`, [ESCOLA_ID]);
    const apagados = await client.query(`delete from professores where escola_id = $1 returning id`, [ESCOLA_ID]);
    console.log(`   ${apagados.rows.length} professores antigos removidos.\n`);

    // ── 2. Cria os professores reais ──
    console.log("👩‍🏫 Criando professores...");
    const professorIdPorNome = new Map();
    for (const p of professores) {
      const result = await client.query(
        `insert into professores (escola_id, nome, email, carga_horaria_total, ativo)
         values ($1, $2, $3, $4, true) returning id`,
        [ESCOLA_ID, p.nome, p.email, p.cargaHorariaTotal],
      );
      professorIdPorNome.set(p.nome.toLowerCase(), result.rows[0].id);
    }
    console.log(`   ${professores.length} professores criados.\n`);

    // ── 3. Cria as turmas reais ──
    console.log("🏫 Criando turmas...");
    const turmaIdPorChave = new Map(); // chave: "nome|turno"
    for (const t of turmas) {
      const result = await client.query(
        `insert into turmas (escola_id, nome, serie, turno, ano_letivo)
         values ($1, $2, $3, $4, $5) returning id`,
        [ESCOLA_ID, t.nome, t.serie, t.turno, t.anoLetivo],
      );
      turmaIdPorChave.set(`${t.nome}|${t.turno}`, result.rows[0].id);
    }
    console.log(`   ${turmas.length} turmas criadas.\n`);

    // ── 4. Resolve/cria disciplinas e cria os vínculos ──
    console.log("📚 Vinculando disciplinas + professores às turmas...");
    const disciplinaCache = new Map();
    const cores = ["#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6"];

    async function resolverDisciplina(nome) {
      const chave = nome.toLowerCase();
      if (disciplinaCache.has(chave)) return disciplinaCache.get(chave);

      const existente = await client.query(
        `select id from disciplinas where escola_id = $1 and lower(nome) = $2 limit 1`,
        [ESCOLA_ID, chave],
      );
      if (existente.rows.length > 0) {
        disciplinaCache.set(chave, existente.rows[0].id);
        return existente.rows[0].id;
      }

      const cor = cores[disciplinaCache.size % cores.length];
      const criada = await client.query(
        `insert into disciplinas (escola_id, nome, carga_semanal, cor)
         values ($1, $2, 2, $3) returning id`,
        [ESCOLA_ID, nome, cor],
      );
      disciplinaCache.set(chave, criada.rows[0].id);
      return criada.rows[0].id;
    }

    let vinculosOk = 0;
    let vinculosErro = 0;
    let disciplinasNovas = 0;

    for (const v of vinculos) {
      try {
        const turmaId = turmaIdPorChave.get(`${v.turma}|${v.turno}`);
        const professorId = professorIdPorNome.get(v.professor.toLowerCase());
        if (!turmaId || !professorId) {
          console.log(`  ⚠ Pulando (turma/professor não encontrado): ${v.professor} | ${v.turma} | ${v.disciplina}`);
          vinculosErro++;
          continue;
        }

        const antesSize = disciplinaCache.size;
        const disciplinaId = await resolverDisciplina(v.disciplina);
        if (disciplinaCache.size > antesSize) disciplinasNovas++;

        await client.query(
          `insert into turma_disciplinas (turma_id, disciplina_id, professor_id, carga_horaria_semanal_override)
           values ($1, $2, $3, $4)`,
          [turmaId, disciplinaId, professorId, v.aulas],
        );

        // Garante que o professor também está vinculado à disciplina
        // (professor_disciplinas), usado em telas que filtram por isso.
        await client.query(
          `insert into professor_disciplinas (professor_id, disciplina_id)
           values ($1, $2)
           on conflict do nothing`,
          [professorId, disciplinaId],
        ).catch(() => {}); // ignora se não tiver constraint de unicidade

        vinculosOk++;
      } catch (err) {
        console.error(`  ✗ Erro em ${v.professor} | ${v.turma} | ${v.disciplina}: ${err.message}`);
        vinculosErro++;
      }
    }

    console.log(`\n✅ Importação concluída.`);
    console.log(`   Professores: ${professores.length}`);
    console.log(`   Turmas: ${turmas.length}`);
    console.log(`   Disciplinas novas criadas: ${disciplinasNovas}`);
    console.log(`   Vínculos criados: ${vinculosOk}`);
    console.log(`   Vínculos com erro/pulados: ${vinculosErro}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("❌ Erro fatal:", err);
  process.exit(1);
});
