// Backup do estado ATUAL (limpo, confirmado pela auditoria de
// integridade) das tabelas mais importantes: horarios,
// disponibilidade_professores e turma_disciplinas. Cria tabelas
// timestampadas -- nao mexe nas tabelas originais, so copia.
//
// Se algo der errado no futuro (gerar grade nova por engano,
// script com bug, etc.), da pra restaurar com:
//   DELETE FROM <tabela original> WHERE escola_id = '...'  (ou filtro equivalente)
//   INSERT INTO <tabela original> SELECT * FROM <tabela_backup_TIMESTAMP>
//
// Uso:
//   node backup-estado-limpo.cjs

const { Client } = require("pg");
const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("ERRO: DATABASE_URL não definida nesta sessão.");
    process.exit(1);
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const ts = timestamp();

  try {
    // 1) horarios (grade real, os 3 turnos)
    const nomeHorarios = `horarios_backup_${ts}`;
    await client.query(`
      CREATE TABLE ${nomeHorarios} AS
      SELECT h.* FROM horarios h WHERE h.escola_id = $1
    `, [ESCOLA_ID]);
    const contHorarios = await client.query(`SELECT COUNT(*)::int AS total FROM ${nomeHorarios}`);
    console.log(`✅ ${nomeHorarios}: ${contHorarios.rows[0].total} linhas`);

    // 2) disponibilidade_professores (HA + bloqueios) -- so dos
    // professores dessa escola (a tabela nao tem escola_id direto)
    const nomeDisp = `disponibilidade_backup_${ts}`;
    await client.query(`
      CREATE TABLE ${nomeDisp} AS
      SELECT d.* FROM disponibilidade_professores d
      JOIN professores p ON p.id = d.professor_id
      WHERE p.escola_id = $1
    `, [ESCOLA_ID]);
    const contDisp = await client.query(`SELECT COUNT(*)::int AS total FROM ${nomeDisp}`);
    console.log(`✅ ${nomeDisp}: ${contDisp.rows[0].total} linhas`);

    // 3) turma_disciplinas (matriz curricular aplicada, incluindo duplas)
    const nomeMatriz = `turma_disciplinas_backup_${ts}`;
    await client.query(`
      CREATE TABLE ${nomeMatriz} AS
      SELECT td.* FROM turma_disciplinas td
      JOIN turmas t ON t.id = td.turma_id
      WHERE t.escola_id = $1
    `, [ESCOLA_ID]);
    const contMatriz = await client.query(`SELECT COUNT(*)::int AS total FROM ${nomeMatriz}`);
    console.log(`✅ ${nomeMatriz}: ${contMatriz.rows[0].total} linhas`);

    console.log(`\n📦 Backup completo criado com o timestamp ${ts}.`);
    console.log(`Guarde esse nome -- é o que você usa pra restaurar se precisar:`);
    console.log(`  ${nomeHorarios}`);
    console.log(`  ${nomeDisp}`);
    console.log(`  ${nomeMatriz}`);
  } catch (err) {
    console.error("ERRO:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}
main();
