// [ACESSOS-ESCOLA] (15/10/2026) Copia os acessos de hoje (organizacoes do Clerk) para a
// tabela acessos_escola. So LE o Clerk -- nada e alterado nem removido la.
//  - membros e convites pendentes de cada escola do banco (escolas.id = organizacao do Clerk);
//  - cargo: o anotado no Clerk (publicMetadata.cargo); sem anotacao, admin = coordenacao;
//  - professor NAO e copiado: o acesso dele vem de professores.email. O script so avisa
//    quando um professor do Clerk nao tem o mesmo e-mail no cadastro de Professores;
//  - quem ja esta na tabela nao muda (pode rodar mais de uma vez).
// Precisa de DATABASE_URL e CLERK_SECRET_KEY (a chave sk_live do Render) no .env desta pasta.
// Uso (na pasta lib\db):  node copiar-acessos-do-clerk.cjs            (dry-run: so lista)
//                         node copiar-acessos-do-clerk.cjs --aplicar  (grava)
const fs = require("fs");
const { Client } = require("pg");
const APLICAR = process.argv.includes("--aplicar");
const CARGOS = new Set(["direcao", "coordenacao", "secretaria", "reservas"]);

function lerVar(nome) {
  if (process.env[nome]) return process.env[nome];
  const env = fs.existsSync(".env") ? fs.readFileSync(".env", "utf8") : "";
  const m = env.match(new RegExp("^" + nome + "\\s*=\\s*\"?([^\"\\r\\n]+)\"?", "m"));
  if (!m) throw new Error(nome + " nao definido (nem no ambiente nem no .env desta pasta)");
  return m[1].trim();
}
const CHAVE = lerVar("CLERK_SECRET_KEY");

async function clerk(caminho) {
  const r = await fetch("https://api.clerk.com/v1" + caminho, { headers: { Authorization: "Bearer " + CHAVE } });
  if (!r.ok) throw new Error("Clerk " + r.status + " em " + caminho.split("?")[0] + ": " + (await r.text()).slice(0, 200));
  const j = await r.json();
  return Array.isArray(j) ? j : j.data ?? [];
}

function cargoDe(papel, meta) {
  const c = meta && typeof meta.cargo === "string" ? meta.cargo : "";
  if (CARGOS.has(c)) return c;
  if (papel === "org:admin") return "coordenacao";
  if (papel === "org:reservas") return "reservas";
  return "professor";
}
const minusculo = (e) => String(e || "").trim().toLowerCase();

(async () => {
  console.log("Chave do Clerk: " + (CHAVE.startsWith("sk_live") ? "PRODUCAO (sk_live)" : "ATENCAO: nao e sk_live (" + CHAVE.slice(0, 7) + "...)"));
  const c = new Client({ connectionString: lerVar("DATABASE_URL"), ssl: { rejectUnauthorized: false } });
  await c.connect();
  const tabela = (await c.query("select 1 from information_schema.tables where table_schema='public' and table_name='acessos_escola'")).rowCount > 0;
  if (!tabela) throw new Error("tabela acessos_escola nao existe: rode antes migracoes-manuais\\20261015-acessos-escola.cjs --aplicar");

  const escolas = (await c.query("select id, nome_fantasia from escolas where id like 'org_%' order by nome_fantasia")).rows;
  const novos = [];
  let jaTinha = 0, professores = 0;
  for (const e of escolas) {
    console.log("\n== " + e.nome_fantasia + " (" + e.id + ")");
    const existentes = new Set((await c.query("select email from acessos_escola where escola_id=$1", [e.id])).rows.map((r) => r.email));
    const emailsProf = new Set((await c.query("select lower(trim(email)) as email from professores where escola_id=$1 and email is not null", [e.id])).rows.map((r) => r.email));
    let membros = [], convites = [];
    try {
      membros = await clerk("/organizations/" + e.id + "/memberships?limit=500");
      convites = await clerk("/organizations/" + e.id + "/invitations?status=pending&limit=500");
    } catch (err) { console.log("   ERRO ao ler o Clerk: " + err.message); continue; }
    const itens = [
      ...membros.map((m) => ({ tipo: "membro", email: minusculo(m.public_user_data && m.public_user_data.identifier), nome: [m.public_user_data && m.public_user_data.first_name, m.public_user_data && m.public_user_data.last_name].filter(Boolean).join(" ") || null, userId: (m.public_user_data && m.public_user_data.user_id) || null, cargo: cargoDe(m.role, m.public_metadata) })),
      ...convites.map((i) => ({ tipo: "convite", email: minusculo(i.email_address), nome: (i.public_metadata && i.public_metadata.nome) || null, userId: null, cargo: cargoDe(i.role, i.public_metadata) })),
    ];
    for (const it of itens) {
      if (!it.email || !it.email.includes("@")) { console.log("   SEM E-MAIL   | " + it.tipo + " ignorado"); continue; }
      if (it.cargo === "professor") {
        professores++;
        console.log("   PROFESSOR    | " + it.email + (emailsProf.has(it.email) ? " (ok: e-mail esta em Professores)" : " (AVISO: e-mail NAO esta em Professores -- vai perder o acesso)"));
        continue;
      }
      if (existentes.has(it.email)) { jaTinha++; console.log("   JA TEM       | " + it.email + " (" + it.cargo + ")"); continue; }
      existentes.add(it.email);
      novos.push({ escolaId: e.id, ...it });
      console.log("   A COPIAR     | " + it.email + " -> " + it.cargo + (it.tipo === "convite" ? " (convite pendente)" : ""));
    }
  }
  console.log("\nResumo: " + novos.length + " a copiar, " + jaTinha + " ja estavam, " + professores + " professores (acesso pelo cadastro de Professores).");
  if (!APLICAR) { console.log("\nDRY-RUN: nada foi gravado. Rode com --aplicar."); await c.end(); return; }
  await c.query("BEGIN");
  try {
    for (const n of novos)
      await c.query(
        "insert into acessos_escola (escola_id, email, nome, cargo, user_id, criado_por) values ($1,$2,$3,$4,$5,'copia-clerk-20261015') on conflict (escola_id, email) do nothing",
        [n.escolaId, n.email, n.nome, n.cargo, n.userId],
      );
    await c.query("COMMIT");
  } catch (err) { await c.query("ROLLBACK"); throw err; }
  const total = (await c.query("select count(*)::int as n from acessos_escola")).rows[0].n;
  console.log("\nGRAVADO. Total na tabela acessos_escola: " + total);
  await c.end();
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
