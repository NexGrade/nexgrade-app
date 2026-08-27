const { Client } = require("pg");
const fs = require("fs");

const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";
const NOMES_PAEE_FALTANDO = ["CAMILA", "CLAIR", "DORACI", "HERICLEIA", "KAUANA", "NOELI", "ROSINEI", "SILVANA", "SUELI"];

const conteudo = fs.readFileSync(".env", "utf8");
const linha = conteudo.split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
const url = linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");

async function main() {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const registros = await client.query(
      `SELECT id, entidade_id, acao, dados_anteriores, created_at
       FROM audit_logs
       WHERE escola_id = $1 AND entidade = 'professores' AND acao = 'exclusao'
       ORDER BY created_at DESC`,
      [ESCOLA_ID],
    );

    console.log(`Total de exclusoes de professor no log de auditoria: ${registros.rows.length}\n`);

    const encontrados = [];
    for (const row of registros.rows) {
      const dados = row.dados_anteriores;
      const nomeCompleto = dados?.nome ?? "";
      const primeiraPalavra = nomeCompleto.trim().split(/\s+/)[0]?.toUpperCase();
      const match = NOMES_PAEE_FALTANDO.find((n) => n === primeiraPalavra);
      if (match) {
        encontrados.push({ match, dados, created_at: row.created_at });
      }
    }

    console.log(`=== Registros encontrados no log correspondentes aos PAEE faltando (${encontrados.length}/${NOMES_PAEE_FALTANDO.length}) ===`);
    for (const e of encontrados) {
      console.log(`\n--- ${e.match} (excluido em ${e.created_at}) ---`);
      console.log(JSON.stringify(e.dados, null, 2));
    }

    const naoEncontrados = NOMES_PAEE_FALTANDO.filter((n) => !encontrados.some((e) => e.match === n));
    if (naoEncontrados.length > 0) {
      console.log(`\n=== NAO encontrados no log de auditoria (${naoEncontrados.length}) ===`);
      console.log(naoEncontrados.join(", "));
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("ERRO:", err.message);
  process.exit(1);
});
