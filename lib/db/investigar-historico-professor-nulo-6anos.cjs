// Diagnóstico: consulta o audit_logs pra ver se os vínculos
// professor_id=NULL das turmas 6A-6E (Arlinda) foram alterados por
// algum script/ação, ou se sempre estiveram assim.
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const envPath = path.join(__dirname, ".env");
const envContent = fs.readFileSync(envPath, "utf-8");
const match = envContent.match(/DATABASE_URL=(.+)/);
const DATABASE_URL = match[1].trim();

const TURMAS_6ANO = [442, 443, 444, 445, 446]; // 6A, 6B, 6C, 6D, 6E

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    // 1. Log de alterações diretamente em turma_disciplinas
    console.log("=== Log de alterações em turma_disciplinas (todas entidades) ===");
    const res1 = await client.query(
      `SELECT id, entidade, entidade_id, acao, usuario_nome, created_at,
              dados_anteriores, dados_novos
       FROM audit_logs
       WHERE entidade ILIKE '%turma_disciplina%'
       ORDER BY created_at DESC
       LIMIT 100`
    );
    console.log(`Total de registros encontrados: ${res1.rows.length}\n`);
    for (const row of res1.rows) {
      console.log(`[${row.created_at.toISOString()}] ${row.acao} entidade_id=${row.entidade_id} usuario=${row.usuario_nome}`);
    }

    // 2. Lista todas as entidades distintas que aparecem no log, pra
    //    conferir se o nome usado é diferente do que supomos
    console.log("\n=== Entidades distintas registradas no audit_logs ===");
    const res2 = await client.query(
      `SELECT DISTINCT entidade, COUNT(*) as total
       FROM audit_logs
       GROUP BY entidade
       ORDER BY entidade`
    );
    for (const row of res2.rows) {
      console.log(`  ${row.entidade} (${row.total} registros)`);
    }

    // 3. Registros específicos das turmas 6A-6E, procurando em
    //    qualquer entidade cujo entidade_id bata com os ids das turmas
    //    OU cujo JSON (dados_anteriores/dados_novos) mencione turma_id
    //    dentro desse conjunto
    console.log("\n=== Registros que mencionam turma_id 442-446 no JSON ===");
    const res3 = await client.query(
      `SELECT id, entidade, entidade_id, acao, usuario_nome, created_at,
              dados_anteriores, dados_novos
       FROM audit_logs
       WHERE (dados_anteriores->>'turmaId')::text = ANY($1::text[])
          OR (dados_novos->>'turmaId')::text = ANY($1::text[])
          OR (dados_anteriores->>'turma_id')::text = ANY($1::text[])
          OR (dados_novos->>'turma_id')::text = ANY($1::text[])
       ORDER BY created_at DESC
       LIMIT 100`,
      [TURMAS_6ANO.map(String)]
    );
    console.log(`Total: ${res3.rows.length}\n`);
    for (const row of res3.rows) {
      console.log(`\n[${row.created_at.toISOString()}] ${row.acao} (entidade=${row.entidade}, id=${row.entidade_id}) usuario=${row.usuario_nome}`);
      console.log(`  ANTES: ${JSON.stringify(row.dados_anteriores)}`);
      console.log(`  DEPOIS: ${JSON.stringify(row.dados_novos)}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Erro:", err);
  process.exit(1);
});
