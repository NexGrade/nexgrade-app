/**
 * corrigir-codigo-sae-urgente.cjs
 * URGENTE -- reverte os codigo_sae que foram trocados incorretamente
 * hoje mais cedo. O que eu tinha marcado como "placeholder invalido"
 * (101, 201, 401, 501, 601, 704, 801, 901...) na verdade E o Codigo
 * SAE oficial de verdade, confirmado pela tela do portal SERE
 * (03/09/2026, confirmado universal entre escolas pelo usuario). Os
 * numeros pequenos (1,2,3,4,5,6,9,21) sao um sistema DIFERENTE,
 * interno do Urania, usado so no arquivo de exportacao de horario --
 * nao servem pra Codigo SAE.
 *
 * Aplica em AMBAS as escolas (Mario Braga + Arlinda), ja que o
 * problema foi commitido nas duas hoje de manha.
 *
 * DRY-RUN por padrao.
 * Uso:
 *   node corrigir-codigo-sae-urgente.cjs              # dry-run
 *   node corrigir-codigo-sae-urgente.cjs --aplicar     # aplica de verdade
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const ESCOLAS = {
  "Mario Braga": "org_3HCMsuYeAwkggR1dxXNzEdzNaX8",
  "Arlinda Ferreira": "org_3HCLFry0r48pfutN7ChZIip3IWL",
};

// Codigo SAE oficial, confirmado na tela do portal SERE (03/09/2026)
const CODIGO_SAE_OFICIAL = {
  "Matemática": 201,
  "Língua Portuguesa": 106,
  "Geografia": 401,
  "História": 501,
  "Educação Física": 601,
  "Química": 801,
  "Arte": 704,
  "Física": 901,
};

function carregarDatabaseUrl() {
  const envPath = path.join(__dirname, ".env");
  const envPathAlt = path.join("lib", "db", ".env");
  const p = fs.existsSync(envPath) ? envPath : envPathAlt;
  const conteudo = fs.readFileSync(p, "utf8");
  const linha = conteudo.split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
  if (!linha) throw new Error("DATABASE_URL não encontrada no .env");
  return linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

async function main() {
  const aplicar = process.argv.includes("--aplicar");
  const client = new Client({ connectionString: carregarDatabaseUrl() });
  await client.connect();

  try {
    await client.query("BEGIN");
    let totalMudancas = 0;

    for (const [nomeEscola, escolaId] of Object.entries(ESCOLAS)) {
      console.log(`\n=== ${nomeEscola} ===`);
      for (const [nome, codigoCerto] of Object.entries(CODIGO_SAE_OFICIAL)) {
        const atual = await client.query(
          `SELECT id, codigo_sae FROM disciplinas WHERE escola_id = $1 AND nome = $2`,
          [escolaId, nome]
        );
        for (const row of atual.rows) {
          if (String(row.codigo_sae) !== String(codigoCerto)) {
            console.log(`  "${nome}": ${row.codigo_sae ?? "(vazio)"} -> ${codigoCerto} (revertendo erro de hoje)`);
            await client.query(`UPDATE disciplinas SET codigo_sae = $1 WHERE id = $2`, [String(codigoCerto), row.id]);
            totalMudancas++;
          } else {
            console.log(`  "${nome}": já está ${codigoCerto}, sem mudança`);
          }
        }
      }
    }

    console.log(`\nTotal de correções: ${totalMudancas}`);

    if (!aplicar) {
      console.log(`\n[DRY-RUN] Revertendo (ROLLBACK) -- nada foi salvo. Rode com --aplicar pra aplicar de verdade.`);
      await client.query("ROLLBACK");
    } else {
      await client.query("COMMIT");
      console.log(`\nAPLICADO -- ${totalMudancas} correção(ões) salva(s) de verdade.`);
    }
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    await client.end();
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
