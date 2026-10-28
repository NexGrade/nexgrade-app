/**
 * padronizar-disciplinas.cjs  [ENSAIO por padrao; grava so com --aplicar]
 * Deixa as disciplinas USADAS da escola no padrao NexGrade (dados\padrao-disciplinas.json, por Codigo
 * Externo): mesmo nome e mesma sigla em todas as escolas. Sem padrao para o codigo: usa a sigla do
 * catalogo SEED-PR do NexGrade (por codigo ou nome); se nem assim houver, avisa.
 * Com --limpar, apaga tambem o que veio do catalogo e NAO e usado:
 *  - cursos nao ofertados (ofertado = false) da escola, com as matrizes e itens deles;
 *  - disciplinas sem nenhum uso (turma, grade oficial ou experimento, professor, aula fixa, matriz de curso que fica).
 *  A escola pode trazer o catalogo de volta em Cursos e Disciplinas -> "Importar catalogo oficial SEED-PR".
 * Antes de gravar, salva em _arquivo\ tudo o que muda ou e apagado (para desfazer).
 * Uso (em lib\db):
 *   node padronizar-disciplinas.cjs esc_xxx
 *   node padronizar-disciplinas.cjs esc_xxx --limpar
 *   node padronizar-disciplinas.cjs esc_xxx --limpar --aplicar
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const ARGS = process.argv.slice(2);
const APLICAR = ARGS.includes("--aplicar");
const LIMPAR = ARGS.includes("--limpar");
const ESCOLA_ID = ARGS.find((a) => !a.startsWith("--"));
const PADRAO = JSON.parse(fs.readFileSync(path.join(__dirname, "dados", "padrao-disciplinas.json"), "utf8")).porCodigo;

function carregarDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const p = [path.join(__dirname, ".env"), path.join("lib", "db", ".env")].find((f) => fs.existsSync(f));
  const linha = fs.readFileSync(p, "utf8").split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
  return linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}
const chave = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

(async () => {
  if (!ESCOLA_ID) { console.log("Uso: node padronizar-disciplinas.cjs esc_xxx [--limpar] [--aplicar]"); return; }
  const c = new Client({ connectionString: carregarDatabaseUrl(), ssl: process.env.PGSSL === "0" ? false : { rejectUnauthorized: false } });
  await c.connect();
  try {
    const escola = (await c.query(`SELECT nome_fantasia FROM escolas WHERE id = $1`, [ESCOLA_ID])).rows[0];
    if (!escola) { console.log("Escola nao encontrada"); return; }
    console.log(`Escola: ${escola.nome_fantasia}`);
    const cursosFora = LIMPAR ? (await c.query(`SELECT id, nome FROM cursos WHERE escola_id = $1 AND ofertado = false`, [ESCOLA_ID])).rows : [];
    const idsCursosFora = cursosFora.map((x) => x.id);
    const discs = (await c.query(
      `SELECT d.*,
              (SELECT COUNT(*) FROM turma_disciplinas td WHERE td.disciplina_id = d.id)::int
            + (SELECT COUNT(*) FROM horarios h WHERE h.disciplina_id = d.id)::int
            + (SELECT COUNT(*) FROM horarios_experimentais he WHERE he.disciplina_id = d.id)::int
            + (SELECT COUNT(*) FROM professor_disciplinas pd WHERE pd.disciplina_id = d.id)::int
            + (SELECT COUNT(*) FROM aulas_fixas af WHERE af.disciplina_id = d.id)::int AS usos,
              (SELECT COUNT(*) FROM itens_matriz im JOIN matrizes_curriculares mc ON mc.id = im.matriz_curricular_id
                WHERE im.disciplina_id = d.id AND NOT (mc.curso_id = ANY($2::int[])))::int AS em_curso_que_fica
         FROM disciplinas d WHERE d.escola_id = $1 ORDER BY d.nome`, [ESCOLA_ID, idsCursosFora])).rows;
    const catalogo = (await c.query(`SELECT nome, sigla, codigo_externo_rco AS cod FROM disciplinas_catalogo WHERE sigla IS NOT NULL`)).rows;
    const usadas = discs.filter((d) => d.usos > 0);

    // 1) nome e sigla das usadas
    const mudar = [], semPadrao = [];
    for (const d of usadas) {
      const p = d.codigo_externo_rco != null ? PADRAO[String(d.codigo_externo_rco)] : null;
      const cat = catalogo.find((x) => (d.codigo_externo_rco != null && Number(x.cod) === Number(d.codigo_externo_rco)) || chave(x.nome) === chave(d.nome));
      const nome = p?.nome ?? d.nome;
      const sigla = p?.sigla ?? d.sigla ?? cat?.sigla ?? null;
      if (!sigla) semPadrao.push(d);
      if (nome !== d.nome || sigla !== d.sigla) mudar.push({ id: d.id, cod: d.codigo_externo_rco, de: { nome: d.nome, sigla: d.sigla }, para: { nome, sigla } });
    }
    console.log(`\nDisciplinas usadas: ${usadas.length} · a padronizar: ${mudar.length}`);
    for (const m of mudar) {
      const n = m.de.nome !== m.para.nome ? `nome "${m.de.nome}" -> "${m.para.nome}"` : `"${m.para.nome}"`;
      const s = m.de.sigla !== m.para.sigla ? `sigla ${m.de.sigla ?? "(sem)"} -> ${m.para.sigla}` : `sigla ${m.para.sigla}`;
      console.log(`  #${m.id} cod ${m.cod ?? "-"}: ${n}; ${s}`);
    }
    if (semPadrao.length) console.log(`\nATENCAO: sem sigla e sem padrao (incluir em dados\\padrao-disciplinas.json): ${semPadrao.map((d) => `#${d.id} ${d.nome} (cod ${d.codigo_externo_rco ?? "-"})`).join(", ")}`);
    // nomes que ficariam iguais depois da padronizacao
    const nomesFinais = {};
    for (const d of usadas) { const n = mudar.find((m) => m.id === d.id)?.para.nome ?? d.nome; (nomesFinais[chave(n)] ??= []).push(d.id); }
    const repetidos = Object.values(nomesFinais).filter((x) => x.length > 1);
    if (repetidos.length) console.log(`ATENCAO: nomes repetidos depois de padronizar: ${repetidos.map((x) => x.join("+")).join(", ")}`);

    // 2) limpeza
    let apagar = [];
    if (LIMPAR) {
      apagar = discs.filter((d) => d.usos === 0 && d.em_curso_que_fica === 0);
      const ficamPorMatriz = discs.filter((d) => d.usos === 0 && d.em_curso_que_fica > 0).length;
      console.log(`\nLIMPEZA: ${cursosFora.length} curso(s) nao ofertado(s) apagados (com matrizes e itens) · ${apagar.length} disciplina(s) sem uso apagadas` +
        (ficamPorMatriz ? ` · ${ficamPorMatriz} sem uso ficam (estao na matriz de curso ofertado)` : ""));
      console.log(`  Ficam: ${discs.length - apagar.length} disciplinas.`);
    } else console.log(`\n(Sem --limpar: as ${discs.length - usadas.length} disciplinas sem uso ficam.)`);

    if (!APLICAR) { console.log("\nENSAIO: nada foi gravado. Para gravar, rode de novo com --aplicar."); return; }
    if (semPadrao.length || repetidos.length) { console.log("\nNao gravei: resolva os itens de ATENCAO antes."); return; }

    const pasta = path.join(__dirname, "_arquivo"); fs.mkdirSync(pasta, { recursive: true });
    const carimbo = new Date().toISOString().replace(/[:.]/g, "-");
    const backup = { escolaId: ESCOLA_ID, em: new Date().toISOString(), mudar, disciplinasApagadas: apagar.map(({ usos, em_curso_que_fica, ...d }) => d), cursos: [], matrizes: [], itens: [] };
    if (LIMPAR && idsCursosFora.length) {
      backup.cursos = (await c.query(`SELECT * FROM cursos WHERE id = ANY($1::int[])`, [idsCursosFora])).rows;
      backup.matrizes = (await c.query(`SELECT * FROM matrizes_curriculares WHERE curso_id = ANY($1::int[])`, [idsCursosFora])).rows;
      backup.itens = (await c.query(`SELECT im.* FROM itens_matriz im JOIN matrizes_curriculares mc ON mc.id = im.matriz_curricular_id WHERE mc.curso_id = ANY($1::int[])`, [idsCursosFora])).rows;
    }
    const arq = path.join(pasta, `backup-padronizar-disciplinas-${ESCOLA_ID}-${carimbo}.json`);
    fs.writeFileSync(arq, JSON.stringify(backup, null, 1));

    await c.query("BEGIN");
    try {
      for (const m of mudar) await c.query(`UPDATE disciplinas SET nome = $1, sigla = $2 WHERE id = $3 AND escola_id = $4`, [m.para.nome, m.para.sigla, m.id, ESCOLA_ID]);
      let nCursos = 0, nDisc = 0;
      if (LIMPAR) {
        if (idsCursosFora.length) {
          // turma ligada a matriz de curso que sai: perde so o vinculo com a matriz (onDelete set null)
          nCursos = (await c.query(`DELETE FROM cursos WHERE id = ANY($1::int[]) AND escola_id = $2`, [idsCursosFora, ESCOLA_ID])).rowCount;
        }
        if (apagar.length) nDisc = (await c.query(`DELETE FROM disciplinas WHERE id = ANY($1::int[]) AND escola_id = $2`, [apagar.map((d) => d.id), ESCOLA_ID])).rowCount;
      }
      await c.query("COMMIT");
      const n = (await c.query(`SELECT COUNT(*)::int n FROM disciplinas WHERE escola_id = $1`, [ESCOLA_ID])).rows[0].n;
      console.log(`\nGRAVADO: ${mudar.length} disciplinas padronizadas${LIMPAR ? `, ${nCursos} cursos e ${nDisc} disciplinas apagados` : ""}. Disciplinas da escola agora: ${n}. Backup: ${arq}`);
    } catch (e) { await c.query("ROLLBACK"); throw e; }
  } finally { await c.end(); }
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
