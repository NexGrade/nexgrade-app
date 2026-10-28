/**
 * importar-turmas-do-rco.cjs  [ENSAIO por padrao; grava so com --aplicar]
 * Cria as turmas de uma escola NOVA a partir do arquivo do RCO (EXPORT_URANIA.XML):
 *  - uma turma por turma do RCO (manha, tarde, noite), com codigo SERE e, no 3o ano dividido,
 *    o codigo da parte IF na mesma turma (codigo_sere_if);
 *  - as disciplinas de cada turma com as aulas por semana da grade do RCO (FGB + IF somadas);
 *  - cada disciplina do RCO e ligada a uma disciplina da escola (catalogo SEED-PR ja carregado no
 *    cadastro): 1) mesmo Codigo Externo; 2) SAE (ABREVIATURA do arquivo ou tabela codigos_rco_disciplina);
 *    3) mesmo nome. Sem par: cria a disciplina com o nome do RCO. Grava o Codigo Externo na disciplina
 *    quando ela ainda nao tem.
 * Fica de fora (listado no fim): Monitoria, Treinamento Esportivo, turno integral e Lingua Espanhola
 * (optativa; entra com --com-espanhola). Turma que ja existe (mesmo codigo SERE) e pulada.
 * Nao mexe em professores, grade, horarios nem em turmas existentes.
 *
 * O arquivo vem do banco (tela Arquivo do RCO da escola) ou de --arquivo=caminho.
 * Uso (em lib\db):
 *   node importar-turmas-do-rco.cjs esc_xxx
 *   node importar-turmas-do-rco.cjs esc_xxx --arquivo=C:\Users\...\EXPORT_URANIA.XML
 *   node importar-turmas-do-rco.cjs esc_xxx --aplicar
 *   node importar-turmas-do-rco.cjs --so-arquivo --arquivo=...   (so le o arquivo, sem banco)
 */
const fs = require("fs");
const path = require("path");

const ARGS = process.argv.slice(2);
const APLICAR = ARGS.includes("--aplicar");
const SO_ARQUIVO = ARGS.includes("--so-arquivo");
const COM_ESPANHOLA = ARGS.includes("--com-espanhola");
const opt = (n) => { const a = ARGS.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : null; };
const ESCOLA_ID = ARGS.find((a) => !a.startsWith("--"));
const ANO = Number(opt("ano") || 2026);

const CURSOS_FORA = { "3009": "Treinamento Esportivo", "3041": "Monitoria", "3042": "Monitoria" };
const DISC_ESPANHOLA = 3826;
// nomes que a escola usa e que a regra "serie + letra" nao daria (turma tecnica com o mesmo 3A do FGB)
const NOMES_FIXOS = { "0016_3_1_A": "3º Tec", "2511_1_1_A": "1º Tec" };
const TURNO = { M: "matutino", T: "vespertino", N: "noturno" };

function carregarDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const p = [path.join(__dirname, ".env"), path.join("lib", "db", ".env")].find((f) => fs.existsSync(f));
  const linha = fs.readFileSync(p, "utf8").split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
  return linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}
const tag = (b, n) => { const m = new RegExp(`<${n}>([\\s\\S]*?)</${n}>`).exec(b); return m ? m[1].trim() : ""; };
const registros = (xml, secao) => [...tag(xml, secao).matchAll(/<REGISTRO>([\s\S]*?)<\/REGISTRO>/g)].map((m) => m[1]);
const semAcento = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const chave = (s) => semAcento(s).toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const PEQUENAS = new Set(["de", "da", "do", "das", "dos", "e", "em", "a", "o"]);
const ROMANOS = new Set(["I", "II", "III", "IV"]);
function nomeBonito(s) {
  return String(s).toLowerCase().split(/\s+/).map((p, i) => {
    if (ROMANOS.has(p.toUpperCase())) return p.toUpperCase();
    if (i > 0 && PEQUENAS.has(p)) return p;
    return p.charAt(0).toUpperCase() + p.slice(1);
  }).join(" ");
}

