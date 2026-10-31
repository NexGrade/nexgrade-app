/**
 * [MB-MATRIZES] (31/10/2026) Matrizes do Mario Braga que nao batiam com as turmas (achado na copia para a
 * Escola Demonstracao). Mexe SO em itens_matriz; nenhuma aula, vinculo ou professor muda.
 *  1) Tecnico em Administracao 1a e 2a serie: item que apontava para a disciplina apagada (#1650, a antiga
 *     Estrategias de Marketing) passa para a Estrategias de Marketing de hoje, com 2 aulas (catalogo e grade).
 *  2) Tecnico em Administracao 1a serie: Informatica Empresarial, Financas Empresariais, Principios de
 *     Administracao e Recursos Humanos de 1 para 2 aulas (catalogo 2511, vinculo e grade ja tem 2).
 *  3) Fundamental 6o e 9o ano: "Recomposicao da Aprendizagem em Lingua Portuguesa" (RCO 6038, do Medio) vira
 *     "Leitura e Recomposicao da Aprendizagem em Lingua Portuguesa" (RCO 6299), a que as turmas usam.
 *  4) Tecnico em Administracao 3a serie: "Lideranca Organizacional e Gestao de Pessoas" vira "Lideranca e
 *     Gestao de Pessoas" (RCO 3979), a da grade da 3MA ADM (4 aulas).
 *  5) Medio Noturno Linguagens 3a serie: "Lingua Inglesa" (2) vira "Lingua Inglesa I" (3), a da grade da 3NC.
 * Vale para o Mario Braga e para a Escola Demonstracao (copia dele): acha matriz e disciplina pelo NOME, em
 * cada escola, so entre as matrizes que tem turma.
 * Dry-run faz tudo numa transacao e desfaz no fim (ROLLBACK). --aplicar grava backup e confirma.
 * Uso (na raiz do repositorio):
 *   pnpm --filter @workspace/api-server exec tsx scripts/corrigir-matrizes-mario-braga.ts            (dry-run)
 *   pnpm --filter @workspace/api-server exec tsx scripts/corrigir-matrizes-mario-braga.ts --aplicar  (backup + grava)
 * Relatorio em lib/db/_arquivo/corrigir-matrizes-mario-braga.txt
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

const ADM = "Técnico em Administração";
const FUND = "Ensino Fundamental - Anos Finais - Tempo Parcial Diurno";
const NOT_LCH = "Ensino Médio - Tempo Parcial Noturno - Itinerário Linguagens e Ciências Humanas";
const REC_LP_MEDIO = "Recomposição da Aprendizagem em Língua Portuguesa";
const REC_LP_FUND = "Leitura e Recomposição da Aprendizagem em Língua Portuguesa";

type Op =
  | { tipo: "garantir"; curso: string; serie: string; disciplina: string; carga: number }
  | { tipo: "trocar"; curso: string; serie: string; de: string; para: string; carga?: number };
const OPS: Op[] = [
  { tipo: "garantir", curso: ADM, serie: "1ª Série", disciplina: "Estratégias de Marketing", carga: 2 },
  { tipo: "garantir", curso: ADM, serie: "2ª Série", disciplina: "Estratégias de Marketing", carga: 2 },
  { tipo: "garantir", curso: ADM, serie: "1ª Série", disciplina: "Informática Empresarial", carga: 2 },
  { tipo: "garantir", curso: ADM, serie: "1ª Série", disciplina: "Finanças Empresariais", carga: 2 },
  { tipo: "garantir", curso: ADM, serie: "1ª Série", disciplina: "Princípios de Administração", carga: 2 },
  { tipo: "garantir", curso: ADM, serie: "1ª Série", disciplina: "Recursos Humanos", carga: 2 },
  { tipo: "trocar", curso: FUND, serie: "6º Ano", de: REC_LP_MEDIO, para: REC_LP_FUND },
  { tipo: "trocar", curso: FUND, serie: "9º Ano", de: REC_LP_MEDIO, para: REC_LP_FUND },
  { tipo: "trocar", curso: ADM, serie: "3ª Série", de: "Liderança Organizacional e Gestão de Pessoas", para: "Liderança e Gestão de Pessoas" },
  { tipo: "trocar", curso: NOT_LCH, serie: "3ª Série", de: "Língua Inglesa", para: "Língua Inglesa I", carga: 3 },
];

const linhas: string[] = [];
const log = (s = "") => { linhas.push(s); console.log(s); };
const chave = (s: string) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

function carregarDatabaseUrl() {
  if (process.env.DATABASE_URL) return;
  const linha = fs.readFileSync(path.join(RAIZ, "lib", "db", ".env"), "utf8").split(/\r?\n/).find((l) => l.trim().startsWith("DATABASE_URL="))!;
  process.env.DATABASE_URL = linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

/** Vinculos fora da matriz e itens obrigatorios sem vinculo (o que o script deve zerar), por turma. */
async function pendencias(c: PoolClient, escola: string) {
  const fora = (await c.query(`select tu.nome turma, d.nome disciplina from turma_disciplinas td join turmas tu on tu.id=td.turma_id
    join disciplinas d on d.id=td.disciplina_id where tu.escola_id=$1 and tu.matriz_curricular_id is not null and td.grupo_trio is null
    and not exists (select 1 from itens_matriz i where i.matriz_curricular_id=tu.matriz_curricular_id and i.disciplina_id=td.disciplina_id)
    order by 1, 2`, [escola])).rows;
  const semVinculo = (await c.query(`select tu.nome turma, coalesce(d.nome, '(disciplina apagada #' || i.disciplina_id || ')') disciplina
    from turmas tu join itens_matriz i on i.matriz_curricular_id=tu.matriz_curricular_id left join disciplinas d on d.id=i.disciplina_id
    where tu.escola_id=$1 and coalesce(tu.fantasma,false)=false and i.obrigatoria and i.grupo_disciplina is null
    and not exists (select 1 from turma_disciplinas td where td.turma_id=tu.id and td.disciplina_id=i.disciplina_id)
    order by 1, 2`, [escola])).rows;
  const cargaDiferente = (await c.query(`select tu.nome turma, d.nome disciplina, i.carga_horaria_semanal matriz, td.carga_horaria_semanal_override vinculo
    from turma_disciplinas td join turmas tu on tu.id=td.turma_id join disciplinas d on d.id=td.disciplina_id
    join itens_matriz i on i.matriz_curricular_id=tu.matriz_curricular_id and i.disciplina_id=td.disciplina_id
    where tu.escola_id=$1 and td.carga_horaria_semanal_override is not null and td.carga_horaria_semanal_override<>i.carga_horaria_semanal
    order by 1, 2`, [escola])).rows;
  return { fora, semVinculo, cargaDiferente };
}

