/**
 * [MB-MATRIZES-2026] (01/11/2026) Liga turmas do Mario Braga as matrizes que o RCO mostra para elas
 * (pendencia 10 da passagem de 31/10). Muda SO turmas.matriz_curricular_id: nenhuma aula, vinculo,
 * carga da turma ou professor muda.
 *  - Medio: 1MA EM, 2MA EM, 1NB, 2NB, 2NC, 3MA EM, 3NB, 3NC -> "Ensino Medio 2026 - Tempo Parcial Diurno"
 *    (o noturno usa os mesmos cursos SERE do diurno), no itinerario de cada uma (ver ALVOS).
 *  - Tecnico: 3MA ADM e 3MB DES -> 3a serie no formato do RCO (base 0016 + itinerario 1624/1623).
 * Os cursos que faltarem na escola entram pelo catalogo (mesma funcao da tela), ja ofertados.
 * Onde a matriz pesa: carga de disciplina sem carga propria na turma e, na exportacao do RCO, a categoria
 * (FGB/IFA) da disciplina que nao esta na grade SEED da turma.
 * Vale para o Mario Braga e para a Escola Demonstracao (copia dele). Acha turma, curso e matriz pelo NOME.
 * Dry-run so le e mostra o que mudaria. --aplicar grava backup, ativa os cursos e troca a matriz numa transacao.
 * Uso (na raiz do repositorio):
 *   pnpm --filter @workspace/api-server exec tsx scripts/ligar-matrizes-2026-mario-braga.ts            (dry-run)
 *   pnpm --filter @workspace/api-server exec tsx scripts/ligar-matrizes-2026-mario-braga.ts --aplicar  (backup + grava)
 * Relatorio em lib/db/_arquivo/ligar-matrizes-2026-mario-braga.txt
 */
import fs from "node:fs";
import path from "node:path";
import type { PoolClient } from "pg";

const APLICAR = process.argv.includes("--aplicar");
const ESCOLAS = [
  { id: "org_3HCMsuYeAwkggR1dxXNzEdzNaX8", rotulo: "Mario Braga" },
  { id: "esc_1ce4d2d30c4146a99fb7ffa5", rotulo: "Escola Demonstracao" },
];
const RAIZ = path.resolve(process.cwd(), "..", "..");

// Itinerario conferido pelas disciplinas de cada turma (dry-run de 01/11): a matriz antiga trocava dois —
// 2MA EM estava em Matematica com disciplinas de Linguagens, e 2NC em Linguagens com as de Matematica.
type Destino = "lggchs" | "matcnt" | "adm3" | "des3";
const ALVOS: Array<{ turma: string; destino: Destino }> = [
  { turma: "1MA EM", destino: "lggchs" },
  { turma: "2MA EM", destino: "lggchs" },
  { turma: "3MA EM", destino: "lggchs" },
  { turma: "1NB", destino: "lggchs" },
  { turma: "2NB", destino: "lggchs" },
  { turma: "2NC", destino: "matcnt" },
  { turma: "3NB", destino: "matcnt" },
  { turma: "3NC", destino: "lggchs" },
  { turma: "3MA ADM", destino: "adm3" },
  { turma: "3MB DES", destino: "des3" },
];

const linhas: string[] = [];
const log = (s = "") => { linhas.push(s); console.log(s); };
const chave = (s: string) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

