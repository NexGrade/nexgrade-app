/**
 * gerar-siglas-restantes-mario-braga.cjs
 *
 * Gera sigla automaticamente para disciplinas da Mario Braga que
 * ainda estao sem sigla e sem correspondencia no catalogo mestre.
 * Segue a MESMA regra ja usada no catalogo (confirmada comparando
 * com exemplos reais): ate 2 palavras significativas (pulando
 * conectivos como "de", "e", "da"), 3 letras cada, unidas por ponto,
 * numeral romano no final preservado separadamente.
 *
 * Uso:
 *   node gerar-siglas-restantes-mario-braga.cjs             (dry-run)
 *   node gerar-siglas-restantes-mario-braga.cjs --aplicar   (aplica)
 */
const { Client } = require("pg");
const fs = require("fs");

const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";
const aplicar = process.argv.includes("--aplicar");

const STOPWORDS = new Set(["de", "da", "do", "das", "dos", "e", "em", "a", "o", "para", "com", "na", "no"]);
const ROMANOS = new Set(["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"]);

function gerarSigla(nomeOriginal) {
  const partes = nomeOriginal.trim().split(/\s+/);
  let numeral = null;
  const ultima = partes[partes.length - 1];
  if (ROMANOS.has(ultima.toUpperCase())) {
    numeral = ultima.toUpperCase();
    partes.pop();
  }
  const significativas = partes.filter((p) => !STOPWORDS.has(p.toLowerCase()));
  const usar = significativas.length > 0 ? significativas : partes;
  const abreviacoes = usar.slice(0, 2).map((p) => {
    const semAcento = p.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return semAcento.replace(/[^a-zA-Z]/g, "").slice(0, 3).toUpperCase();
  });
  let sigla = abreviacoes.filter(Boolean).join(".");
  if (numeral) sigla += " " + numeral;
  return sigla;
}

const conteudo = fs.readFileSync(".env", "utf8");
const linha = conteudo.split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
const url = linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");

async function main() {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN");

    const restantes = await client.query(
      `SELECT id, nome FROM disciplinas WHERE escola_id = $1 AND (sigla IS NULL OR sigla = '') ORDER BY nome`,
      [ESCOLA_ID],
    );

    console.log(`${restantes.rows.length} disciplina(s) vao receber sigla gerada:`);
    const siglasUsadas = new Map();
    for (const row of restantes.rows) {
      const sigla = gerarSigla(row.nome);
      console.log(`  - ${row.nome}  ->  "${sigla}"`);
      if (siglasUsadas.has(sigla)) {
        console.log(`    [AVISO] sigla repetida, ja usada por: ${siglasUsadas.get(sigla)}`);
      }
      siglasUsadas.set(sigla, row.nome);
    }

    if (aplicar) {
      for (const row of restantes.rows) {
        const sigla = gerarSigla(row.nome);
        await client.query(`UPDATE disciplinas SET sigla = $1 WHERE id = $2`, [sigla, row.id]);
      }
      await client.query("COMMIT");
      console.log(`\nOK: ${restantes.rows.length} disciplina(s) atualizada(s) de verdade (--aplicar usado).`);
    } else {
      await client.query("ROLLBACK");
      console.log("\nDRY-RUN -- nada foi alterado. Rode com --aplicar para confirmar.");
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("ERRO:", err.message);
  process.exit(1);
});