function mostrar(t: string, rows: any[]) {
  log(`  ${t}: ${rows.length}`);
  for (const r of rows) log(`    ${Object.values(r).join(" | ")}`);
}

async function main() {
  carregarDatabaseUrl();
  const { pool } = await import("@workspace/db");
  const c: PoolClient = await pool.connect();
  const q = async <T = any>(sql: string, p: unknown[] = []) => (await c.query(sql, p)).rows as T[];
  try {
    log(APLICAR ? "MODO: APLICAR\n" : "MODO: DRY-RUN (faz e desfaz no fim; nada fica gravado)\n");
    const backup: Record<string, any[]> = {};
    const antes: Record<string, Awaited<ReturnType<typeof pendencias>>> = {};
    for (const e of ESCOLAS) {
      backup[e.id] = await q(`select i.* from itens_matriz i join matrizes_curriculares m on m.id=i.matriz_curricular_id where m.escola_id=$1 order by i.id`, [e.id]);
      antes[e.id] = await pendencias(c, e.id);
    }
    if (APLICAR) {
      const arqBk = path.join(RAIZ, "lib", "db", "_arquivo", `backup-itens-matriz-mb-demo-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
      fs.mkdirSync(path.dirname(arqBk), { recursive: true });
      fs.writeFileSync(arqBk, JSON.stringify(backup, null, 1));
      log(`Backup dos itens de matriz: ${arqBk}\n`);
    }

    await c.query("BEGIN");
    try {
      for (const e of ESCOLAS) {
        log(`==================== ${e.rotulo} (${e.id})`);
        const disc = await q<{ id: number; nome: string }>("select id, nome from disciplinas where escola_id=$1", [e.id]);
        const idDisc = (nome: string) => {
          const achou = disc.filter((d) => chave(d.nome) === chave(nome));
          if (achou.length !== 1) throw new Error(`${e.rotulo}: disciplina "${nome}" achada ${achou.length} vezes`);
          return achou[0].id;
        };
        const idsDisc = new Set(disc.map((d) => d.id));
        const matrizes = await q<{ id: number; curso: string; serie_ano: string; turmas: string }>(`select mc.id, cu.nome curso, mc.serie_ano,
          string_agg(tu.nome, ',' order by tu.nome) turmas from matrizes_curriculares mc join cursos cu on cu.id=mc.curso_id
          join turmas tu on tu.matriz_curricular_id=mc.id where mc.escola_id=$1 group by 1, 2, 3`, [e.id]);

        log("== Antes");
        mostrar("vinculo fora da matriz (sem trios)", antes[e.id].fora);
        mostrar("item obrigatorio da matriz sem vinculo", antes[e.id].semVinculo);
        mostrar("carga do vinculo diferente da matriz", antes[e.id].cargaDiferente);
        log("== Correcoes");
        for (const op of OPS) {
          const ms = matrizes.filter((m) => chave(m.curso) === chave(op.curso) && chave(m.serie_ano) === chave(op.serie));
          if (ms.length !== 1) { log(`  [PULOU] ${op.curso} | ${op.serie}: ${ms.length} matriz(es) com turma`); continue; }
          const m = ms[0];
          const itens = await q<{ id: number; disciplina_id: number; carga_horaria_semanal: number; categoria_curricular: string }>(
            "select id, disciplina_id, carga_horaria_semanal, categoria_curricular from itens_matriz where matriz_curricular_id=$1", [m.id]);
          const onde = `matriz #${m.id} ${op.curso} | ${op.serie} (${m.turmas})`;
          if (op.tipo === "garantir") {
            const alvo = idDisc(op.disciplina);
            const ja = itens.find((i) => i.disciplina_id === alvo);
            const orfao = itens.find((i) => !idsDisc.has(i.disciplina_id));
            if (ja) {
              if (ja.carga_horaria_semanal === op.carga) { log(`  [OK] ${onde}: ${op.disciplina} ja com ${op.carga}`); continue; }
              await c.query("update itens_matriz set carga_horaria_semanal=$1 where id=$2", [op.carga, ja.id]);
              log(`  ${onde}: ${op.disciplina} ${ja.carga_horaria_semanal} -> ${op.carga} aula(s)`);
            } else if (orfao) {
              await c.query("update itens_matriz set disciplina_id=$1, carga_horaria_semanal=$2 where id=$3", [alvo, op.carga, orfao.id]);
              log(`  ${onde}: item #${orfao.id} (disciplina apagada #${orfao.disciplina_id}, ${orfao.carga_horaria_semanal}) -> ${op.disciplina} com ${op.carga}`);
            } else {
              const categoria = itens[0]?.categoria_curricular ?? "FGB";
              await c.query(`insert into itens_matriz (matriz_curricular_id, disciplina_id, categoria_curricular, carga_horaria_semanal, eh_padrao_do_grupo, obrigatoria)
                values ($1, $2, $3, $4, false, true)`, [m.id, alvo, categoria, op.carga]);
              log(`  ${onde}: incluido ${op.disciplina} com ${op.carga} (${categoria})`);
            }
          } else {
            const de = idDisc(op.de), para = idDisc(op.para);
            const itemDe = itens.find((i) => i.disciplina_id === de);
            const itemPara = itens.find((i) => i.disciplina_id === para);
            if (!itemDe && itemPara) { log(`  [OK] ${onde}: ja tem ${op.para}`); continue; }
            if (!itemDe) { log(`  [PULOU] ${onde}: nao tem ${op.de}`); continue; }
            if (itemPara) throw new Error(`${onde}: tem ${op.de} e ${op.para} ao mesmo tempo; conferir a mao`);
            const carga = op.carga ?? itemDe.carga_horaria_semanal;
            await c.query("update itens_matriz set disciplina_id=$1, carga_horaria_semanal=$2 where id=$3", [para, carga, itemDe.id]);
            log(`  ${onde}: ${op.de} (${itemDe.carga_horaria_semanal}) -> ${op.para} (${carga})`);
          }
        }
        const depois = await pendencias(c, e.id);
        log("== Depois");
        mostrar("vinculo fora da matriz (sem trios)", depois.fora);
        mostrar("item obrigatorio da matriz sem vinculo", depois.semVinculo);
        mostrar("carga do vinculo diferente da matriz", depois.cargaDiferente);
        const [aulas] = await q("select count(*)::int n from horarios where escola_id=$1", [e.id]);
        log(`  aulas na grade: ${aulas.n} (nao muda)\n`);
      }
      if (APLICAR) { await c.query("COMMIT"); log("GRAVADO."); }
      else { await c.query("ROLLBACK"); log("DRY-RUN: NADA FOI GRAVADO."); }
    } catch (err) { await c.query("ROLLBACK"); throw err; }
  } finally {
    c.release();
    await pool.end();
    const arq = path.join(RAIZ, "lib", "db", "_arquivo", "corrigir-matrizes-mario-braga.txt");
    fs.mkdirSync(path.dirname(arq), { recursive: true });
    fs.writeFileSync(arq, linhas.join("\r\n"), "utf8");
    console.log(`\nRelatorio: ${arq}`);
  }
}

main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