// ---------- leitura do arquivo e plano das turmas (sem banco) ----------
function planejar(xml) {
  const disc = new Map(registros(xml, "DISCIPLINAS").map((r) => {
    const ab = tag(r, "ABREVIATURA");
    return [Number(tag(r, "CODIGO")), { cod: Number(tag(r, "CODIGO")), nome: tag(r, "NOME"), sae: /^\d+$/.test(ab) ? Number(ab) : null }];
  }));
  const turmas = registros(xml, "TURMAS").map((r) => ({
    cod: Number(tag(r, "CODIGO")), nome: tag(r, "NOME"), turno: tag(r, "TURNO"), codIf: Number(tag(r, "COD_TURMA_IF")) || null,
  }));
  const grade = new Map();
  for (const r of registros(xml, "GRADES")) {
    const t = Number(tag(r, "COD_TURMA")), d = Number(tag(r, "COD_DISCIPLINA")), a = Number(tag(r, "AULAS")) || 0;
    if (!grade.has(t)) grade.set(t, new Map());
    grade.get(t).set(d, (grade.get(t).get(d) ?? 0) + a);
  }
  const partesIf = new Set(turmas.map((t) => t.codIf).filter(Boolean));
  const plano = [], fora = [];
  for (const t of turmas) {
    if (partesIf.has(t.cod)) continue; // parte IF entra junto com a turma FGB
    const [curso, serie, , letra] = t.nome.split("_");
    if (CURSOS_FORA[curso]) { fora.push(`${CURSOS_FORA[curso]}: ${t.nome} (SERE ${t.cod}, ${TURNO[t.turno] ?? t.turno})`); continue; }
    if (!TURNO[t.turno]) { fora.push(`turno ${t.turno} (integral?): ${t.nome} (SERE ${t.cod})`); continue; }
    const fundamental = curso === "4060";
    const nome = NOMES_FIXOS[t.nome] ?? `${serie}º${letra}`;
    const g = new Map();
    for (const cod of [t.cod, t.codIf].filter(Boolean)) for (const [d, a] of grade.get(cod) ?? []) g.set(d, (g.get(d) ?? 0) + a);
    const espanhola = g.get(DISC_ESPANHOLA);
    if (espanhola && !COM_ESPANHOLA) g.delete(DISC_ESPANHOLA);
    plano.push({
      rco: t.nome, codigoSere: t.cod, codigoSereIf: t.codIf, nome, turno: TURNO[t.turno],
      serie: fundamental ? `${serie}º Ano` : `${serie}ª Série`, nivel: fundamental ? "fundamental" : "medio_tecnico",
      disciplinas: [...g].map(([d, a]) => ({ cod: d, aulas: a })), espanhola: espanhola && !COM_ESPANHOLA ? espanhola : 0,
    });
  }
  const repetidos = plano.filter((p, i) => plano.findIndex((q) => q.nome === p.nome && q.turno === p.turno) !== i);
  return { disc, plano, fora, repetidos };
}

function mostrarPlano({ disc, plano, fora, repetidos }) {
  for (const turno of ["matutino", "vespertino", "noturno"]) {
    const l = plano.filter((p) => p.turno === turno);
    if (!l.length) continue;
    console.log(`\n=== ${turno.toUpperCase()} (${l.length} turmas) ===`);
    for (const p of l) {
      const total = p.disciplinas.reduce((s, d) => s + d.aulas, 0);
      console.log(`  ${p.nome.padEnd(7)} ${p.serie.padEnd(9)} SERE ${p.codigoSere}${p.codigoSereIf ? " / IF " + p.codigoSereIf : ""}  ${p.disciplinas.length} disciplinas, ${total} aulas/semana  (${p.rco})${p.espanhola ? `  [Espanhola ${p.espanhola} fora]` : ""}`);
    }
  }
  if (fora.length) { console.log(`\nFora desta importacao (${fora.length}):`); fora.forEach((f) => console.log("  " + f)); }
  if (repetidos.length) console.log(`\nATENCAO: nomes repetidos no mesmo turno: ${repetidos.map((p) => p.nome + " " + p.turno).join(", ")}`);
  return disc;
}

