/**
 * [DEMO-MATRIZES] (31/10/2026) Escola Demonstracao: cursos e matrizes do catalogo, turmas ligadas a matriz e
 * codigo da Recomposicao de LP no Fundamental. Nao mexe na grade, a nao ser na troca da Recomposicao de LP.
 *  1) Oferta pelo catalogo (mesma funcao da tela): Ensino Medio 2026 (2 itinerarios) e Tecnico em
 *     Administracao integrado; o Medio 2025 diurno e o "Tecnico em Administracao" antigo (sem matriz)
 *     deixam de ser ofertados (nao sao apagados).
 *  2) Cada turma e ligada a matriz da sua serie que mais combina com as disciplinas que ela ja tem
 *     (minimo 80%); turma sem matriz parecida fica sem ligacao e aparece no relatorio.
 *  3) 6o ao 9o ano: "Recomposicao da Aprendizagem em Lingua Portuguesa" (RCO 6038, do Medio) vira
 *     "Leitura e Recomposicao da Aprendizagem em Lingua Portuguesa" (RCO 6299, do Fundamental), nos
 *     vinculos e nas aulas.
 *  4) So relatorio: disciplinas em uso sem codigo do RCO e turmas sem codigo SERE (nao inventa codigo).
 * Uso (na raiz do repositorio):
 *   pnpm --filter @workspace/api-server exec tsx scripts/ajustar-escola-demonstracao.ts            (dry-run)
 *   pnpm --filter @workspace/api-server exec tsx scripts/ajustar-escola-demonstracao.ts --aplicar  (backup + grava)
 * Relatorio em lib/db/_arquivo/ajustar-escola-demonstracao.txt
 */
import fs from "node:fs";
import path from "node:path";

const APLICAR = process.argv.includes("--aplicar");
const ESCOLA = "esc_1ce4d2d30c4146a99fb7ffa5";
const RAIZ = path.resolve(process.cwd(), "..", "..");
const OFERTAR = [
  "Ensino Médio 2026 - Tempo Parcial Diurno - Itinerário Linguagens e Ciências Humanas",
  "Ensino Médio 2026 - Tempo Parcial Diurno - Itinerário Matemática e Ciências da Natureza",
  "Técnico em Administração Integrado ao Ensino Médio",
];
const DEIXAR_DE_OFERTAR = [
  "Ensino Médio - Tempo Parcial Diurno - Itinerário Linguagens e Ciências Humanas",
  "Ensino Médio - Tempo Parcial Diurno - Itinerário Matemática e Ciências da Natureza",
  "Técnico em Administração",
];
const MINIMO = 0.8;

const linhas: string[] = [];
const log = (s = "") => { linhas.push(s); console.log(s); };
const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const chaveNome = (s: string) => semAcento(String(s ?? "")).toLowerCase().replace(/\s+/g, " ").trim();

