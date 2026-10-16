// Migracao manual (16/10/2026): liga o RLS (Row Level Security) nas tabelas do schema public.
//
// Por que: o Supabase expoe as tabelas do public pela API dele (chave "anon"). Sem RLS,
// quem tiver essa chave consegue ler as tabelas. O NexGrade NAO usa essa API (o backend
// conecta direto no Postgres pelo DATABASE_URL), entao ligar o RLS SEM politicas fecha a
// API publica e nao muda nada para o backend:
//   - o dono da tabela nao e barrado pelo RLS (a menos que se use FORCE -- aqui nao usa);
//   - o backend conecta com o dono das tabelas (o script confere isso antes de mexer).
//
// Uso (na pasta lib\db):
//   node migracoes-manuais\20261016-ativar-rls.cjs            -> dry-run (so leitura)
//   node migracoes-manuais\20261016-ativar-rls.cjs --aplicar  -> liga o RLS
//
// Para desfazer uma tabela:  ALTER TABLE public."nome" DISABLE ROW LEVEL SECURITY;

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const APLICAR = process.argv.includes("--aplicar");

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

async function main() {
  const env = { ...lerEnv(path.join(__dirname, "..", ".env")), ...process.env };
  if (!env.DATABASE_URL) {
    console.error("DATABASE_URL nao encontrado (lib\\db\\.env).");
    process.exit(1);
  }

  const client = new Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    const { rows: [papel] } = await client.query(
      `SELECT current_user AS usuario, r.rolsuper AS superuser, r.rolbypassrls AS bypassrls
         FROM pg_roles r WHERE r.rolname = current_user`
    );
    console.log(`Conectado como: ${papel.usuario} (superuser: ${papel.superuser}, bypassrls: ${papel.bypassrls})`);
    console.log(APLICAR ? "MODO: APLICAR\n" : "MODO: DRY-RUN (nada sera alterado)\n");

    const { rows: tabelas } = await client.query(
      `SELECT c.relname AS tabela,
              pg_get_userbyid(c.relowner) AS dono,
              c.relrowsecurity AS rls,
              c.relforcerowsecurity AS force_rls,
              (SELECT count(*) FROM pg_policies p
                WHERE p.schemaname = 'public' AND p.tablename = c.relname)::int AS politicas
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
        ORDER BY c.relname`
    );

    console.log("TABELA".padEnd(40) + "DONO".padEnd(20) + "RLS".padEnd(6) + "FORCE".padEnd(7) + "POLITICAS");
    for (const t of tabelas) {
      console.log(
        t.tabela.padEnd(40) + t.dono.padEnd(20) + (t.rls ? "sim" : "nao").padEnd(6) +
        (t.force_rls ? "sim" : "nao").padEnd(7) + String(t.politicas)
      );
    }

    const semRls = tabelas.filter((t) => !t.rls);
    const donoDiferente = tabelas.filter((t) => t.dono !== papel.usuario);
    const comForce = tabelas.filter((t) => t.force_rls);

    console.log(`\nTotal de tabelas: ${tabelas.length}`);
    console.log(`Sem RLS (seriam alteradas): ${semRls.length}`);
    console.log(`Com dono diferente de ${papel.usuario}: ${donoDiferente.length}${donoDiferente.length ? " -> " + donoDiferente.map((t) => `${t.tabela} (${t.dono})`).join(", ") : ""}`);
    console.log(`Com FORCE RLS: ${comForce.length}${comForce.length ? " -> " + comForce.map((t) => t.tabela).join(", ") : ""}`);

    // Trava de seguranca: se alguma tabela nao for do usuario da conexao (e ele nao tiver
    // bypassrls), ligar o RLS poderia bloquear o proprio backend. Nesse caso, nao aplica.
    const seguro = papel.superuser || papel.bypassrls || donoDiferente.length === 0;
    if (!seguro) {
      console.log("\nPARADO: ha tabelas com outro dono e o usuario da conexao nao tem bypassrls.");
      console.log("Ligar o RLS nelas poderia bloquear o backend. Revisar antes de aplicar.");
      process.exitCode = 2;
      return;
    }
    if (comForce.length) {
      console.log("\nAVISO: ha tabelas com FORCE RLS (o dono tambem e barrado). Este script nao mexe nisso.");
    }

    if (!semRls.length) {
      console.log("\nNada a fazer: todas as tabelas ja estao com RLS.");
      return;
    }

    if (!APLICAR) {
      console.log("\nDRY-RUN: nada foi alterado. Para ligar o RLS nas tabelas acima, rode com --aplicar.");
      return;
    }

    await client.query("BEGIN");
    for (const t of semRls) {
      await client.query(`ALTER TABLE public.${client.escapeIdentifier(t.tabela)} ENABLE ROW LEVEL SECURITY`);
      console.log(`RLS ligado: ${t.tabela}`);
    }
    await client.query("COMMIT");
    console.log(`\nAPLICADO: RLS ligado em ${semRls.length} tabela(s).`);
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("ERRO (nada foi alterado se estava aplicando):", err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