(async () => {
  const arq = opt("arquivo");
  if (SO_ARQUIVO) {
    if (!arq) { console.log("Informe --arquivo=caminho"); return; }
    mostrarPlano(planejar(fs.readFileSync(arq, "utf8")));
    return;
  }
  if (!ESCOLA_ID) { console.log("Uso: node importar-turmas-do-rco.cjs esc_xxx [--arquivo=...] [--aplicar]"); return; }

  const { Client } = require("pg");
  const c = new Client({ connectionString: carregarDatabaseUrl(), ssl: process.env.PGSSL === "0" ? false : { rejectUnauthorized: false } });
  await c.connect();
  try {
    const escola = (await c.query(`SELECT id, nome_fantasia FROM escolas WHERE id = $1`, [ESCOLA_ID])).rows[0];
    if (!escola) { console.log("Escola nao encontrada:", ESCOLA_ID); return; }
    let xml = arq ? fs.readFileSync(arq, "utf8") : null;
    if (!xml) {
      const cfg = (await c.query(`SELECT valor FROM configuracoes WHERE escola_id = $1 AND chave = 'arquivo_rco_conteudo'`, [ESCOLA_ID])).rows[0];
      xml = cfg?.valor?.xml ?? null;
    }
    if (!xml || !xml.includes("<TURMAS>")) { console.log("Sem arquivo do RCO: envie pela tela Arquivo do RCO da escola ou use --arquivo=caminho."); return; }
    console.log(`Escola: ${escola.nome_fantasia} (${escola.id}) · ano letivo ${ANO}`);

    const p = planejar(xml);
    const disc = mostrarPlano(p);
    if (p.repetidos.length) { console.log("\nNao sigo: ha turmas com o mesmo nome no mesmo turno."); return; }

    // turmas ja existentes
    const existentes = (await c.query(`SELECT id, nome, turno, codigo_sere FROM turmas WHERE escola_id = $1`, [ESCOLA_ID])).rows;
    const jaTem = (t) => existentes.find((e) => Number(e.codigo_sere) === t.codigoSere || (e.nome === t.nome && e.turno === t.turno));
    const novas = p.plano.filter((t) => !jaTem(t));
    if (novas.length < p.plano.length) console.log(`\nJa existem e serao puladas: ${p.plano.filter(jaTem).map((t) => t.nome + " " + t.turno).join(", ")}`);

    // disciplinas: casar cada codigo do RCO usado com uma disciplina da escola
    const discsEscola = (await c.query(`SELECT id, nome, codigo_sae, codigo_externo_rco FROM disciplinas WHERE escola_id = $1`, [ESCOLA_ID])).rows;
    const saePorExterno = new Map((await c.query(`SELECT codigo_sae, codigo_externo FROM codigos_rco_disciplina`)).rows.map((r) => [Number(r.codigo_externo), Number(r.codigo_sae)]));
    const usados = [...new Set(novas.flatMap((t) => t.disciplinas.map((d) => d.cod)))].sort((a, b) => a - b);
    const casamento = new Map(); // codRco -> { id|null, como, nome, gravarCodigo }
    const avisos = [];
    for (const cod of usados) {
      const d = disc.get(cod) ?? { cod, nome: `DISCIPLINA ${cod}`, sae: null };
      let c1 = discsEscola.filter((x) => Number(x.codigo_externo_rco) === cod), como = "codigo externo";
      if (!c1.length) {
        const saes = [d.sae, saePorExterno.get(cod)].filter(Boolean).map(String);
        c1 = discsEscola.filter((x) => x.codigo_sae && saes.includes(String(x.codigo_sae)) && x.codigo_externo_rco == null); como = "SAE";
      }
      if (!c1.length) { c1 = discsEscola.filter((x) => chave(x.nome) === chave(d.nome) && x.codigo_externo_rco == null); como = "nome"; }
      if (c1.length > 1) {
        const mesmoNome = c1.filter((x) => chave(x.nome) === chave(d.nome));
        if (mesmoNome.length === 1) c1 = mesmoNome;
      }
      if (c1.length > 1) { avisos.push(`${cod} ${d.nome}: ${c1.length} disciplinas candidatas (${c1.map((x) => x.nome + " #" + x.id).join(", ")})`); continue; }
      if (c1.length === 1) casamento.set(cod, { id: c1[0].id, como, nome: c1[0].nome, gravarCodigo: c1[0].codigo_externo_rco == null });
      else casamento.set(cod, { id: null, como: "NOVA", nome: nomeBonito(d.nome), gravarCodigo: true });
    }
    // duas disciplinas do RCO caindo na mesma disciplina da escola
    const porId = new Map();
    for (const [cod, m] of casamento) if (m.id) porId.set(m.id, [...(porId.get(m.id) ?? []), cod]);
    for (const [id, cods] of porId) if (cods.length > 1) avisos.push(`disciplina #${id} recebeu ${cods.length} codigos do RCO (${cods.join(", ")})`);

    console.log(`\nDisciplinas do RCO usadas (${usados.length}):`);
    for (const cod of usados) {
      const m = casamento.get(cod); const d = disc.get(cod);
      if (!m) continue;
      console.log(`  ${String(cod).padEnd(5)} ${(d?.nome ?? "?").padEnd(32)} -> ${m.id ? `${m.nome} #${m.id} (${m.como})` : `NOVA: "${m.nome}"`}${m.gravarCodigo ? "  + Codigo Externo" : ""}`);
    }
    const nNovas = [...casamento.values()].filter((m) => !m.id).length;
    console.log(`\nResumo: ${novas.length} turma(s) nova(s), ${novas.reduce((s, t) => s + t.disciplinas.length, 0)} vinculos turma x disciplina, ${nNovas} disciplina(s) nova(s).`);
    if (avisos.length) { console.log("\nATENCAO:"); avisos.forEach((a) => console.log("  " + a)); }

    if (!APLICAR) { console.log("\nENSAIO: nada foi gravado. Para gravar, rode de novo com --aplicar."); return; }
    if (avisos.length) { console.log("\nNao gravei: resolva os avisos de ATENCAO antes."); return; }
    if (!novas.length) { console.log("\nNada a gravar."); return; }

    const criado = { escolaId: ESCOLA_ID, em: new Date().toISOString(), turmas: [], disciplinasNovas: [], codigosGravados: [] };
    await c.query("BEGIN");
    try {
      for (const [cod, m] of casamento) {
        if (m.id) {
          if (m.gravarCodigo) {
            const r = await c.query(`UPDATE disciplinas SET codigo_externo_rco = $1 WHERE id = $2 AND escola_id = $3 AND codigo_externo_rco IS NULL`, [cod, m.id, ESCOLA_ID]);
            if (r.rowCount) criado.codigosGravados.push({ disciplinaId: m.id, codigo: cod });
          }
        } else {
          const d = disc.get(cod);
          const aulas = Math.max(...novas.flatMap((t) => t.disciplinas.filter((x) => x.cod === cod).map((x) => x.aulas)), 1);
          const r = await c.query(
            `INSERT INTO disciplinas (escola_id, nome, carga_semanal, codigo_sae, codigo_externo_rco) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [ESCOLA_ID, m.nome, aulas, d?.sae != null ? String(d.sae) : null, cod]);
          m.id = r.rows[0].id;
          criado.disciplinasNovas.push({ id: m.id, nome: m.nome, codigo: cod });
        }
      }
      for (const t of novas) {
        const r = await c.query(
          `INSERT INTO turmas (escola_id, nome, serie, turno, nivel_ensino, ano_letivo, codigo_sere, codigo_sere_if) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [ESCOLA_ID, t.nome, t.serie, t.turno, t.nivel, ANO, t.codigoSere, t.codigoSereIf]);
        const turmaId = r.rows[0].id;
        for (const d of t.disciplinas) {
          await c.query(`INSERT INTO turma_disciplinas (turma_id, disciplina_id, carga_horaria_semanal_override) VALUES ($1, $2, $3)`, [turmaId, casamento.get(d.cod).id, d.aulas]);
        }
        criado.turmas.push({ id: turmaId, nome: t.nome, turno: t.turno, sere: t.codigoSere });
      }
      await c.query("COMMIT");
    } catch (e) { await c.query("ROLLBACK"); throw e; }
    const pasta = path.join(__dirname, "_arquivo"); fs.mkdirSync(pasta, { recursive: true });
    const reg = path.join(pasta, `importar-turmas-${ESCOLA_ID}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(reg, JSON.stringify(criado, null, 2));
    // conferencia depois de gravar (o pooler ja engoliu gravacao antes)
    const n = (await c.query(`SELECT COUNT(*)::int n FROM turmas WHERE escola_id = $1`, [ESCOLA_ID])).rows[0].n;
    console.log(`\nGRAVADO: ${criado.turmas.length} turmas, ${criado.disciplinasNovas.length} disciplinas novas, ${criado.codigosGravados.length} Codigos Externos. Turmas da escola agora: ${n}. Registro: ${reg}`);
  } finally { await c.end(); }
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