function carregarDatabaseUrl() {
  if (process.env.DATABASE_URL) return;
  const linha = fs.readFileSync(path.join(RAIZ, "lib", "db", ".env"), "utf8").split(/\r?\n/).find((l) => l.trim().startsWith("DATABASE_URL="))!;
  process.env.DATABASE_URL = linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

/** serie da turma pelo nome: "6A" -> "6º Ano"; "1C TEC" -> "1ª Série" */
function serieDaTurma(nome: string, nivel: string | null): string | null {
  const n = Number(nome.trim()[0]);
  if (!n) return null;
  return n >= 6 || nivel === "fundamental" ? `${n}º Ano` : `${n}ª Série`;
}

async function main() {
  carregarDatabaseUrl();
  const { pool } = await import("@workspace/db");
  const { semearCatalogoEscola, listarModelosCatalogo } = await import("../src/lib/semear-catalogo");
  const { padronizarNomeDisciplina } = await import("../src/lib/padronizar-nome-disciplina");
  const nomeDisc = (n: string) => chaveNome(padronizarNomeDisciplina(n));
  const c = await pool.connect();
  const q = async <T = any>(sql: string, p: unknown[] = []) => (await c.query(sql, p)).rows as T[];
  try {
    log(APLICAR ? "MODO: APLICAR\n" : "MODO: DRY-RUN (nada sera alterado)\n");
    const [esc] = await q("select nome_fantasia from escolas where id=$1", [ESCOLA]);
    if (!esc) throw new Error("escola nao encontrada");
    log(`Escola: ${esc.nome_fantasia} (${ESCOLA})`);

    // 1) cursos
    const modelos = listarModelosCatalogo().filter((m) => OFERTAR.some((o) => chaveNome(o) === chaveNome(m.nome)));
    const faltaModelo = OFERTAR.filter((o) => !modelos.some((m) => chaveNome(m.nome) === chaveNome(o)));
    if (faltaModelo.length) throw new Error(`fora do catalogo: ${faltaModelo.join(", ")}`);
    const cursos = await q("select id, nome, ofertado from cursos where escola_id=$1", [ESCOLA]);
    log(`== 1) Cursos`);
    for (const m of modelos) {
      const ja = cursos.find((x) => chaveNome(x.nome) === chaveNome(m.nome));
      log(`  ${ja ? `ja existe (#${ja.id}${ja.ofertado ? "" : ", passa a ofertado"})` : "vai criar"}: ${m.nome} (${m.series.join(", ")})`);
    }
    const sair = cursos.filter((x) => x.ofertado && DEIXAR_DE_OFERTAR.some((o) => chaveNome(o) === chaveNome(x.nome)));
    for (const x of sair) log(`  deixa de ser ofertado: #${x.id} ${x.nome}`);

    // estado depois do passo 1 (dry-run: matrizes do catalogo para os cursos que ainda nao existem)
    const { MATRIZES_OFICIAIS_SEED_PR } = await import("../src/lib/matrizes-oficiais-seed-pr");
    const { MATRIZES_TECNICAS_SEED_PR_2026 } = await import("../src/lib/matrizes-tecnicas-seed-pr");
    const itensModelo = (nome: string, serie: string): string[] => {
      const g = MATRIZES_OFICIAIS_SEED_PR.find((m) => chaveNome(m.label) === chaveNome(nome));
      const t = (MATRIZES_TECNICAS_SEED_PR_2026 as any[]).find((x) => chaveNome(nome).startsWith(chaveNome(x.curso)) && x.formaOferta === "integrada");
      const s = (g?.series ?? t?.series ?? []).find((x: any) => chaveNome(x.serieAno) === chaveNome(serie));
      return (s?.itens ?? []).map((i: any) => nomeDisc(i.nome));
    };
    const ofertadosDepois = [
      ...cursos.filter((x) => x.ofertado && !sair.some((s) => s.id === x.id)).map((x) => x.nome),
      ...modelos.map((m) => m.nome),
    ].filter((v, i, a) => a.findIndex((y) => chaveNome(y) === chaveNome(v)) === i);
    const matrizesSalvas = await q(
      `select m.id, m.serie_ano, cu.nome curso, d.nome disc from matrizes_curriculares m join cursos cu on cu.id=m.curso_id
         left join itens_matriz i on i.matriz_curricular_id=m.id left join disciplinas d on d.id=i.disciplina_id where m.escola_id=$1`, [ESCOLA]);
    const opcoes = (serie: string) => ofertadosDepois.map((curso) => {
      const salvas = matrizesSalvas.filter((m) => chaveNome(m.curso) === chaveNome(curso) && chaveNome(m.serie_ano) === chaveNome(serie));
      const itens = salvas.length ? salvas.filter((m) => m.disc).map((m) => nomeDisc(m.disc)) : itensModelo(curso, serie);
      return { curso, itens: new Set(itens) };
    }).filter((o) => o.itens.size > 0);

    // 2) turmas x matriz
    const turmas = await q("select id, nome, turno, nivel_ensino, matriz_curricular_id, codigo_sere from turmas where escola_id=$1 and not coalesce(fantasma,false) order by nome", [ESCOLA]);
    const vinc = await q("select td.turma_id, d.nome from turma_disciplinas td join disciplinas d on d.id=td.disciplina_id join turmas t on t.id=td.turma_id where t.escola_id=$1", [ESCOLA]);
    log(`\n== 2) Turmas ligadas a matriz (minimo ${MINIMO * 100}% das disciplinas da turma na matriz)`);
    const ligar: Array<{ turma: any; curso: string; serie: string }> = [];
    for (const t of turmas) {
      const serie = serieDaTurma(t.nome, t.nivel_ensino);
      const discs = vinc.filter((v) => v.turma_id === t.id).map((v) => nomeDisc(v.nome));
      const melhor = (serie ? opcoes(serie) : []).map((o) => ({ ...o, pct: discs.filter((d) => o.itens.has(d)).length / Math.max(1, discs.length) }))
        .sort((a, b) => b.pct - a.pct)[0];
      if (melhor && melhor.pct >= MINIMO) {
        const fora = discs.filter((d) => !melhor.itens.has(d));
        log(`  ${t.nome.padEnd(7)} -> ${melhor.curso} ${serie} (${Math.round(melhor.pct * 100)}%)${fora.length ? ` | fora da matriz: ${fora.join(", ")}` : ""}`);
        ligar.push({ turma: t, curso: melhor.curso, serie: serie! });
      } else {
        log(`  ${t.nome.padEnd(7)} SEM MATRIZ PARECIDA${melhor ? ` (melhor: ${melhor.curso} ${serie}, ${Math.round(melhor.pct * 100)}%)` : ""}`);
      }
    }

    // 3) Recomposicao de LP no Fundamental
    const discs = await q("select id, nome, codigo_externo_rco cod from disciplinas where escola_id=$1", [ESCOLA]);
    const de = discs.filter((d) => Number(d.cod) === 6038);
    const para = discs.filter((d) => Number(d.cod) === 6299);
    const fund = turmas.filter((t) => t.nivel_ensino === "fundamental").map((t) => t.id);
    log(`\n== 3) Recomposicao de LP no Fundamental (6038 -> 6299)`);
    let nVinc = 0, nAulas = 0;
    if (de.length === 1 && para.length === 1 && fund.length) {
      nVinc = (await q("select count(*)::int n from turma_disciplinas where disciplina_id=$1 and turma_id = any($2)", [de[0].id, fund]))[0].n;
      nAulas = (await q("select count(*)::int n from horarios where disciplina_id=$1 and turma_id = any($2)", [de[0].id, fund]))[0].n;
      log(`  #${de[0].id} ${de[0].nome} -> #${para[0].id} ${para[0].nome}: ${nVinc} vinculo(s) e ${nAulas} aula(s) em turmas do Fundamental`);
    } else log(`  nada a fazer (disciplinas 6038: ${de.length}, 6299: ${para.length})`);

    // 3b) quem da a Recomposicao de LP do Fundamental precisa estar habilitado na disciplina nova (6299)
    const habilitar = para.length !== 1 ? [] : await q(
      `select distinct h.professor_id, p.nome from horarios h join professores p on p.id=h.professor_id
        where h.turma_id = any($1) and h.disciplina_id = any($2)
          and not exists (select 1 from professor_disciplinas pd where pd.professor_id=h.professor_id and pd.disciplina_id=$3)`,
      [fund, [para[0].id, ...de.map((d) => d.id)], para[0].id]);
    log(`\n== 3b) Habilitar em "${para[0]?.nome ?? "-"}": ${habilitar.map((x) => x.nome).join(", ") || "ninguem"}`);

    // 3c) SAE vazio: o que as outras escolas usam para a MESMA disciplina (so se todas concordam)
    const semSae = await q("select id, nome from disciplinas where escola_id=$1 and codigo_sae is null", [ESCOLA]);
    const outras = await q("select nome, codigo_sae from disciplinas where escola_id<>$1 and codigo_sae is not null", [ESCOLA]);
    const saePorNome = new Map<string, Set<string>>();
    for (const o of outras) saePorNome.set(nomeDisc(o.nome), (saePorNome.get(nomeDisc(o.nome)) ?? new Set()).add(String(o.codigo_sae)));
    const sae = semSae.map((d) => ({ d, s: [...(saePorNome.get(nomeDisc(d.nome)) ?? [])] })).filter((x) => x.s.length === 1);
    log(`\n== 3c) SAE pelo que as outras escolas usam (${sae.length})`);
    for (const x of sae) log(`  #${x.d.id} ${x.d.nome}: SAE ${x.s[0]}`);

    // 4) relatorio de codigos
    const emUso = await q(
      `select distinct d.nome from turma_disciplinas td join disciplinas d on d.id=td.disciplina_id join turmas t on t.id=td.turma_id
        where t.escola_id=$1 and d.codigo_externo_rco is null order by d.nome`, [ESCOLA]);
    log(`\n== 4) Sem codigo (so relatorio)`);
    log(`  disciplinas em uso sem codigo do RCO (${emUso.length}): ${emUso.map((d) => d.nome).join(", ") || "-"}`);
    log(`  turmas sem codigo SERE: ${turmas.filter((t) => !t.codigo_sere).length} de ${turmas.length}`);

    if (!APLICAR) { log("\nDRY-RUN: nada foi alterado. Rode com --aplicar."); return; }

    const backup = {
      cursos, turmas, turmaDisciplinas: await q("select td.* from turma_disciplinas td join turmas t on t.id=td.turma_id where t.escola_id=$1", [ESCOLA]),
      aulasRecomposicao: de.length ? await q("select * from horarios where disciplina_id=$1", [de[0].id]) : [],
    };
    const arqBk = path.join(RAIZ, "lib", "db", "_arquivo", `backup-escola-demonstracao-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.mkdirSync(path.dirname(arqBk), { recursive: true });
    fs.writeFileSync(arqBk, JSON.stringify(backup, null, 1));
    log(`\nBackup: ${arqBk}`);

    const r = await semearCatalogoEscola(ESCOLA, { chaves: modelos.map((m) => m.chave), ofertar: true });
    log(`Catalogo: ${r.cursosCriados} curso(s) criado(s), ${r.cursosReaproveitados} reaproveitado(s), ${r.matrizesCriadas} matriz(es), ${r.disciplinasCriadas} disciplina(s) nova(s)`);

    await c.query("BEGIN");
    try {
      for (const x of sair) await c.query("update cursos set ofertado=false where id=$1 and escola_id=$2", [x.id, ESCOLA]);
      const matrizes = await q("select m.id, m.serie_ano, cu.nome curso from matrizes_curriculares m join cursos cu on cu.id=m.curso_id where m.escola_id=$1", [ESCOLA]);
      for (const l of ligar) {
        const m = matrizes.find((x) => chaveNome(x.curso) === chaveNome(l.curso) && chaveNome(x.serie_ano) === chaveNome(l.serie));
        if (!m) throw new Error(`matriz ${l.curso} ${l.serie} nao encontrada`);
        await c.query("update turmas set matriz_curricular_id=$1 where id=$2", [m.id, l.turma.id]);
      }
      if (nVinc || nAulas) {
        await c.query("update turma_disciplinas set disciplina_id=$1 where disciplina_id=$2 and turma_id = any($3)", [para[0].id, de[0].id, fund]);
        await c.query("update horarios set disciplina_id=$1 where disciplina_id=$2 and turma_id = any($3)", [para[0].id, de[0].id, fund]);
      }
      for (const x of habilitar) await c.query("insert into professor_disciplinas (professor_id, disciplina_id) values ($1,$2)", [x.professor_id, para[0].id]);
      for (const x of sae) await c.query("update disciplinas set codigo_sae=$1 where id=$2 and codigo_sae is null", [x.s[0], x.d.id]);
      await c.query("COMMIT");
    } catch (e) { await c.query("ROLLBACK"); throw e; }
    log("\nGRAVADO. Confira com: node C:\\projetos\\nexgrade-app\\lib\\db\\ver-cadastro-escola.cjs \"demonstra\"");
  } catch (e: any) {
    log("ERRO: " + (e?.message ?? e)); process.exitCode = 1;
  } finally {
    c.release();
    await pool.end();
    const arq = path.join(RAIZ, "lib", "db", "_arquivo", "ajustar-escola-demonstracao.txt");
    fs.mkdirSync(path.dirname(arq), { recursive: true });
    fs.writeFileSync(arq, linhas.join("\r\n"), "utf8");
    console.log(`\nRelatorio completo: ${arq}`);
  }
}
main();
