// SO LEITURA -- cruza os codigo_sae ja cadastrados no nosso banco
// (Mario Braga + Arlinda) contra os CODDISC que apareceram nos dois
// XMLs do Romario Martins, pra ver quantos ja batem direto.
const { Client } = require("pg");
const ESCOLAS = {
  "Mario Braga": "org_3HCMsuYeAwkggR1dxXNzEdzNaX8",
  "Arlinda Ferreira": "org_3HCLFry0r48pfutN7ChZIip3IWL",
};

// CODDISC vistos nos dois arquivos XML (tarde + manha do Romario Martins)
const CODDISC_TARDE = [1,2,3,4,5,6,21,33,3798,5294,6039,6254,6299];
const CODDISC_MANHA = [1,2,3,4,5,6,9,10,11,21,27,29,89,541,789,829,857,859,1054,1296,1297,1354,1578,2500,2595,2997,3482,3710,3780,3798,3970,3971,3972,3973,3974,3978,3979,3981,4043,4044,5096,6025,6026,6029,6030,6039,6085,6088,6090,6093,6094,6095,6096,6254,6299,6301,6318,6319,6322,6493,6503];
const TODOS_CODDISC = [...new Set([...CODDISC_TARDE, ...CODDISC_MANHA])];

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  for (const [nomeEscola, escolaId] of Object.entries(ESCOLAS)) {
    const r = await client.query(
      `SELECT id, nome, codigo_sae, sigla FROM disciplinas WHERE escola_id = $1 AND codigo_sae IS NOT NULL`,
      [escolaId]
    );
    console.log(`\n=== ${nomeEscola} ===`);
    const bateu = r.rows.filter(d => TODOS_CODDISC.includes(Number(d.codigo_sae)));
    console.log(`Disciplinas cujo codigo_sae bate com algum CODDISC visto nos XMLs: ${bateu.length}`);
    bateu.forEach(d => console.log(`  codigo_sae=${d.codigo_sae} -> ${d.nome} (sigla=${d.sigla})`));
  }

  await client.end();
}
main().catch(err => { console.error(err); process.exit(1); });
