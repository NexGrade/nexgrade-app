// Busca no banco os professores cujo nome bate (ou é parecido) com os
// extraídos do PDF da 6TA, pra confirmar match exato e detectar
// ambiguidade (ex.: mais de um "Andre") antes de montar o script de
// correção da 6TA.
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const envPath = path.join(__dirname, ".env");
const envContent = fs.readFileSync(envPath, "utf-8");
const match = envContent.match(/DATABASE_URL=(.+)/);
const DATABASE_URL = match[1].trim();

const ESCOLA_MARIO = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";

const NOMES_PROCURADOS = [
  "Priscila",
  "Cecilia",
  "Cecília",
  "Ivanir",
  "Elisangela",
  "Ricardo",
  "Robson",
  "Marise",
  "Rafael",
  "Daiane",
  "Silmara",
  "Andre",
  "André",
  "Pedro",
  "Marcio",
  "Márcio",
];

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    for (const nome of NOMES_PROCURADOS) {
      const res = await client.query(
        `SELECT id, nome, ativo FROM professores WHERE escola_id = $1 AND nome ILIKE $2 ORDER BY nome`,
        [ESCOLA_MARIO, `%${nome}%`]
      );
      if (res.rows.length === 0) {
        console.log(`❌ "${nome}": nenhum resultado`);
      } else if (res.rows.length === 1) {
        console.log(`✅ "${nome}": id=${res.rows[0].id} nome="${res.rows[0].nome}" ativo=${res.rows[0].ativo}`);
      } else {
        console.log(`⚠ "${nome}": ${res.rows.length} resultados (AMBÍGUO):`);
        for (const r of res.rows) {
          console.log(`     id=${r.id} nome="${r.nome}" ativo=${r.ativo}`);
        }
      }
    }

    console.log(`\n=== Disciplina "LRPORT" / "Rec. Aprend. L. Port" ===`);
    const discRes = await client.query(
      `SELECT id, nome FROM disciplinas WHERE escola_id = $1 AND nome ILIKE '%rec%port%' ORDER BY nome`,
      [ESCOLA_MARIO]
    );
    for (const r of discRes.rows) console.log(`  id=${r.id} nome="${r.nome}"`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Erro:", err);
  process.exit(1);
});
