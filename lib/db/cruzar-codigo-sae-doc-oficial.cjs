// SO LEITURA -- cruza os codigo_sae ja cadastrados no nosso banco
// (Mario Braga + Arlinda) contra o dicionario extraido dos documentos
// oficiais da SEED (001 - Matriz EPT, 005 - Concomitante/Intercomplementar).
const { Client } = require("pg");
const fs = require("fs");

const ESCOLAS = {
  "Mario Braga": "org_3HCMsuYeAwkggR1dxXNzEdzNaX8",
  "Arlinda Ferreira": "org_3HCLFry0r48pfutN7ChZIip3IWL",
};

async function main() {
  const path = require("path");
  const dicionario = JSON.parse(fs.readFileSync(path.join(__dirname, "codigos_brutos_extraidos.json"), "utf8"));

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  for (const [nomeEscola, escolaId] of Object.entries(ESCOLAS)) {
    const r = await client.query(
      `SELECT id, nome, codigo_sae FROM disciplinas WHERE escola_id = $1 AND codigo_sae IS NOT NULL ORDER BY nome`,
      [escolaId]
    );
    console.log(`\n=== ${nomeEscola} (${r.rows.length} disciplinas com codigo_sae) ===`);
    let bateram = 0;
    let semDoc = [];
    for (const d of r.rows) {
      const entrada = dicionario[String(d.codigo_sae)];
      if (entrada) {
        const nomesOficiais = Object.keys(entrada);
        bateram++;
        console.log(`  OK   codigo_sae=${d.codigo_sae} | nosso nome="${d.nome}" | doc oficial="${nomesOficiais.join(" / ")}"`);
      } else {
        semDoc.push(d);
      }
    }
    console.log(`\n  Bateram com o documento oficial: ${bateram}/${r.rows.length}`);
    if (semDoc.length > 0) {
      console.log(`  Sem correspondencia no documento (${semDoc.length}):`);
      semDoc.forEach(d => console.log(`    codigo_sae=${d.codigo_sae} -> ${d.nome}`));
    }
  }

  await client.end();
}
main().catch(err => { console.error(err); process.exit(1); });
