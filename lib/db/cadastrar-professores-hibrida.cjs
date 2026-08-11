// Cadastra 3 professores virtuais "Híbrida-<turma>" (mesmo padrão dos
// PAEE: carga_horaria_total=0, isentos de checagem de HA) e vincula
// cada um ao vínculo já existente de "Hibrida" na respectiva turma
// (1NB, 2NB, 2NC -- noturno, Mário Braga). Confirmado no PDF oficial:
// cada turma tem seu próprio bloco "HIBRIDA-<turma>" na grade da noite,
// não é um professor real dando aula presencial.
//
// DRY-RUN por padrão. Só aplica com --aplicar.

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
const ESCOLA_MARIO = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";

const TURMAS_HIBRIDA = [
  { turmaId: 381, turmaNome: "1NB" },
  { turmaId: 388, turmaNome: "2NB" },
  { turmaId: 389, turmaNome: "2NC" },
];

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  console.log(APLICAR ? "🔴 MODO APLICAR — as mudanças serão commitadas.\n" : "🟡 MODO DRY-RUN — nada será salvo (ROLLBACK ao final).\n");

  try {
    await client.query("BEGIN");

    // Confirma que a disciplina "Hibrida" existe e é a mesma pras 3 turmas
    const disciplinaRes = await client.query(
      `SELECT id FROM disciplinas WHERE escola_id = $1 AND nome = 'Hibrida' LIMIT 1`,
      [ESCOLA_MARIO]
    );
    const disciplinaId = disciplinaRes.rows[0]?.id;
    if (!disciplinaId) {
      console.log(`❌ Disciplina "Hibrida" não encontrada -- abortando`);
      await client.query("ROLLBACK");
      return;
    }

    for (const t of TURMAS_HIBRIDA) {
      const nomeProfessorVirtual = `Híbrida-${t.turmaNome}`;

      // Cria o professor virtual (se ainda não existir)
      const existenteRes = await client.query(
        `SELECT id FROM professores WHERE escola_id = $1 AND nome = $2 LIMIT 1`,
        [ESCOLA_MARIO, nomeProfessorVirtual]
      );
      let professorId = existenteRes.rows[0]?.id;

      if (professorId) {
        console.log(`⚠ Professor "${nomeProfessorVirtual}" já existe (id=${professorId}) -- reaproveitando`);
      } else {
        const criadoRes = await client.query(
          `INSERT INTO professores (escola_id, nome, email, carga_horaria_total, ativo)
           VALUES ($1, $2, $3, 0, true) RETURNING id`,
          [ESCOLA_MARIO, nomeProfessorVirtual, `${nomeProfessorVirtual.toLowerCase()}@pendente.mariobraga.nexgrade.local`]
        );
        professorId = criadoRes.rows[0].id;
        console.log(`✅ Professor virtual criado: "${nomeProfessorVirtual}" (id=${professorId})`);
      }

      // Vincula ao registro existente de Hibrida nessa turma
      const vinculoRes = await client.query(
        `SELECT id, professor_id FROM turma_disciplinas WHERE turma_id = $1 AND disciplina_id = $2`,
        [t.turmaId, disciplinaId]
      );
      if (vinculoRes.rows.length === 0) {
        console.log(`❌ Vínculo ${t.turmaNome}/Hibrida não encontrado -- pulando`);
        continue;
      }
      if (vinculoRes.rows[0].professor_id !== null) {
        console.log(`⚠ ${t.turmaNome}/Hibrida já tem professor_id=${vinculoRes.rows[0].professor_id} -- pulando por segurança`);
        continue;
      }

      await client.query(`UPDATE turma_disciplinas SET professor_id = $1 WHERE id = $2`, [professorId, vinculoRes.rows[0].id]);
      console.log(`✅ ${t.turmaNome} / Hibrida → professor_id definido para "${nomeProfessorVirtual}"`);
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
