// SO LEITURA. Procura cadastros da mesma pessoa (ex.: "Jessica" e "Jessica (IFA)", caso do trio)
// e mostra se ja estao ligados pelo professor_principal_id (regra [MESMA-PESSOA-HA], 07/10/2026).
// Agrupa por "nome base": sem acento, minusculo, sem o que estiver entre parenteses e sem
// sufixo " -XXX" / " - XXX". Nao grava nada.
//
// Rodar na pasta lib\db:  node conferir-cadastros-duplos.cjs

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

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

function nomeBase(nome) {
  return String(nome || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+-\s*\S+\s*$/, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const env = { ...lerEnv(path.join(__dirname, ".env")), ...process.env };
  if (!env.DATABASE_URL) {
    console.error("DATABASE_URL nao encontrado (lib\\db\\.env).");
    process.exit(1);
  }
  const client = new Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    const { rows: profs } = await client.query(
      `SELECT p.id, p.escola_id, p.nome, p.professor_principal_id, p.ativo,
              (SELECT count(*)::int FROM horarios h WHERE h.professor_id = p.id) AS aulas
         FROM professores p
        ORDER BY p.escola_id, p.nome`
    );
    const porId = new Map(profs.map((p) => [p.id, p]));

    // grupos por escola + nome base
    const grupos = new Map();
    for (const p of profs) {
      const chave = `${p.escola_id}|${nomeBase(p.nome)}`;
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave).push(p);
    }

    let nGrupos = 0, nPendentes = 0;
    let escolaAtual = null;
    for (const [chave, lista] of [...grupos.entries()].sort()) {
      if (lista.length < 2) continue;
      nGrupos++;
      const escola = chave.split("|")[0];
      if (escola !== escolaAtual) {
        console.log(`\n=== Escola ${escola}`);
        escolaAtual = escola;
      }
      // grupo "resolvido" = exatamente um sem ligacao (o principal) e todos os outros apontando para ele
      const principais = lista.filter((p) => p.professor_principal_id == null);
      const resolvido = principais.length === 1 && lista.every((p) => p.professor_principal_id == null || p.professor_principal_id === principais[0].id);
      if (!resolvido) nPendentes++;
      console.log(`  ${resolvido ? "[ligado]  " : "[PENDENTE]"} nome base "${nomeBase(lista[0].nome)}"`);
      for (const p of lista) {
        const liga = p.professor_principal_id == null ? "principal" : `-> ${porId.get(p.professor_principal_id)?.nome ?? "?"} (id ${p.professor_principal_id})`;
        console.log(`      id ${String(p.id).padEnd(6)} ${p.nome.padEnd(34)} aulas ${String(p.aulas).padStart(3)}  ${liga}${p.ativo === false ? "  (inativo)" : ""}`);
      }
    }

    const ligados = profs.filter((p) => p.professor_principal_id != null);
    console.log(`\nGrupos com mais de um cadastro: ${nGrupos}  |  pendentes de ligacao: ${nPendentes}`);
    console.log(`Cadastros secundarios ja ligados no total: ${ligados.length}`);
    console.log("SO LEITURA: nada foi alterado.");
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error("ERRO:", e.message); process.exitCode = 1; });
