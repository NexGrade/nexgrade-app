// SO LEITURA -- verifica se o campo codigo_sae ja esta preenchido na
// tabela disciplinas, pra ambas as escolas (Mario Braga e Arlinda).
const { Client } = require("pg");
const ESCOLAS = {
  "Mario Braga": "org_3HCMsuYeAwkggR1dxXNzEdzNaX8",
  "Arlinda Ferreira": "org_3HCLFry0r48pfutN7ChZIip3IWL",
};

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  for (const [nomeEscola, escolaId] of Object.entries(ESCOLAS)) {
    const r = await client.query(
      `SELECT id, nome, codigo_sae, sigla FROM disciplinas WHERE escola_id = $1 ORDER BY nome`,
      [escolaId]
    );
    const preenchidas = r.rows.filter(d => d.codigo_sae != null && d.codigo_sae !== "");
    console.log(`\n=== ${nomeEscola} (${escolaId}) ===`);
    console.log(`Total de disciplinas: ${r.rows.length}`);
    console.log(`Com codigo_sae preenchido: ${preenchidas.length}`);
    if (preenchidas.length > 0) {
      console.log("Exemplos preenchidos:");
      preenchidas.slice(0, 15).forEach(d => console.log(`  ${d.nome} -> codigo_sae=${d.codigo_sae}, sigla=${d.sigla}`));
    }
    console.log("Exemplos SEM codigo_sae (amostra):");
    r.rows.filter(d => !d.codigo_sae).slice(0, 10).forEach(d => console.log(`  ${d.nome} (sigla=${d.sigla})`));
  }

  await client.end();
}
main().catch(err => { console.error(err); process.exit(1); });