function carregarDatabaseUrl() {
  if (process.env.DATABASE_URL) return;
  const linha = fs.readFileSync(path.join(RAIZ, "lib", "db", ".env"), "utf8").split(/\r?\n/).find((l) => l.trim().startsWith("DATABASE_URL="))!;
  process.env.DATABASE_URL = linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

type ItemModelo = { nome: string; cargaHorariaSemanal: number; obrigatoria?: boolean };
type Modelo = { chave: string; nome: string; series: Map<string, ItemModelo[]> };

async function main() {
  carregarDatabaseUrl();
  const { pool } = await import("@workspace/db");
  const { listarModelosCatalogo, semearCatalogoEscola } = await import("../src/lib/semear-catalogo");
  const { MATRIZES_OFICIAIS_SEED_PR } = await import("../src/lib/matrizes-oficiais-seed-pr");
  const { MATRIZES_TECNICAS_SEED_PR_2026 } = await import("../src/lib/matrizes-tecnicas-seed-pr");

  // modelos do catalogo: nome do curso na escola (igual ao da tela) + itens por serie
  const resumo = listarModelosCatalogo();
  const modelo = (achaResumo: RegExp, itensPorSerie: Array<{ serieAno: string; itens: ItemModelo[] }>): Modelo => {
    const r = resumo.filter((m) => achaResumo.test(m.nome));
    if (r.length !== 1) throw new Error(`catalogo: ${achaResumo} achado ${r.length} vezes`);
    return { chave: r[0].chave, nome: r[0].nome, series: new Map(itensPorSerie.map((s) => [chave(s.serieAno), s.itens])) };
  };
  const oficial = (id: string) => (MATRIZES_OFICIAIS_SEED_PR as any[]).find((m) => m.id === id)!;
  const tecnico = (codigo: string) => (MATRIZES_TECNICAS_SEED_PR_2026 as any[]).find((t) => t.codigo === codigo && /3ª Série \(RCO/.test(t.curso))!;
  const MODELOS: Record<Destino, Modelo> = {
    lggchs: modelo(/^Ensino Médio 2026 - Tempo Parcial Diurno - Itinerário Linguagens/, oficial("medio_2026_tempo_parcial_diurno_lggchs").series),
    matcnt: modelo(/^Ensino Médio 2026 - Tempo Parcial Diurno - Itinerário Matemática/, oficial("medio_2026_tempo_parcial_diurno_matcnt").series),
    adm3: modelo(/3ª Série \(RCO 0016 \+ 1624\)/, tecnico("1624").series),
    des3: modelo(/3ª Série \(RCO 0016 \+ 1623\)/, tecnico("1623").series),
  };

  const c: PoolClient = await pool.connect();
  const q = async <T = any>(sql: string, p: unknown[] = []) => (await c.query(sql, p)).rows as T[];
  try {
    log(APLICAR ? "MODO: APLICAR\n" : "MODO: DRY-RUN (so leitura; nada e gravado)\n");

    // 1) planejar, escola por escola
    type Plano = { turmaId: number; turma: string; serie: string; de: string; modelo: Modelo };
    const planos = new Map<string, Plano[]>();
    for (const e of ESCOLAS) {
      log(`==================== ${e.rotulo} (${e.id})`);
      const [esc] = await q("select nome_fantasia from escolas where id=$1", [e.id]);
      if (!esc) { log("  escola nao encontrada; pulada\n"); continue; }
      const turmas = await q<{ id: number; nome: string; serie: string; curso: string | null; serie_ano: string | null; matriz_id: number | null }>(`
        select tu.id, tu.nome, tu.serie, cu.nome curso, mc.serie_ano, mc.id matriz_id from turmas tu
        left join matrizes_curriculares mc on mc.id=tu.matriz_curricular_id left join cursos cu on cu.id=mc.curso_id
        where tu.escola_id=$1 and coalesce(tu.fantasma,false)=false`, [e.id]);
      const lista: Plano[] = [];
      for (const a of ALVOS) {
        const t = turmas.filter((x) => chave(x.nome) === chave(a.turma));
        if (t.length !== 1) { log(`  [PULOU] ${a.turma}: turma achada ${t.length} vez(es)`); continue; }
        const tu = t[0];
        const de = tu.curso ? `${tu.curso} | ${tu.serie_ano} (#${tu.matriz_id})` : "(sem matriz)";
        const n = /^(\d)/.exec(tu.nome)?.[1];
        const serie = `${n}ª Série`;
        const m = MODELOS[a.destino];
        if (!n || !m.series.has(chave(serie))) { log(`  [PULOU] ${tu.nome}: serie "${serie}" nao existe em ${m.nome}`); continue; }
        if (chave(tu.serie) !== chave(serie)) log(`  aviso: ${tu.nome} tem serie "${tu.serie}" no cadastro; usada a do nome (${serie})`);
        lista.push({ turmaId: tu.id, turma: tu.nome, serie, de, modelo: m });
      }
      planos.set(e.id, lista);

      // 2) o que muda e como a turma fica perto da matriz nova (pelo nome da disciplina)
      const cursos = await q<{ nome: string; ofertado: boolean }>("select nome, ofertado from cursos where escola_id=$1", [e.id]);
      for (const m of new Set(lista.map((p) => p.modelo))) {
        const ja = cursos.find((x) => chave(x.nome) === chave(m.nome));
        log(`  curso ${m.nome}: ${ja ? (ja.ofertado ? "ja existe" : "ja existe, passa a ofertado") : "vai entrar pelo catalogo"}`);
      }
      for (const p of lista) {
        log(`\n  ${p.turma}: ${p.de}\n    -> ${p.modelo.nome} | ${p.serie}`);
        const vinculos = await q<{ nome: string; carga: number | null; aulas: number }>(`
          select d.nome, td.carga_horaria_semanal_override carga,
            (select count(*)::int from horarios h where h.turma_id=td.turma_id and h.disciplina_id=td.disciplina_id
              and coalesce(h.versao_grade,'oficial')='oficial') aulas
          from turma_disciplinas td join disciplinas d on d.id=td.disciplina_id where td.turma_id=$1 order by d.nome`, [p.turmaId]);
        const itens = p.modelo.series.get(chave(p.serie))!;
        const fora = vinculos.filter((v) => !itens.some((i) => chave(i.nome) === chave(v.nome)));
        const falta = itens.filter((i) => i.obrigatoria !== false && !vinculos.some((v) => chave(v.nome) === chave(i.nome)));
        const carga = vinculos.flatMap((v) => {
          const i = itens.find((x) => chave(x.nome) === chave(v.nome));
          const naTurma = v.carga ?? v.aulas;
          return i && naTurma !== i.cargaHorariaSemanal ? [`${v.nome}: turma ${naTurma} (grade ${v.aulas}), matriz ${i.cargaHorariaSemanal}`] : [];
        });
        log(`    na turma e fora da matriz nova: ${fora.length ? fora.map((v) => `${v.nome} (${v.aulas} aula(s))`).join("; ") : "nenhuma"}`);
        log(`    na matriz nova e sem vinculo na turma: ${falta.length ? falta.map((i) => `${i.nome} (${i.cargaHorariaSemanal})`).join("; ") : "nenhuma"}`);
        log(`    carga diferente: ${carga.length ? carga.join("; ") : "nenhuma"}`);
      }
      log("");
    }

    const total = [...planos.values()].reduce((s, l) => s + l.length, 0);
    log(`Turmas a ligar: ${total}. Aulas, vinculos, cargas da turma e professores NAO mudam.`);
    if (!APLICAR) { log("\nDRY-RUN: NADA FOI GRAVADO. Rode com --aplicar."); return; }
    if (total === 0) { log("Nada a gravar."); return; }

    // 3) aplicar: backup, cursos pelo catalogo (fora da transacao, como na tela) e a troca de matriz
    const backup: Record<string, any> = {};
    for (const e of ESCOLAS) backup[e.id] = {
      turmas: await q("select id, nome, matriz_curricular_id from turmas where escola_id=$1 order by id", [e.id]),
      cursos: await q("select id, nome, ofertado from cursos where escola_id=$1 order by id", [e.id]),
    };
    const arqBk = path.join(RAIZ, "lib", "db", "_arquivo", `backup-matrizes-2026-mb-demo-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.mkdirSync(path.dirname(arqBk), { recursive: true });
    fs.writeFileSync(arqBk, JSON.stringify(backup, null, 1));
    log(`\nBackup (matriz de cada turma e cursos): ${arqBk}`);

    for (const [escolaId, lista] of planos) {
      if (!lista.length) continue;
      const r = await semearCatalogoEscola(escolaId, { chaves: [...new Set(lista.map((p) => p.modelo.chave))], ofertar: true });
      log(`${escolaId}: catalogo ${r.cursosCriados} curso(s) criado(s), ${r.matrizesCriadas} matriz(es), ${r.disciplinasCriadas} disciplina(s) nova(s)`);
    }
    await c.query("BEGIN");
    try {
      for (const [escolaId, lista] of planos) {
        const matrizes = await q<{ id: number; curso: string; serie_ano: string }>(`select mc.id, cu.nome curso, mc.serie_ano
          from matrizes_curriculares mc join cursos cu on cu.id=mc.curso_id where mc.escola_id=$1`, [escolaId]);
        for (const p of lista) {
          const ms = matrizes.filter((m) => chave(m.curso) === chave(p.modelo.nome) && chave(m.serie_ano) === chave(p.serie));
          if (ms.length !== 1) throw new Error(`${escolaId} ${p.turma}: matriz ${p.modelo.nome} | ${p.serie} achada ${ms.length} vez(es)`);
          await c.query("update turmas set matriz_curricular_id=$1 where id=$2 and escola_id=$3", [ms[0].id, p.turmaId, escolaId]);
          log(`  ${p.turma} -> matriz #${ms[0].id}`);
        }
      }
      await c.query("COMMIT");
      log("GRAVADO.");
    } catch (err) { await c.query("ROLLBACK"); throw err; }
  } finally {
    c.release();
    await pool.end();
    const arq = path.join(RAIZ, "lib", "db", "_arquivo", "ligar-matrizes-2026-mario-braga.txt");
    fs.mkdirSync(path.dirname(arq), { recursive: true });
    fs.writeFileSync(arq, linhas.join("\r\n"), "utf8");
    console.log(`\nRelatorio: ${arq}`);
  }
}

main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
