// Migracao manual (16/10/2026): remove as tabelas de backup antigas do schema public
// (copias manuais feitas antes de mexer em HA/disponibilidade, de 27/08 a 09/10/2026).
//
// Por que: elas guardam copias de grades e disponibilidades (dados de professores) sem uso,
// ocupam espaco e aparecem no Supabase. O backup diario (GitHub Actions) ja guarda o banco.
//
// So considera nomes EXATOS de backup:
//   horarios_backup_AAAAMMDD[_HHMM]
//   disponibilidade_backup_AAAAMMDD[_HHMM]
//   turma_disciplinas_backup_AAAAMMDD[_HHMM]
// Qualquer outra tabela e ignorada.
//
// Uso (na pasta lib\db):
//   node migracoes-manuais\20261016-remover-tabelas-backup.cjs            -> dry-run (so leitura)
//   node migracoes-manuais\20261016-remover-tabelas-backup.cjs --aplicar  -> apaga (transacao unica)

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const APLICAR = process.argv.includes("--aplicar");
const PADRAO = /^(horarios|disponibilidade|turma_disciplinas)_backup_\d{8}(_\d{4})?$/;

function lerEnv(arquivo) {
  const env = {};
  if (!fs.existsSync(arquivo)) return env;
  for (const linha of fs.readFileSync(arquivo, "utf8").split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[m[1]] = v;
  }
  return env;
}

function tamanho(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function main() {
  const env = { ...lerEnv(path.join(__dirname, "..", ".env")), ...process.env };
  if (!env.DATABASE_URL) {
    console.error("DATABASE_URL nao encontrado (lib\\db\\.env).");
    process.exit(1);
  }

  const client = new Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    console.log(APLICAR ? "MODO: APLICAR\n" : "MODO: DRY-RUN (nada sera alterado)\n");

    const { rows } = await client.query(
      `SELECT c.relname AS tabela, pg_total_relation_size(c.oid)::bigint AS bytes
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
        ORDER BY c.relname`
    );
    const alvo = rows.filter((r) => PADRAO.test(r.tabela));

    if (!alvo.length) {
      console.log("Nenhuma tabela de backup encontrada. Nada a fazer.");
      return;
    }

    // Trava: nenhuma outra tabela pode depender delas (chave estrangeira apontando para elas).
    const { rows: deps } = await client.query(
      `SELECT conrelid::regclass::text AS de, confrelid::regclass::text AS para
         FROM pg_constraint
        WHERE contype = 'f' AND confrelid::regclass::text = ANY($1)`,
      [alvo.map((t) => t.tabela)]
    );
    if (deps.length) {
      console.log("PARADO: ha chaves estrangeiras apontando para tabelas de backup:");
      for (const d of deps) console.log(`  ${d.de} -> ${d.para}`);
      process.exitCode = 2;
      return;
    }

    console.log("TABELA".padEnd(42) + "LINHAS".padStart(10) + "TAMANHO".padStart(12));
    let total = 0;
    for (const t of alvo) {
      const { rows: [{ n }] } = await client.query(
        `SELECT count(*)::int AS n FROM public.${client.escapeIdentifier(t.tabela)}`
      );
      total += Number(t.bytes);
      console.log(t.tabela.padEnd(42) + String(n).padStart(10) + tamanho(Number(t.bytes)).padStart(12));
    }
    console.log(`\nTabelas de backup: ${alvo.length}  |  Espaco total: ${tamanho(total)}`);
    console.log(`Outras tabelas (nao serao tocadas): ${rows.length - alvo.length}`);

    if (!APLICAR) {
      console.log("\nDRY-RUN: nada foi alterado. Para apagar as tabelas acima, rode com --aplicar.");
      return;
    }

    await client.query("BEGIN");
    for (const t of alvo) {
      await client.query(`DROP TABLE public.${client.escapeIdentifier(t.tabela)}`);
      console.log(`Apagada: ${t.tabela}`);
    }
    await client.query("COMMIT");
    console.log(`\nAPLICADO: ${alvo.length} tabela(s) de backup apagada(s), ${tamanho(total)} liberados.`);
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("ERRO (nada foi apagado se estava aplicando):", err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
