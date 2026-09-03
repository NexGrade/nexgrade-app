/**
 * atualizar-codigo-sae-confirmados.cjs
 * Atualiza o campo codigo_sae na tabela disciplinas com os valores
 * confirmados hoje (03/09/2026):
 *  - Nucleo comum: substitui QUALQUER valor atual (mesmo se ja tiver
 *    algo preenchido) pelos codigos reais confirmados via E.E. Romario
 *    Martins, porque identificamos que os valores atuais (101, 201,
 *    701...) sao placeholders que nao batem com nenhum documento
 *    oficial nem com os codigos reais.
 *  - Tecnico/EPT: so preenche onde codigo_sae estiver NULL (nunca
 *    sobrescreve um valor tecnico ja existente, que ja foi validado
 *    contra os documentos oficiais da SEED).
 *
 * DRY-RUN por padrao (mostra o que mudaria, no aplica nada).
 * Uso:
 *   node atualizar-codigo-sae-confirmados.cjs              # dry-run
 *   node atualizar-codigo-sae-confirmados.cjs --aplicar     # aplica de verdade
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const ESCOLAS = {
  "Mario Braga": "org_3HCMsuYeAwkggR1dxXNzEdzNaX8",
  "Arlinda Ferreira": "org_3HCLFry0r48pfutN7ChZIip3IWL",
};

// substitui SEMPRE (mesmo se ja tiver valor) -- placeholders conhecidos
const NUCLEO_COMUM = {
  "Língua Portuguesa": 1,
  "Matemática": 2,
  "Geografia": 3,
  "História": 4,
  "Ciências": 5,
  "Educação Física": 6,
  "Química": 9,
  "Arte": 21,
  "Ensino Religioso": 33,
  "Educação Ambiental": 89,
};

// so preenche se estiver NULL -- valores tecnicos validados hoje
const TECNICO_SE_VAZIO = {
  "Educação Digital": 6254,
  "Liderança Organizacional e Gestão de Pessoas": 5034,
  "Recursos Humanos": 4450,
  "Finanças Empresariais": 5033,
  "Comunicação e Vendas": 5020,
  "Técnicas Integradas": 6509,
  "Informática Empresarial": 5015,
  "Princípios Econômicos": 5031,
  "Gestão de Resíduos": 1928,
  "Banco de Dados I": 5400,
  "Farmacologia I": 5513,
  "Banco de Dados II": 5600,
  "Lógica Computacional": 1348,
  "Empreendedorismo": 2334,
  "Redação Técnica": 126,
  "Informática Aplicada": 4420,
  "Farmacologia II": 5514,
  "Toxicologia": 3511,
  "Ciências de Dados": 4763,
  "Programação Mobile": 4491,
  "Saúde Pública": 3228,
  "Farmácia Hospitalar": 5319,
  "Biossegurança e Seg Trab": 4290,
  "Educação Ambiental I": 6622,
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

      for (const [nome, novoCodigo] of Object.entries(NUCLEO_COMUM)) {
        const atual = await client.query(
          `SELECT id, codigo_sae FROM disciplinas WHERE escola_id = $1 AND nome = $2`,
          [escolaId, nome]
        );
        for (const row of atual.rows) {
          if (String(row.codigo_sae) !== String(novoCodigo)) {
            console.log(`  [NUCLEO COMUM] "${nome}": ${row.codigo_sae ?? "(vazio)"} -> ${novoCodigo}`);
            await client.query(`UPDATE disciplinas SET codigo_sae = $1 WHERE id = $2`, [String(novoCodigo), row.id]);
            totalMudancas++;
          }
        }
      }

      for (const [nome, novoCodigo] of Object.entries(TECNICO_SE_VAZIO)) {
        const atual = await client.query(
          `SELECT id, codigo_sae FROM disciplinas WHERE escola_id = $1 AND nome = $2 AND codigo_sae IS NULL`,
          [escolaId, nome]
        );
        for (const row of atual.rows) {
          console.log(`  [TECNICO] "${nome}": (vazio) -> ${novoCodigo}`);
          await client.query(`UPDATE disciplinas SET codigo_sae = $1 WHERE id = $2`, [String(novoCodigo), row.id]);
          totalMudancas++;
        }
      }
    }

    console.log(`\nTotal de mudanças: ${totalMudancas}`);

    if (!aplicar) {
      console.log(`\n[DRY-RUN] Revertendo (ROLLBACK) -- nada foi salvo. Rode com --aplicar pra aplicar de verdade.`);
      await client.query("ROLLBACK");
    } else {
      await client.query("COMMIT");
      console.log(`\nAPLICADO -- ${totalMudancas} disciplina(s) atualizada(s) de verdade.`);
    }
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    await client.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
