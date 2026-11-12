/**
 * completar-rco-andreatta.cjs  [ENSAIO por padrao; grava so com --aplicar]  (11/11/2026)
 * O C.E. Andre Andreatta foi cadastrado pelo Urania (scripts/cadastrar-andreatta-urania.ts), sem codigo SERE.
 * Com o arquivo do RCO (o ultimo enviado pela tela "Arquivo do RCO", em configuracoes), este script:
 *  1) grava codigo_sere (e codigo_sere_if da 3a serie dividida) nas 20 turmas que ja existem, pelo nome;
 *     "0016_3_1_A" = 3oA (Tecnico em Administracao, 3a serie) e "2511_1_1_A" = 1oA (Tecnico, 1a serie);
 *  2) compara a grade do RCO (FGB + IF somadas) com os vinculos de cada turma pelo Codigo Externo;
 *     grava o Codigo Externo na disciplina que ainda nao tem, quando o par e unico (mesma carga, so ela sobrando);
 *  3) apaga as turmas duplicadas "3º Tec" e "1º Tec" criadas pela importacao de turmas do RCO (Painel Master,
 *     11/11 19:36), so se estiverem sem aula na grade e sem matriz.
 * Monitoria (cursos 3041/3042) fica de fora. Nao mexe em aulas, professores, HA nem matrizes.
 * Uso (em lib\db):  node completar-rco-andreatta.cjs            (dry-run)
 *                   node completar-rco-andreatta.cjs --aplicar  (backup em _arquivo + grava)
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const APLICAR = process.argv.includes("--aplicar");
const ESCOLA = "esc_99494098d00349d2b5442e66";
const NOMES_FIXOS = { "0016_3_1_A": "3ºA", "2511_1_1_A": "1ºA" };
const CURSOS_FORA = new Set(["3041", "3042"]); // Monitoria
const DUPLICADAS = ["3º Tec", "1º Tec"];
const ESPANHOLA_FACULTATIVA = 3826; // fora das turmas de proposito (matricula facultativa)
// disciplinas sem Codigo Externo -> codigo do RCO (o RCO abrevia os nomes; conferido na grade de cada turma)
const CODIGOS = {
  "Recomposição da Aprendizagem em Língua Portuguesa": 6038, "Recomposição da Aprendizagem em Matemática": 6039,
  "Literatura e Produção de Texto": 2997, "Filosofia: Análise de Textos Filosóficos": 6318, "Sociologia: Governo, Cidadania e Sociedade": 6319,
};
// 3oB: o RCO tem LINGUA ESPANHOLA I (5744, 3 aulas), nao a Espanhola facultativa (3826): cria a disciplina e passa vinculo e aulas
const ESP_I = { turma: "3ºB", de: 3826, cod: 5744, nome: "Língua Espanhola I", carga: 3 };
const TURNO = { M: "matutino", T: "vespertino", N: "noturno" };

function lerDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const m = fs.readFileSync(path.join(__dirname, ".env"), "utf8").match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m);
  if (!m) throw new Error("DATABASE_URL nao definido");
  return m[1];
}
const tag = (b, n) => { const m = new RegExp(`<${n}>([\\s\\S]*?)</${n}>`).exec(b); return m ? m[1].trim() : ""; };
const registros = (xml, secao) => [...tag(xml, secao).matchAll(/<REGISTRO>([\s\S]*?)<\/REGISTRO>/g)].map((m) => m[1]);
const linhas = [];
const log = (s = "") => { linhas.push(s); console.log(s); };

(async () => {
  const c = new Client({ connectionString: lerDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  const q = async (sql, p = []) => (await c.query(sql, p)).rows;
  try {
    log(APLICAR ? "MODO: APLICAR\n" : "MODO: DRY-RUN (nada sera alterado)\n");
    const [arq] = await q("select valor from configuracoes where escola_id=$1 and chave='arquivo_rco_conteudo'", [ESCOLA]);
    const [env] = await q("select valor from configuracoes where escola_id=$1 and chave='arquivo_rco_exportacao'", [ESCOLA]);
    if (!arq) { log("A escola nao tem arquivo do RCO enviado."); process.exitCode = 1; return; }
    log(`Arquivo: ${env?.valor?.nomeArquivo} enviado em ${env?.valor?.enviadoEm} por ${env?.valor?.enviadoPor}`);
    const xml = arq.valor.xml;

    // ---- leitura do arquivo
    const discRco = new Map(registros(xml, "DISCIPLINAS").map((r) => [Number(tag(r, "CODIGO")), tag(r, "NOME")]));
    const turmasRco = registros(xml, "TURMAS").map((r) => ({ cod: Number(tag(r, "CODIGO")), nome: tag(r, "NOME"), turno: tag(r, "TURNO"), codIf: Number(tag(r, "COD_TURMA_IF")) || null }));
    const grade = new Map();
    for (const r of registros(xml, "GRADES")) {
      const t = Number(tag(r, "COD_TURMA")), d = Number(tag(r, "COD_DISCIPLINA")), a = Number(tag(r, "AULAS")) || 0;
      if (!grade.has(t)) grade.set(t, new Map());
      grade.get(t).set(d, (grade.get(t).get(d) ?? 0) + a);
    }
    const partesIf = new Set(turmasRco.map((t) => t.codIf).filter(Boolean));
    const plano = [];
    for (const t of turmasRco) {
      if (partesIf.has(t.cod)) continue;
      const [curso, serie, , letra] = t.nome.split("_");
      if (CURSOS_FORA.has(curso)) continue;
      const g = new Map();
      for (const cod of [t.cod, t.codIf].filter(Boolean)) for (const [d, a] of grade.get(cod) ?? []) g.set(d, (g.get(d) ?? 0) + a);
      plano.push({ rco: t.nome, nome: NOMES_FIXOS[t.nome] ?? `${serie}º${letra}`, turno: TURNO[t.turno], codigoSere: t.cod, codigoSereIf: t.codIf, grade: g });
    }

    // ---- banco
    const turmas = await q("select id, nome, turno, codigo_sere, codigo_sere_if, matriz_curricular_id from turmas where escola_id=$1", [ESCOLA]);
    const vinc = await q(
      `select td.turma_id, d.id disc_id, d.nome, d.codigo_externo_rco cod, coalesce(td.carga_horaria_semanal_override, d.carga_semanal) carga
         from turma_disciplinas td join disciplinas d on d.id=td.disciplina_id join turmas t on t.id=td.turma_id where t.escola_id=$1`, [ESCOLA]);
    const problemas = [], atualizaTurma = [], codigosDisc = new Map(); // disc_id -> {cod, nome, onde[]}
    // aplica (so na memoria) os codigos e a troca do Espanhol do 3oB antes de comparar
    for (const v of vinc) {
      if (v.cod == null && CODIGOS[v.nome] != null) {
        v.cod = CODIGOS[v.nome];
        const ja = codigosDisc.get(v.disc_id);
        codigosDisc.set(v.disc_id, { cod: v.cod, nome: v.nome, onde: [...(ja?.onde ?? []), turmas.find((t) => t.id === v.turma_id)?.nome] });
      }
      if (Number(v.cod) === ESP_I.de && turmas.find((t) => t.id === v.turma_id)?.nome === ESP_I.turma) { v.cod = ESP_I.cod; v.nome = ESP_I.nome; v.trocaEspI = true; }
    }
    const nomeD = (cod) => `${discRco.get(cod) ?? "?"} (${cod})`;

    log(`\n== 1) Turmas: ${plano.length} no RCO (sem Monitoria) x ${turmas.filter((t) => !DUPLICADAS.includes(t.nome)).length} no cadastro`);
    for (const p of plano) {
      const t = turmas.find((x) => x.nome === p.nome && x.turno === p.turno);
      if (!t) { problemas.push(`turma do RCO ${p.rco} (${p.nome}, ${p.turno}) nao existe no cadastro`); continue; }
      p.turma = t;
      const muda = t.codigo_sere !== p.codigoSere || (t.codigo_sere_if ?? null) !== (p.codigoSereIf ?? null);
      if (muda && t.codigo_sere != null) problemas.push(`${t.nome}: ja tem SERE ${t.codigo_sere}, o RCO diz ${p.codigoSere}`);
      if (muda) atualizaTurma.push({ id: t.id, nome: t.nome, sere: p.codigoSere, sereIf: p.codigoSereIf });
      log(`  ${t.nome.padEnd(4)} <- ${p.rco.padEnd(11)} SERE ${p.codigoSere}${p.codigoSereIf ? ` / IF ${p.codigoSereIf}` : ""}${muda ? "" : "  (ja estava)"}`);
    }
    for (const t of turmas) if (!DUPLICADAS.includes(t.nome) && !plano.some((p) => p.turma?.id === t.id)) problemas.push(`turma ${t.nome} (${t.turno}) nao esta no arquivo do RCO`);

    log(`\n== 2) Disciplinas: grade do RCO x vinculos da turma (pelo Codigo Externo)`);
    for (const p of plano.filter((x) => x.turma)) {
      const vs = vinc.filter((v) => v.turma_id === p.turma.id);
      const rcoSobra = new Map(p.grade), nossosSemPar = [];
      if (rcoSobra.has(ESPANHOLA_FACULTATIVA) && !vs.some((v) => Number(v.cod) === ESPANHOLA_FACULTATIVA)) rcoSobra.delete(ESPANHOLA_FACULTATIVA);
      for (const v of vs) {
        if (v.cod != null && rcoSobra.has(Number(v.cod))) {
          const a = rcoSobra.get(Number(v.cod)); rcoSobra.delete(Number(v.cod));
          if (a !== Number(v.carga)) log(`  ${p.turma.nome}: ${v.nome} — ${v.carga} aulas no cadastro, ${a} no RCO`);
        } else nossosSemPar.push(v);
      }
      // par unico pela carga entre o que sobrou dos dois lados (disciplina sem codigo)
      for (const v of [...nossosSemPar]) {
        if (v.cod != null) continue;
        const cand = [...rcoSobra].filter(([, a]) => a === Number(v.carga));
        if (cand.length === 1 && nossosSemPar.filter((x) => x.cod == null && Number(x.carga) === Number(v.carga)).length === 1) {
          const [cod] = cand[0];
          rcoSobra.delete(cod); nossosSemPar.splice(nossosSemPar.indexOf(v), 1);
          const ja = codigosDisc.get(v.disc_id);
          if (ja && ja.cod !== cod) problemas.push(`${v.nome}: codigo ${ja.cod} numa turma e ${cod} em ${p.turma.nome}`);
          codigosDisc.set(v.disc_id, { cod, nome: v.nome, onde: [...(ja?.onde ?? []), p.turma.nome] });
        }
      }
      if (nossosSemPar.length || rcoSobra.size) {
        log(`  ${p.turma.nome}: DIFERENTE do RCO`);
        for (const v of nossosSemPar) log(`     so no cadastro: ${v.nome} (${v.cod ?? "sem codigo"}) ${v.carga} aulas`);
        for (const [d, a] of rcoSobra) log(`     so no RCO:      ${nomeD(d)} ${a} aulas`);
      }
    }
    log("  (Lingua Espanhola facultativa, 4 aulas, ignorada: fica fora das turmas de proposito)");
    if (codigosDisc.size) {
      log(`\n  Codigo Externo a gravar (${codigosDisc.size}):`);
      for (const [, x] of codigosDisc) log(`     ${x.nome} <- ${nomeD(x.cod)}  [${x.onde.join(" ")}]`);
    }
    const discMesmoCod = await q("select id, nome, codigo_externo_rco cod from disciplinas where escola_id=$1 and codigo_externo_rco = any($2)", [ESCOLA, [...codigosDisc.values()].map((x) => x.cod)]);
    for (const d of discMesmoCod) log(`  AVISO: ${d.nome} (#${d.id}) ja usa o codigo ${d.cod}; as duas ficam com o mesmo Codigo Externo`);
    const espI = vinc.find((v) => v.trocaEspI);
    const t3b = turmas.find((t) => t.nome === ESP_I.turma);
    const [{ n: aulasEsp }] = espI ? await q("select count(*)::int n from horarios where turma_id=$1 and disciplina_id=$2", [t3b.id, espI.disc_id]) : [{ n: 0 }];
    if (espI) log(`\n  ${ESP_I.turma}: Língua Espanhola (facultativa, ${ESP_I.de}) -> ${ESP_I.nome} (${ESP_I.cod}, nova disciplina): vinculo e ${aulasEsp} aula(s)`);
    else problemas.push(`${ESP_I.turma}: vinculo de Lingua Espanhola nao encontrado`);

    log(`\n== 3) Turmas duplicadas da importacao do RCO`);
    const dup = [];
    for (const n of DUPLICADAS) {
      const t = turmas.find((x) => x.nome === n);
      if (!t) { log(`  ${n}: nao existe`); continue; }
      const [{ aulas }] = await q("select count(*)::int aulas from horarios where turma_id=$1", [t.id]);
      const [{ vinc: nv }] = await q("select count(*)::int vinc from turma_disciplinas where turma_id=$1", [t.id]);
      const [{ disp }] = await q("select count(*)::int disp from aulas_fixas where turma_id=$1", [t.id]).catch(() => [{ disp: 0 }]);
      log(`  ${n} (#${t.id}, SERE ${t.codigo_sere}): ${aulas} aula(s), ${nv} vinculo(s), matriz ${t.matriz_curricular_id ?? "nenhuma"} -> ${aulas || t.matriz_curricular_id || disp ? "NAO apaga" : "apaga"}`);
      if (aulas || t.matriz_curricular_id || disp) problemas.push(`${n} tem aula/matriz: nao sera apagada`);
      else dup.push(t);
    }

    if (problemas.length) { log(`\nATENCAO (${problemas.length}):`); problemas.forEach((p) => log("  - " + p)); }
    log(`\nResumo: ${atualizaTurma.length} turma(s) com codigo SERE, ${codigosDisc.size} disciplina(s) com Codigo Externo, ${dup.length} turma(s) duplicada(s) apagada(s).`);
    if (!APLICAR) { log("\nDRY-RUN: nada foi alterado. Rode com --aplicar."); return; }
    if (problemas.length) { log("\nNAO GRAVADO: resolva os itens de ATENCAO antes."); process.exitCode = 1; return; }

    // codigo SERE e unico? as duplicadas tem o mesmo SERE de 3oA/1oA: apagar antes de gravar
    const backup = {
      turmas: await q("select * from turmas where escola_id=$1", [ESCOLA]),
      turmaDisciplinasDuplicadas: await q("select * from turma_disciplinas where turma_id = any($1)", [dup.map((t) => t.id)]),
      disciplinas: await q("select id, nome, codigo_externo_rco from disciplinas where id = any($1)", [[...codigosDisc.keys()]]),
    };
    const arqBk = path.join(__dirname, "_arquivo", `backup-completar-rco-andreatta-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.mkdirSync(path.dirname(arqBk), { recursive: true });
    fs.writeFileSync(arqBk, JSON.stringify(backup, null, 1));
    log(`\nBackup: ${arqBk}`);
    await c.query("BEGIN");
    try {
      for (const t of dup) await c.query("delete from turmas where id=$1 and escola_id=$2", [t.id, ESCOLA]);
      for (const t of atualizaTurma) await c.query("update turmas set codigo_sere=$1, codigo_sere_if=$2 where id=$3 and escola_id=$4", [t.sere, t.sereIf, t.id, ESCOLA]);
      for (const [id, x] of codigosDisc) await c.query("update disciplinas set codigo_externo_rco=$1 where id=$2 and escola_id=$3 and codigo_externo_rco is null", [x.cod, id, ESCOLA]);
      // 3oB: Lingua Espanhola I (copia cor e categoria da Espanhola; sigla propria)
      const [base] = await q("select * from disciplinas where id=$1", [espI.disc_id]);
      const [nova] = await q(
        `insert into disciplinas (escola_id, nome, sigla, carga_semanal, cor, codigo_externo_rco, categoria_curricular_padrao)
         values ($1,$2,$3,$4,$5,$6,'IF') returning id`, [ESCOLA, ESP_I.nome, base.sigla ? `${base.sigla} I` : "ESP I", ESP_I.carga, base.cor, ESP_I.cod]);
      await c.query("update turma_disciplinas set disciplina_id=$1 where turma_id=$2 and disciplina_id=$3", [nova.id, t3b.id, espI.disc_id]);
      await c.query("update horarios set disciplina_id=$1 where turma_id=$2 and disciplina_id=$3", [nova.id, t3b.id, espI.disc_id]);
      await c.query(`insert into professor_disciplinas (professor_id, disciplina_id)
                     select distinct professor_id, $1::int from horarios where turma_id=$2 and disciplina_id=$1::int`, [nova.id, t3b.id]);
      // a Espanhola facultativa sai do professor que so a tinha por causa do 3oB
      await c.query(`delete from professor_disciplinas pd where pd.disciplina_id=$1
                       and pd.professor_id in (select professor_id from horarios where turma_id=$2 and disciplina_id=$3)
                       and not exists (select 1 from horarios h where h.professor_id=pd.professor_id and h.disciplina_id=$1)`, [espI.disc_id, t3b.id, nova.id]);
      log(`${ESP_I.nome} criada (#${nova.id}) e ligada ao ${ESP_I.turma}.`);
      await c.query("COMMIT");
    } catch (e) { await c.query("ROLLBACK"); throw e; }
    log("GRAVADO.");
  } catch (e) {
    log("ERRO: " + (e?.message ?? e)); process.exitCode = 1;
  } finally {
    await c.end();
    const arq = path.join(__dirname, "_arquivo", "completar-rco-andreatta.txt");
    fs.mkdirSync(path.dirname(arq), { recursive: true });
    fs.writeFileSync(arq, linhas.join("\r\n"), "utf8");
    console.log(`\nRelatorio completo: ${arq}`);
  }
})();
