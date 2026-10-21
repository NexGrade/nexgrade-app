// [PRECO-MENSAL-ANUAL] (21/10/2026) precos por turma POR ANO no plano por turma:
//   plano ANUAL  (a vista): preco_por_turma_anual     = 3000 centavos (R$ 30,00) -> fica como esta
//   plano MENSAL (12x)    : preco_por_turma_parcelado = 3200 centavos (R$ 32,00) -> coluna nova
//                           (parcela arredondada para cima ao real inteiro: 26 turmas -> 12x de R$ 70,00)
// Padrao: DRY-RUN. Para gravar: node ajustar-precos-por-turma.cjs --aplicar
// Rodar ANTES de publicar o backend novo (o Drizzle pede a coluna nova no SELECT dos planos).
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const APLICAR = process.argv.includes("--aplicar");
const ANUAL_POR_TURMA = 3000; // R$ 30,00 por turma/ano, a vista
const MENSAL_POR_TURMA = 3200; // R$ 32,00 por turma/ano, em 12x

const reais = (c) => (c == null ? "(vazio)" : "R$ " + (c / 100).toFixed(2).replace(".", ","));

function lerDatabaseUrl() {
  const arquivo = path.join(__dirname, ".env");
  for (const linha of fs.readFileSync(arquivo, "utf8").split(/\r?\n/)) {
    const m = linha.match(/^\s*DATABASE_URL\s*=\s*(.+?)\s*$/);
    if (m) return m[1].replace(/^["']|["']$/g, "");
  }
  throw new Error("DATABASE_URL nao encontrada em " + arquivo);
}

async function main() {
  const client = new Client({ connectionString: lerDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const col = await client.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'planos' AND column_name = 'preco_por_turma_parcelado'`
    );
    const temColuna = col.rowCount > 0;
    const planos = await client.query(
      `SELECT id, nome, ativo, preco_por_turma_anual${temColuna ? ", preco_por_turma_parcelado" : ""}
         FROM planos WHERE cobranca = 'por_turma' ORDER BY id`
    );

    console.log("Coluna planos.preco_por_turma_parcelado: " + (temColuna ? "ja existe" : "NAO existe (sera criada)"));
    if (planos.rowCount === 0) {
      console.log("\nNenhum plano com cobranca = 'por_turma'. Nada a atualizar.");
      return;
    }
    console.log("\nPlanos por turma (antes -> depois), valores por turma POR ANO:");
    for (const p of planos.rows) {
      console.log(`  #${p.id} ${p.nome}${p.ativo ? "" : " (inativo)"}`);
      console.log(`     anual  (a vista): ${reais(p.preco_por_turma_anual)} -> ${reais(ANUAL_POR_TURMA)}`);
      console.log(`     mensal (12x)    : ${reais(temColuna ? p.preco_por_turma_parcelado : null)} -> ${reais(MENSAL_POR_TURMA)}`);
    }
    console.log(`\nExemplo com 26 turmas: anual ${reais(26 * ANUAL_POR_TURMA)} a vista; mensal 12x de ${reais(Math.ceil((26 * MENSAL_POR_TURMA) / 1200) * 100)} (total ${reais(Math.ceil((26 * MENSAL_POR_TURMA) / 1200) * 1200)})`);

    const ids = planos.rows.map((p) => p.id);
    const assinaturas = await client.query(
      `SELECT nome_fantasia, asaas_subscription_id, asaas_status_assinatura
         FROM escolas WHERE plano_id = ANY($1) AND asaas_subscription_id IS NOT NULL`,
      [ids]
    );
    console.log("\nEscolas com assinatura ja criada no Asaas nesses planos: " + assinaturas.rowCount);
    for (const e of assinaturas.rows) {
      console.log(`  - ${e.nome_fantasia} (${e.asaas_subscription_id}, status: ${e.asaas_status_assinatura ?? "?"}) -> continua no valor antigo ate ser refeita`);
    }

    if (!APLICAR) {
      console.log("\n[DRY-RUN] Nada foi alterado. Rode de novo com --aplicar para gravar.");
      return;
    }
    await client.query("BEGIN");
    await client.query("ALTER TABLE planos ADD COLUMN IF NOT EXISTS preco_por_turma_parcelado integer");
    const up = await client.query(
      `UPDATE planos SET preco_por_turma_anual = $1, preco_por_turma_parcelado = $2 WHERE id = ANY($3)`,
      [ANUAL_POR_TURMA, MENSAL_POR_TURMA, ids]
    );
    await client.query("COMMIT");
    console.log(`\n[APLICADO] Coluna conferida e ${up.rowCount} plano(s) atualizado(s).`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Falhou:", err.message);
  process.exit(1);
});
