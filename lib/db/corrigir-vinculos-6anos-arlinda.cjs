// Corrige os vínculos professor_id NULL e cria o vínculo faltante
// (Rec. Aprend. L. Port) para os 6º anos da Arlinda (6A-6E), com base
// na grade oficial (PDF Urânia) confirmada com a escola.
//
// DRY-RUN por padrão (mostra o que faria e dá ROLLBACK).
// Só aplica de verdade com a flag --aplicar.
//
// Uso:
//   node lib/db/corrigir-vinculos-6anos-arlinda.cjs             (dry-run)
//   node lib/db/corrigir-vinculos-6anos-arlinda.cjs --aplicar   (aplica)

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const envPath = path.join(__dirname, ".env");
const envContent = fs.readFileSync(envPath, "utf-8");
const match = envContent.match(/DATABASE_URL=(.+)/);
if (!match) {
  console.error("DATABASE_URL não encontrada no .env");
  process.exit(1);
}
const DATABASE_URL = match[1].trim();

const APLICAR = process.argv.includes("--aplicar");

const ESCOLA_ARLINDA = "org_3HCLFry0r48pfutN7ChZIip3IWL";

const TURMAS = {
  "6A": 442,
  "6B": 443,
  "6C": 444,
  "6D": 445,
  "6E": 446,
};

// Vínculos existentes (turma_disciplinas) que precisam só de professor_id
const CORRECOES_PROFESSOR = [
  { turma: "6A", disciplina: "Ensino Religioso", professor: "Alex S G" },
  { turma: "6A", disciplina: "Língua Portuguesa", professor: "Adalgisa O F G" },

  { turma: "6B", disciplina: "Ensino Religioso", professor: "Alex S G" },
  { turma: "6B", disciplina: "História", professor: "Rachel M B" },
  { turma: "6B", disciplina: "Língua Portuguesa", professor: "Adalgisa O F G" },

  { turma: "6C", disciplina: "Ensino Religioso", professor: "Alex S G" },
  { turma: "6C", disciplina: "História", professor: "Eucledio L K" },
  { turma: "6C", disciplina: "Língua Portuguesa", professor: "Adalgisa O F G" },
  { turma: "6C", disciplina: "Matemática", professor: "Gilvani" },

  { turma: "6D", disciplina: "Matemática", professor: "Gilvani" },

  { turma: "6E", disciplina: "Matemática", professor: "Gilvani" },
];

// Vínculos que não existem ainda em turma_disciplinas e precisam ser
// criados do zero (a disciplina já está na matriz curricular, só falta
// o vínculo com a turma).
const VINCULOS_FALTANTES = [
  { turma: "6C", disciplina: "Rec. Aprend. L. Port", professor: "Sharon C S" },
  { turma: "6D", disciplina: "Rec. Aprend. L. Port", professor: "Adalgisa O F G" },
  { turma: "6E", disciplina: "Rec. Aprend. L. Port", professor: "Sharon C S" },
];

async function buscarProfessorId(client, nome) {
  const res = await client.query(
    `SELECT id FROM professores WHERE escola_id = $1 AND nome = $2 LIMIT 1`,
    [ESCOLA_ARLINDA, nome]
  );
  return res.rows[0]?.id ?? null;
}

async function buscarDisciplinaId(client, nome) {
  const res = await client.query(
    `SELECT id FROM disciplinas WHERE escola_id = $1 AND nome = $2 LIMIT 1`,
    [ESCOLA_ARLINDA, nome]
  );
  return res.rows[0]?.id ?? null;
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  console.log(APLICAR ? "🔴 MODO APLICAR — as mudanças serão commitadas.\n" : "🟡 MODO DRY-RUN — nada será salvo (ROLLBACK ao final).\n");

  try {
    await client.query("BEGIN");

    // ── Parte 1: preencher professor_id em vínculos existentes ──
    console.log("=== Corrigindo vínculos com professor_id NULL ===\n");
    for (const c of CORRECOES_PROFESSOR) {
      const turmaId = TURMAS[c.turma];
      const professorId = await buscarProfessorId(client, c.professor);
      const disciplinaId = await buscarDisciplinaId(client, c.disciplina);

      if (!professorId) {
        console.log(`❌ Professor não encontrado: "${c.professor}" — pulando ${c.turma}/${c.disciplina}`);
        continue;
      }
      if (!disciplinaId) {
        console.log(`❌ Disciplina não encontrada: "${c.disciplina}" — pulando ${c.turma}/${c.disciplina}`);
        continue;
      }

      const vinculo = await client.query(
        `SELECT id, professor_id FROM turma_disciplinas WHERE turma_id = $1 AND disciplina_id = $2`,
        [turmaId, disciplinaId]
      );
      if (vinculo.rows.length === 0) {
        console.log(`❌ Vínculo não encontrado (esperava existir): ${c.turma}/${c.disciplina} — pulando`);
        continue;
      }
      if (vinculo.rows[0].professor_id !== null) {
        console.log(`⚠ ${c.turma}/${c.disciplina} já tem professor_id=${vinculo.rows[0].professor_id} (esperava NULL) — pulando por segurança`);
        continue;
      }

      await client.query(`UPDATE turma_disciplinas SET professor_id = $1 WHERE id = $2`, [professorId, vinculo.rows[0].id]);
      console.log(`✅ ${c.turma} / ${c.disciplina} → professor_id definido para "${c.professor}" (id=${professorId})`);
    }

    // ── Parte 2: criar vínculos que faltam por completo ──
    console.log("\n=== Criando vínculos faltantes (Rec. Aprend. L. Port) ===\n");
    for (const v of VINCULOS_FALTANTES) {
      const turmaId = TURMAS[v.turma];
      const professorId = await buscarProfessorId(client, v.professor);
      const disciplinaId = await buscarDisciplinaId(client, v.disciplina);

      if (!professorId) {
        console.log(`❌ Professor não encontrado: "${v.professor}" — pulando ${v.turma}/${v.disciplina}`);
        continue;
      }
      if (!disciplinaId) {
        console.log(`❌ Disciplina não encontrada: "${v.disciplina}" — pulando ${v.turma}/${v.disciplina}`);
        continue;
      }

      const existente = await client.query(
        `SELECT id FROM turma_disciplinas WHERE turma_id = $1 AND disciplina_id = $2`,
        [turmaId, disciplinaId]
      );
      if (existente.rows.length > 0) {
        console.log(`⚠ ${v.turma}/${v.disciplina} já existe (id=${existente.rows[0].id}) — esperava que não existisse. Pulando por segurança.`);
        continue;
      }

      await client.query(
        `INSERT INTO turma_disciplinas (turma_id, disciplina_id, professor_id)
         VALUES ($1, $2, $3)`,
        [turmaId, disciplinaId, professorId]
      );
      console.log(`✅ ${v.turma} / ${v.disciplina} → vínculo criado com professor "${v.professor}" (id=${professorId})`);
    }

    if (APLICAR) {
      await client.query("COMMIT");
      console.log("\n✅ COMMIT realizado — mudanças salvas.");
    } else {
      await client.query("ROLLBACK");
      console.log("\n🟡 ROLLBACK (dry-run) — nada foi salvo. Rode com --aplicar para confirmar.");
    }
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("\n❌ Erro — ROLLBACK forçado:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
