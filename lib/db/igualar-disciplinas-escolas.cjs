/**
 * [IGUALAR-DISCIPLINAS] (28/10/2026) Deixa nome, sigla (e Codigo Externo, quando falta) iguais em todas as escolas.
 *  1) Disciplina SEM Codigo Externo com o mesmo nome (ou um apelido conhecido, ex. "Sociologia Gov Cid Sociedade")
 *     de uma disciplina que tem codigo em outra escola: recebe o codigo, o nome e a sigla dela.
 *  2) Mesmo codigo com siglas diferentes: fica a sigla do padrao NexGrade; sem padrao, a mais usada (empate: a do Mario Braga).
 *  3) Mesmo nome sem codigo em nenhuma escola: fica a sigla mais usada; sem nenhuma, gera no padrao
 *     (3 letras por palavra, com ponto; I/II/III separado por espaco).
 * Prática de Formacao T1/T2 (mesmo codigo, siglas diferentes de proposito) nao muda.
 * Uso (em lib\db):  node igualar-disciplinas-escolas.cjs            (ensaio)
 *                   node igualar-disciplinas-escolas.cjs --aplicar
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const APLICAR = process.argv.includes("--aplicar");
const MARIO = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";
const PADRAO = JSON.parse(fs.readFileSync(path.join(__dirname, "dados", "padrao-disciplinas.json"), "utf8")).porCodigo;
const NAO_MEXER_COD = new Set([1269]); // Pratica de Formacao Turma 01 / 02
// apelidos -> nome padrao
const APELIDO = {
  "filosofia analises de textos filosoficos": "Filosofia: Análise de Textos Filosóficos",
  "tecnologia e ferramenta de gestao": "Tecnologias e Ferramentas de Gestão",
  "sociologia gov cid sociedade": "Sociologia: Governo, Cidadania e Sociedade",
  "rec. aprend. l. port": "Recomposição da Aprendizagem em Língua Portuguesa",
  "rec. aprend. lingua portuguesa": "Recomposição da Aprendizagem em Língua Portuguesa",
  "educacao digital": "Educação Digital e Computação: Programação e IA",
  "biologia e sustentabilidade em acao": "Biologia: Sustentabilidade em Ação",
  "matematica e resolucao de problemas": "Matemática: Resolução de Problemas",
};
const PEQ = new Set(["e", "de", "do", "da", "dos", "das", "em", "a", "o", "no", "na", "nos", "nas", "para", "com"]);

function carregarDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const p = [path.join(__dirname, ".env"), path.join("lib", "db", ".env")].find((f) => fs.existsSync(f));
  const linha = fs.readFileSync(p, "utf8").split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
  return linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}
const chave = (x) => String(x ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const curta = (n) => n.replace(/^C\.E\.\s*(Prof\.\s*)?/i, "").split(" ")[0];
function gerarSigla(nome) {
  const sem = String(nome).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[:,()\-–]/g, " ");
  const partes = sem.split(/\s+/).filter(Boolean);
  let romano = "";
  if (/^(I|II|III|IV|V)$/.test(partes[partes.length - 1])) romano = " " + partes.pop();
  const ps = partes.filter((p) => !PEQ.has(p.toLowerCase()));
  const sig = (ps.length ? ps : partes).slice(0, 3).map((p) => p.slice(0, 3).toUpperCase()).join(".");
  return sig + romano;
}
function palavras(nome) {
  return String(nome).replace(/[:,()\-–]/g, " ").split(/\s+/).filter((p) => p && !PEQ.has(p.toLowerCase()) && !/^(I|II|III|IV|V)$/.test(p)).length;
}
function maisUsada(lista, preferida) {
  const cont = new Map();
  for (const s of lista) if (s) cont.set(s, (cont.get(s) ?? 0) + 1);
  if (!cont.size) return null;
  const max = Math.max(...cont.values());
  const top = [...cont].filter(([, n]) => n === max).map(([s]) => s);
  return top.includes(preferida) ? preferida : top.sort()[0];
}

(async () => {
  const c = new Client({ connectionString: carregarDatabaseUrl(), ssl: process.env.PGSSL === "0" ? false : { rejectUnauthorized: false } });
  await c.connect();
  try {
    const ds = (await c.query(
      `select d.id, d.escola_id, e.nome_fantasia escola, d.nome, d.sigla, d.codigo_externo_rco cod from disciplinas d join escolas e on e.id=d.escola_id`)).rows;
    // nome -> codigo (das disciplinas que tem codigo)
    const codPorNome = new Map();
    for (const d of ds) if (d.cod != null && !NAO_MEXER_COD.has(Number(d.cod))) {
      const k = chave(d.nome); if (!codPorNome.has(k)) codPorNome.set(k, Number(d.cod));
    }
    for (const [cod, p] of Object.entries(PADRAO)) codPorNome.set(chave(p.nome), Number(cod));
    // 1) codigo para quem nao tem
    const plano = new Map(); // id -> {nome, sigla, cod}
    for (const d of ds) {
      if (d.cod != null) continue;
      const alvo = APELIDO[chave(d.nome)] ?? d.nome;
      const cod = codPorNome.get(chave(alvo));
      if (cod == null) continue;
      const jaTem = ds.some((x) => x.escola_id === d.escola_id && x.id !== d.id && Number(x.cod) === cod);
      if (jaTem) continue; // a escola ja tem outra disciplina com esse codigo: nao mistura
      plano.set(d.id, { cod, nome: alvo });
    }
    const codFinal = (d) => plano.get(d.id)?.cod ?? (d.cod != null ? Number(d.cod) : null);
    // nome canonico por codigo: padrao, senao o mais usado
    const porCod = new Map();
    for (const d of ds) { const k = codFinal(d); if (k == null) continue; if (!porCod.has(k)) porCod.set(k, []); porCod.get(k).push(d); }
    const nomeCod = new Map(), siglaCod = new Map();
    for (const [cod, lista] of porCod) {
      if (NAO_MEXER_COD.has(cod)) continue;
      const p = PADRAO[String(cod)];
      const doMario = lista.find((x) => x.escola_id === MARIO);
      nomeCod.set(cod, p?.nome ?? maisUsada(lista.map((x) => (plano.get(x.id)?.nome) ?? x.nome), doMario?.nome));
      siglaCod.set(cod, p?.sigla ?? maisUsada(lista.map((x) => x.sigla), doMario?.sigla) ?? gerarSigla(nomeCod.get(cod)));
    }
    // 3) sem codigo: sigla por nome
    const semCod = ds.filter((d) => codFinal(d) == null);
    const siglaNome = new Map();
    for (const d of semCod) { const k = chave(d.nome); if (!siglaNome.has(k)) siglaNome.set(k, []); siglaNome.get(k).push(d); }
    const siglaNomeFinal = new Map();
    for (const [k, lista] of siglaNome) {
      const doMario = lista.find((x) => x.escola_id === MARIO);
      let sig = maisUsada(lista.map((x) => x.sigla), doMario?.sigla);
      // so iniciais (ex. LEI, AFO, FI2) num nome de 2+ palavras: troca pelo padrao NexGrade
      if (sig && /^[A-Z]{2,5}\d?$/.test(sig) && palavras(lista[0].nome) >= 2) sig = null;
      siglaNomeFinal.set(k, sig ?? gerarSigla(lista[0].nome));
    }

    const mudar = [];
    for (const d of ds) {
      const cod = codFinal(d);
      if (cod != null && NAO_MEXER_COD.has(cod)) continue;
      const nome = cod != null ? nomeCod.get(cod) : d.nome;
      const sigla = cod != null ? siglaCod.get(cod) : siglaNomeFinal.get(chave(d.nome));
      const novoCod = plano.has(d.id) ? cod : null;
      if (nome !== d.nome || sigla !== d.sigla || novoCod != null)
        mudar.push({ id: d.id, escola: d.escola_id, esc: curta(d.escola), de: { nome: d.nome, sigla: d.sigla, cod: d.cod }, para: { nome, sigla, cod: novoCod ?? d.cod } });
    }
    const porEscola = new Map();
    for (const m of mudar) { if (!porEscola.has(m.esc)) porEscola.set(m.esc, []); porEscola.get(m.esc).push(m); }
    for (const [esc, lista] of porEscola) {
      console.log(`\n${esc}: ${lista.length} disciplina(s)`);
      for (const m of lista.sort((a, b) => a.de.nome.localeCompare(b.de.nome, "pt"))) {
        const partes = [];
        if (m.de.nome !== m.para.nome) partes.push(`nome -> "${m.para.nome}"`);
        if (m.de.sigla !== m.para.sigla) partes.push(`sigla ${m.de.sigla ?? "(sem)"} -> ${m.para.sigla}`);
        if (m.de.cod == null && m.para.cod != null) partes.push(`codigo -> ${m.para.cod}`);
        console.log(`  "${m.de.nome}": ${partes.join("; ")}`);
      }
    }
    // checagem: nomes repetidos na mesma escola depois
    const rep = [];
    const final = new Map(ds.map((d) => [d.id, { ...d }]));
    for (const m of mudar) Object.assign(final.get(m.id), { nome: m.para.nome, sigla: m.para.sigla });
    const visto = new Map();
    for (const d of final.values()) { const k = `${d.escola_id}|${chave(d.nome)}`; if (visto.has(k)) rep.push(`${curta(d.escola)}: "${d.nome}" (#${visto.get(k)} e #${d.id})`); else visto.set(k, d.id); }
    console.log(`\nTotal: ${mudar.length} disciplina(s) mudam.`);
    if (rep.length) console.log(`ATENCAO: nome repetido na mesma escola depois da mudanca (juntar com juntar-disciplinas.cjs): ${rep.join("; ")}`);
    if (!APLICAR) { console.log("\nENSAIO: nada foi gravado. Para gravar, rode de novo com --aplicar."); return; }
    if (rep.length) { console.log("\nNao gravei: resolva os nomes repetidos antes."); return; }
    const pasta = path.join(__dirname, "_arquivo"); fs.mkdirSync(pasta, { recursive: true });
    const arq = path.join(pasta, `backup-igualar-disciplinas-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(arq, JSON.stringify(mudar, null, 1));
    await c.query("BEGIN");
    try {
      for (const m of mudar) await c.query("update disciplinas set nome=$1, sigla=$2, codigo_externo_rco=$3 where id=$4 and escola_id=$5", [m.para.nome, m.para.sigla, m.para.cod, m.id, m.escola]);
      await c.query("COMMIT");
    } catch (e) { await c.query("ROLLBACK"); throw e; }
    console.log(`\nGRAVADO: ${mudar.length} disciplina(s). Backup: ${arq}`);
  } finally { await c.end(); }
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
