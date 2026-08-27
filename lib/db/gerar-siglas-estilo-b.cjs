/**
 * gerar-siglas-estilo-b.cjs
 * Estilo B: primeira palavra significativa mantida por completo,
 * palavras seguintes truncadas em 4 letras (sem acento) + ponto.
 * Conectivos (de, e, da...) removidos. Numeral romano final
 * preservado, sempre no fim, separado por espaco.
 *
 * Uso:
 *   node gerar-siglas-estilo-b.cjs             (dry-run)
 *   node gerar-siglas-estilo-b.cjs --aplicar   (aplica)
 */
const { Client } = require("pg");
const fs = require("fs");

const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";
const aplicar = process.argv.includes("--aplicar");

const STOPWORDS = new Set(["de", "da", "do", "das", "dos", "e", "em", "a", "o", "para", "com", "na", "no", "as", "os"]);
const ROMANOS = new Set(["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"]);

function semAcento(s) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function gerarSigla(nomeOriginal) {
  const partes = nomeOriginal.trim().split(/\s+/);
  let numeral = null;
  const ultima = partes[partes.length - 1];
  if (ROMANOS.has(ultima.toUpperCase())) {
    numeral = ultima.toUpperCase();
    partes.pop();
  }
  const significativas = partes.filter((p) => !STOPWORDS.has(semAcento(p).toLowerCase()));
  const usar = significativas.length > 0 ? significativas : partes;

  const palavras = usar.map((p, idx) => {
    if (idx === 0) return p; // primeira palavra: mantem completa, com acento
    const base = semAcento(p).replace(/[^a-zA-Z]/g, "");
    if (base.length <= 4) return base.charAt(0).toUpperCase() + base.slice(1).toLowerCase();
    const truncada = base.slice(0, 4);
    return truncada.charAt(0).toUpperCase() + truncada.slice(1).toLowerCase() + ".";
  });

  let sigla = palavras.join(" ");
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

    console.log(`${restantes.rows.length} disciplina(s) vao receber sigla gerada (Estilo B):`);
    for (const row of restantes.rows) {
      const sigla = gerarSigla(row.nome);
      console.log(`  - ${row.nome}  ->  "${sigla}"`);
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
