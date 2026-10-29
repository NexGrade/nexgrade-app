const fs = require("fs");
const { Client } = require("pg");
const linha = fs.readFileSync(".env", "utf8").split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
const url = linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
(async () => {
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const r = await c.query(
    "SELECT id, nome, codigo_sae, codigo_externo_rco FROM disciplinas WHERE escola_id = $1 AND unaccent_like(nome) ORDER BY nome",
    ["esc_279086285f70451298dc1f31"]).catch(() => null);
  const todas = (await c.query("SELECT id, nome, codigo_sae, codigo_externo_rco FROM disciplinas WHERE escola_id = $1 ORDER BY nome", ["esc_279086285f70451298dc1f31"])).rows;
  const tira = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const chaves = ["parana", "direito", "orcament", "tecnoci", "sustent", "controlad", "lideran", "negocia", "literatura", "ferram", "filosof", "sociolog", "recompos", "resol", " i", " ii", " iii", "matematica", "fisica", "biologia", "quimica", "arte", "geografia", "historia", "inglesa"];
  const achadas = todas.filter((d) => chaves.some((k) => tira(d.nome).includes(k)));
  console.log("Disciplinas da escola:", todas.length, "| parecidas:", achadas.length);
  for (const d of achadas) console.log(`  #${d.id}  ${d.nome}  | SAE ${d.codigo_sae ?? "-"} | Cod.Ext ${d.codigo_externo_rco ?? "-"}`);
  await c.end();
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
