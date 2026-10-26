/**
 * disciplinas-duplicadas.cjs
 *
 * Junta disciplinas REPETIDAS de uma escola (26/10/2026, pedido da Simone no teste do Integral:
 * a lista de disciplinas da aula manual tinha "Ciencias" duas vezes etc.).
 *
 * Repetida = mesmo nome (sem acento/maiusculas/espacos extras) E mesmos codigos (codigo SAE e
 * Codigo Externo do RCO; vazio = vazio). Mesmo nome com codigo DIFERENTE nao e juntada (ex.: Rec.
 * Aprend. LP 6299 x 6038 no Mario Braga, que o RCO exige separadas) -- so aparece no relatorio.
 * Em cada grupo fica a disciplina mais usada (empate: a de menor id). As outras tem as referencias
 * passadas para ela e sao apagadas:
 *   horarios, horarios_experimentais, aulas_fixas, turma_disciplinas, itens_matriz, professor_disciplinas.
 * Grupo com a mesma turma (turma_disciplinas) ou a mesma matriz (itens_matriz) ligada as duas
 * disciplinas NAO e juntado (cargas/professores diferentes: decidir a mao) -- vai para o relatorio.
 * professor_disciplinas repetida (professor ja habilitado na que fica) e apagada.
 *
 * Seguro: ensaio por padrao; --aplicar grava numa transacao com backup em lib/db/_arquivo/.
 * Uso (em lib\db):
 *   node disciplinas-duplicadas.cjs                          (lista as escolas e quantos grupos repetidos)
 *   node disciplinas-duplicadas.cjs --escola="Demonstra"     (ensaio de uma escola, pelo nome ou id)
 *   node disciplinas-duplicadas.cjs --escola="Demonstra" --aplicar
 *   node disciplinas-duplicadas.cjs --escola="Demonstra" --compativeis   (junta tambem quando um codigo esta vazio)
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const APLICAR = process.argv.includes("--aplicar");
// --compativeis: junta tambem quando um dos codigos esta VAZIO numa delas (ex.: "Arte" SAE 704/RCO 21 e
// "Arte" SAE 704 sem RCO). Codigos preenchidos e diferentes nunca juntam.
const COMPATIVEIS = process.argv.includes("--compativeis");
const ESCOLA = (process.argv.find((a) => a.startsWith("--escola=")) || "").slice(9);
const TABELAS = ["horarios", "horarios_experimentais", "aulas_fixas", "turma_disciplinas", "itens_matriz", "professor_disciplinas"];

function carregarDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const p = [path.join(__dirname, ".env"), path.join("lib", "db", ".env")].find((f) => fs.existsSync(f));
  if (!p) throw new Error("DATABASE_URL nao encontrada (defina a variavel ou crie lib/db/.env)");
  const linha = fs.readFileSync(p, "utf8").split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
  return linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
const chave = (d) => `${norm(d.nome)}|${d.codigo_sae ?? ""}|${d.codigo_externo_rco ?? ""}`;

async function main() {
  const c = new Client({ connectionString: carregarDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const escolas = (await c.query(`SELECT id, nome_fantasia FROM escolas ORDER BY nome_fantasia`)).rows;
    if (!ESCOLA) {
      console.log("Escolas e grupos de disciplinas repetidas (mesmo nome e mesmos codigos):");
      for (const e of escolas) {
        const ds = (await c.query(`SELECT id, nome, codigo_sae, codigo_externo_rco FROM disciplinas WHERE escola_id = $1`, [e.id])).rows;
        const g = new Map(); for (const d of ds) g.set(chave(d), (g.get(chave(d)) || 0) + 1);
        const rep = [...g.values()].filter((n) => n > 1).length;
        console.log(`  ${e.nome_fantasia}  (${e.id}): ${ds.length} disciplinas, ${rep} grupo(s) repetido(s)`);
      }
      console.log('\nPara ver uma escola: node disciplinas-duplicadas.cjs --escola="parte do nome"');
      return;
    }
    const alvo = escolas.filter((e) => e.id === ESCOLA || norm(e.nome_fantasia).includes(norm(ESCOLA)));
    if (alvo.length !== 1) { console.log(`Escola "${ESCOLA}": ${alvo.length} encontradas (${alvo.map((e) => e.nome_fantasia).join("; ")}). Seja mais especifica.`); return; }
    const escola = alvo[0];
    console.log(`Escola: ${escola.nome_fantasia} (${escola.id})`);

    const ds = (await c.query(`SELECT id, nome, codigo_sae, codigo_externo_rco FROM disciplinas WHERE escola_id = $1 ORDER BY id`, [escola.id])).rows;
    const ids = ds.map((d) => d.id);
    const refs = {}; // tabela -> linhas {id, disciplina_id, dono}
    refs.horarios = (await c.query(`SELECT id, disciplina_id FROM horarios WHERE disciplina_id = ANY($1)`, [ids])).rows;
    refs.horarios_experimentais = (await c.query(`SELECT id, disciplina_id FROM horarios_experimentais WHERE disciplina_id = ANY($1)`, [ids])).rows;
    refs.aulas_fixas = (await c.query(`SELECT id, disciplina_id FROM aulas_fixas WHERE disciplina_id = ANY($1)`, [ids])).rows;
    refs.turma_disciplinas = (await c.query(`SELECT id, disciplina_id, turma_id AS dono FROM turma_disciplinas WHERE disciplina_id = ANY($1)`, [ids])).rows;
    refs.itens_matriz = (await c.query(`SELECT id, disciplina_id, matriz_curricular_id AS dono FROM itens_matriz WHERE disciplina_id = ANY($1)`, [ids])).rows;
    refs.professor_disciplinas = (await c.query(`SELECT id, disciplina_id, professor_id AS dono FROM professor_disciplinas WHERE disciplina_id = ANY($1)`, [ids])).rows;
    const uso = (id) => TABELAS.reduce((n, t) => n + refs[t].filter((r) => r.disciplina_id === id).length, 0);

    // mesmo nome, codigos diferentes: so relatorio
    const porNome = new Map(); for (const d of ds) { const k = norm(d.nome); if (!porNome.has(k)) porNome.set(k, []); porNome.get(k).push(d); }
    const soNome = [...porNome.values()].filter((g) => g.length > 1 && new Set(g.map(chave)).size > 1 &&
      (!COMPATIVEIS || g.some((a) => g.some((b) => !["codigo_sae", "codigo_externo_rco"].every((k) => a[k] == null || a[k] === "" || b[k] == null || b[k] === "" || String(a[k]) === String(b[k]))))));

    // com --compativeis, fica a mais completa (com codigo do RCO, depois com SAE), depois a mais usada
    const completude = (d) => (d.codigo_externo_rco != null ? 2 : 0) + (d.codigo_sae ? 1 : 0);
    const compat = (a, b) => ["codigo_sae", "codigo_externo_rco"].every((k) => a[k] == null || a[k] === "" || b[k] == null || b[k] === "" || String(a[k]) === String(b[k]));
    let listaGrupos;
    if (!COMPATIVEIS) {
      const grupos = new Map(); for (const d of ds) { const k = chave(d); if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(d); }
      listaGrupos = [...grupos.values()];
    } else {
      listaGrupos = [];
      for (const g of porNome.values()) {
        const clusters = [];
        for (const d of [...g].sort((a, b) => completude(b) - completude(a) || uso(b.id) - uso(a.id) || a.id - b.id)) {
          const cl = clusters.find((c) => c.every((x) => compat(x, d)));
          if (cl) cl.push(d); else clusters.push([d]);
        }
        listaGrupos.push(...clusters);
      }
    }
    const plano = []; const pulados = [];
    for (const g of listaGrupos.filter((g) => g.length > 1)) {
      const ordenado = COMPATIVEIS ? g : [...g].sort((a, b) => uso(b.id) - uso(a.id) || a.id - b.id);
      const fica = ordenado[0]; const saem = ordenado.slice(1);
      const conflito = [];
      for (const t of ["turma_disciplinas", "itens_matriz"]) {
        const donosFica = new Set(refs[t].filter((r) => r.disciplina_id === fica.id).map((r) => r.dono));
        for (const s of saem) {
          const donosSai = refs[t].filter((r) => r.disciplina_id === s.id).map((r) => r.dono);
          const repetidos = donosSai.filter((d) => donosFica.has(d));
          if (repetidos.length || new Set(donosSai).size !== donosSai.length) conflito.push(`${t === "turma_disciplinas" ? "turma" : "matriz"} ${[...new Set(repetidos)].join(",")} ligada as duas`);
          donosSai.forEach((d) => donosFica.add(d));
        }
      }
      const linha = `${fica.nome} [SAE ${fica.codigo_sae ?? "-"}, RCO ${fica.codigo_externo_rco ?? "-"}]: fica id ${fica.id} (${uso(fica.id)} usos); saem ${saem.map((s) => `id ${s.id}${COMPATIVEIS ? ` [SAE ${s.codigo_sae ?? "-"}, RCO ${s.codigo_externo_rco ?? "-"}]` : ""} (${uso(s.id)} usos)`).join(", ")}`;
      if (conflito.length) pulados.push(`${linha}\n      NAO JUNTADO: ${conflito.join("; ")}`);
      else plano.push({ fica, saem, linha });
    }

    console.log(`\n== Repetidas que serao juntadas: ${plano.length} grupo(s)`);
    plano.forEach((p) => console.log("   " + p.linha));
    if (pulados.length) { console.log(`\n== Repetidas NAO juntadas (decidir a mao): ${pulados.length}`); pulados.forEach((p) => console.log("   " + p)); }
    if (soNome.length) {
      console.log(`\n== Mesmo nome com codigos diferentes (ficam separadas, de proposito): ${soNome.length}`);
      soNome.forEach((g) => console.log("   " + g.map((d) => `${d.nome} id ${d.id} [SAE ${d.codigo_sae ?? "-"}, RCO ${d.codigo_externo_rco ?? "-"}] (${uso(d.id)} usos)`).join("  |  ")));
    }
    const apagar = plano.flatMap((p) => p.saem.map((s) => s.id));
    console.log(`\nTotal: ${apagar.length} disciplina(s) a apagar, referencias passadas para a que fica.`);
    if (!plano.length) return;
    if (!APLICAR) { console.log(`\nENSAIO: nada foi gravado. Para gravar: node disciplinas-duplicadas.cjs --escola="${ESCOLA}"${COMPATIVEIS ? " --compativeis" : ""} --aplicar`); return; }

    const dir = path.join(__dirname, "_arquivo"); fs.mkdirSync(dir, { recursive: true });
    const arq = path.join(dir, `backup-disciplinas-duplicadas-${escola.id}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    const backup = { escola: escola.id, disciplinas: ds.filter((d) => apagar.includes(d.id)), referencias: {} };
    const completas = (await c.query(`SELECT * FROM disciplinas WHERE id = ANY($1)`, [apagar])).rows;
    backup.disciplinas = completas;
    for (const t of TABELAS) backup.referencias[t] = refs[t].filter((r) => apagar.includes(r.disciplina_id)).map((r) => ({ id: r.id, disciplina_id: r.disciplina_id }));
    fs.writeFileSync(arq, JSON.stringify(backup, null, 2));

    await c.query("BEGIN");
    let apagadasPd = 0;
    for (const p of plano) {
      const de = p.saem.map((s) => s.id);
      // professor ja habilitado na que fica: apaga a habilitacao repetida
      const r = await c.query(
        `DELETE FROM professor_disciplinas pd WHERE pd.disciplina_id = ANY($1)
           AND EXISTS (SELECT 1 FROM professor_disciplinas x WHERE x.professor_id = pd.professor_id AND x.disciplina_id = $2)`, [de, p.fica.id]);
      apagadasPd += r.rowCount;
      // duas repetidas habilitadas no mesmo professor: deixa uma so
      await c.query(
        `DELETE FROM professor_disciplinas pd WHERE pd.disciplina_id = ANY($1)
           AND EXISTS (SELECT 1 FROM professor_disciplinas x WHERE x.professor_id = pd.professor_id AND x.disciplina_id = ANY($1) AND x.id < pd.id)`, [de]);
      for (const t of TABELAS) await c.query(`UPDATE ${t} SET disciplina_id = $1 WHERE disciplina_id = ANY($2)`, [p.fica.id, de]);
      // codigo que so a repetida tinha passa para a que fica
      const sae = p.saem.map((x) => x.codigo_sae).find((v) => v);
      const rco = p.saem.map((x) => x.codigo_externo_rco).find((v) => v != null);
      await c.query(`UPDATE disciplinas SET codigo_sae = COALESCE(NULLIF(codigo_sae, ''), $2), codigo_externo_rco = COALESCE(codigo_externo_rco, $3) WHERE id = $1`, [p.fica.id, sae ?? null, rco ?? null]);
      await c.query(`DELETE FROM disciplinas WHERE id = ANY($1) AND escola_id = $2`, [de, escola.id]);
    }
    await c.query("COMMIT");
    console.log(`\nGRAVADO. ${apagar.length} disciplina(s) apagada(s) (${apagadasPd} habilitacao(oes) repetida(s) de professor removida(s)). Backup: ${arq}`);
  } catch (e) {
    try { await c.query("ROLLBACK"); } catch {}
    throw e;
  } finally {
    await c.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
