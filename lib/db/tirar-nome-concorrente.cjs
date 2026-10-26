/**
 * tirar-nome-concorrente.cjs
 *
 * Procura o nome do sistema concorrente ("Urania", com ou sem acento, qualquer caixa) em TODAS as
 * colunas de texto do banco e troca por "sistema anterior" (26/10/2026, pedido da Simone: o
 * NexGrade nao deve citar o concorrente em nada que a escola ve).
 * Ex.: "Importado do Urânia 21/10 (H.A.)" -> "Importado do sistema anterior 21/10 (H.A.)"
 * (a regra da HA movel -- "Importado do ... (H.A.)" -- continua reconhecendo).
 *
 * Historicos ficam como estao e so aparecem no relatorio: audit_logs, ai_conversas, ai_mensagens,
 * asaas_webhook_eventos.
 *
 * Seguro: ensaio por padrao (so conta e mostra exemplos); --aplicar grava numa transacao e guarda
 * backup (id + valor antigo) em lib/db/_arquivo/.
 * Uso (em lib\db):
 *   node tirar-nome-concorrente.cjs
 *   node tirar-nome-concorrente.cjs --aplicar
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const APLICAR = process.argv.includes("--aplicar");
const HISTORICOS = new Set(["audit_logs", "ai_conversas", "ai_mensagens", "asaas_webhook_eventos"]);
const PADRAO_SQL = "(urania|urânia|urÂnia)";
const RE = /ur[aâ]nia/gi;
const trocar = (s) => s.replace(RE, (m) => (m === m.toUpperCase() ? "SISTEMA ANTERIOR" : "sistema anterior"));

function carregarDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const p = [path.join(__dirname, ".env"), path.join("lib", "db", ".env")].find((f) => fs.existsSync(f));
  if (!p) throw new Error("DATABASE_URL nao encontrada (defina a variavel ou crie lib/db/.env)");
  const linha = fs.readFileSync(p, "utf8").split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
  return linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

async function main() {
  const c = new Client({ connectionString: carregarDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const cols = (await c.query(
      `SELECT c.table_name, c.column_name FROM information_schema.columns c
         JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
        WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE' AND c.data_type IN ('text', 'character varying')
        ORDER BY 1, 2`)).rows;
    const temId = new Set((await c.query(
      `SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'id'`)).rows.map((r) => r.table_name));
    const achados = [];
    for (const { table_name: t, column_name: col } of cols) {
      const r = await c.query(`SELECT count(*)::int AS n FROM "${t}" WHERE "${col}" ~* $1`, [PADRAO_SQL]);
      if (!r.rows[0].n) continue;
      const ex = await c.query(`SELECT "${col}" AS v FROM "${t}" WHERE "${col}" ~* $1 LIMIT 3`, [PADRAO_SQL]);
      achados.push({ t, col, n: r.rows[0].n, exemplos: ex.rows.map((x) => String(x.v).slice(0, 120)), historico: HISTORICOS.has(t) || !temId.has(t) });
    }
    if (!achados.length) { console.log("Nenhuma ocorrencia no banco."); return; }
    console.log("== Ocorrencias no banco");
    for (const a of achados) {
      console.log(`\n${a.t}.${a.col}: ${a.n} linha(s)${a.historico ? "  [historico/sem id: NAO sera alterado]" : ""}`);
      for (const e of a.exemplos) console.log(`   "${e}"  ->  "${trocar(e)}"`);
    }
    const alterar = achados.filter((a) => !a.historico);
    console.log(`\nTotal a trocar: ${alterar.reduce((n, a) => n + a.n, 0)} linha(s) em ${alterar.length} coluna(s).`);
    if (!APLICAR) { console.log("\nENSAIO: nada foi gravado. Para gravar: node tirar-nome-concorrente.cjs --aplicar"); return; }

    const backup = {};
    await c.query("BEGIN");
    for (const a of alterar) {
      const linhas = (await c.query(`SELECT id, "${a.col}" AS v FROM "${a.t}" WHERE "${a.col}" ~* $1`, [PADRAO_SQL])).rows;
      backup[`${a.t}.${a.col}`] = linhas;
      for (const l of linhas) await c.query(`UPDATE "${a.t}" SET "${a.col}" = $1 WHERE id = $2`, [trocar(l.v), l.id]);
    }
    const dir = path.join(__dirname, "_arquivo"); fs.mkdirSync(dir, { recursive: true });
    const arq = path.join(dir, `backup-tirar-nome-concorrente-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(arq, JSON.stringify(backup, null, 2)); // backup antes do COMMIT
    await c.query("COMMIT");
    console.log(`\nGRAVADO. Valores antigos em: ${arq}`);
  } catch (e) {
    try { await c.query("ROLLBACK"); } catch {}
    throw e;
  } finally {
    await c.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
