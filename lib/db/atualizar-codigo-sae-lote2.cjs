/**
 * atualizar-codigo-sae-lote2.cjs
 * Atualiza codigo_sae das 31 disciplinas confirmadas pelo XML real do
 * Urania do Mario Braga (03/09/2026). Sobrescreve o valor atual
 * (mesmo se ja tiver algo preenchido), porque essa fonte e mais
 * confiavel que qualquer coisa cruzada com outra escola.
 *
 * DRY-RUN por padrao.
 * Uso:
 *   node atualizar-codigo-sae-lote2.cjs              # dry-run
 *   node atualizar-codigo-sae-lote2.cjs --aplicar     # aplica de verdade
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8"; // Mario Braga

const CODIGOS = {
  "Língua Inglesa": 1347,
  "Física": 904,
  "Biologia": 1001,
  "Filosofia": 2201,
  "Sociologia": 2301,
  "Rec. Aprend. Matemática": 6211,
  "Rec. Aprend. L. Port": 6210,
  "Redação e Leitura": 367,
  "Educação Financeira": 299,
  "Prog no Des de Sistemas": 4762,
  "In Tec e Empreendedorismo": 5999,
  "Língua Inglesa I": 3865,
  "Análise Proj de Sistemas": 4759,
  "História do Paraná": 508,
  "Geografia do Paraná": 403,
  "Arte Paranaense": 780,
  "Estratégia de Marketing": 5019,
  "Soc.gov.cidad e Sociedade": 6552,
  "Fil.textos Filosóficos": 6551,
  "Lit. e Prod. de Texto": 6572,
  "Tecno. e Fer. de Gestão": 4767,
  "Negociação e Vendas": 4393,
  "Noções de Direito": 4024,
  "Adm Financ e Orçamentária": 4191,
  "Projeto de Vida": 594,
  "Controladoria e Finanças": 4770,
  "Sociologia I": 2390,
  "História I": 2384,
  "Arte II": 732,
  "Geografia I": 2385,
  "Computação Gráfica": 735,
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
    let naoEncontradas = [];

    for (const [nome, novoCodigo] of Object.entries(CODIGOS)) {
      const atual = await client.query(
        `SELECT id, nome, codigo_sae FROM disciplinas WHERE escola_id = $1 AND nome = $2`,
        [ESCOLA_ID, nome]
      );
      if (atual.rows.length === 0) {
        naoEncontradas.push(nome);
        continue;
      }
      for (const row of atual.rows) {
        if (String(row.codigo_sae) !== String(novoCodigo)) {
          console.log(`  "${nome}": ${row.codigo_sae ?? "(vazio)"} -> ${novoCodigo}`);
          await client.query(`UPDATE disciplinas SET codigo_sae = $1 WHERE id = $2`, [String(novoCodigo), row.id]);
          totalMudancas++;
        } else {
          console.log(`  "${nome}": já está ${novoCodigo}, sem mudança`);
        }
      }
    }

    console.log(`\nTotal de mudanças: ${totalMudancas}`);
    if (naoEncontradas.length > 0) {
      console.log(`\n⚠ Disciplinas NÃO encontradas no banco (nome não bateu exato):`);
      naoEncontradas.forEach((n) => console.log(`  "${n}"`));
      console.log(`Confere se o nome está escrito exatamente igual ao cadastro (acentos, abreviação etc.)`);
    }

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
main().catch((e) => { console.error(e); process.exitCode = 1; });
