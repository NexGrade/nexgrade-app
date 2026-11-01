/**
 * [SIMULACOES] (01/11/2026) Copia UMA escola do banco real para o banco LOCAL de teste, para simular geracao de
 * grade, experimento e promocao sem tocar no real. Padrao: Escola Demonstracao (professores de nome ficticio).
 *  - O banco real e aberto em transacao READ ONLY: o script nao consegue gravar nada nele.
 *  - O destino tem que ser localhost (recusa qualquer outro endereco). Antes de copiar, apaga do destino o que
 *    ja houver dessa escola; tabelas gerais (planos, catalogo de disciplinas, codigos do RCO) sao repostas.
 *  - Mantem os ids do real (facilita comparar) e acerta as sequencias no fim.
 *  - Copia: escola, configuracoes, esquema de aulas, calendario, trimestres, salas, recursos, cursos, matrizes,
 *    disciplinas, professores, habilitacoes, disponibilidade/HA, turmas, vinculos, aulas fixas, limites, grade
 *    oficial e experimentos. NAO copia usuarios, acessos, reservas, presencas, licencas, comunicados nem historico.
 * Uso (na raiz do repositorio; o real vem de lib/db/.env, o local de --destino= ou DESTINO_URL):
 *   pnpm --filter @workspace/api-server exec tsx scripts/copiar-escola-para-banco-local.ts '--destino=postgresql://postgres@localhost:5432/nexgrade_teste' [--escola=ID]
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import type pgTipos from "pg";

const RAIZ = path.resolve(process.cwd(), "..", "..");
// o "pg" e dependencia do lib/db (o api-server so o usa atraves dele)
const pg = createRequire(path.join(RAIZ, "lib", "db", "package.json"))("pg") as typeof pgTipos;
const ESCOLA = process.argv.find((a) => a.startsWith("--escola="))?.split("=")[1] ?? "esc_1ce4d2d30c4146a99fb7ffa5";

function urlDoReal(): string {
  const linha = fs.readFileSync(path.join(RAIZ, "lib", "db", ".env"), "utf8").split(/\r?\n/).find((l) => l.trim().startsWith("DATABASE_URL="))!;
  return linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

// ordem de insercao (pais antes dos filhos); `filtro` traz so as linhas desta escola
const POR_ESCOLA = (t: string) => ({ tabela: t, filtro: `select * from "${t}" where escola_id=$1` });
const TABELAS: Array<{ tabela: string; filtro: string }> = [
  { tabela: "escolas", filtro: `select * from escolas where id=$1` },
  ...["configuracoes", "horario_slots", "calendario_escolar", "trimestres_letivos", "salas", "recursos", "cursos",
    "matrizes_curriculares", "disciplinas"].map(POR_ESCOLA),
  { tabela: "itens_matriz", filtro: `select x.* from itens_matriz x join matrizes_curriculares m on m.id=x.matriz_curricular_id where m.escola_id=$1` },
  POR_ESCOLA("professores"),
  { tabela: "professor_disciplinas", filtro: `select x.* from professor_disciplinas x join professores p on p.id=x.professor_id where p.escola_id=$1` },
  { tabela: "disponibilidade_professores", filtro: `select x.* from disponibilidade_professores x join professores p on p.id=x.professor_id where p.escola_id=$1` },
  POR_ESCOLA("turmas"),
  { tabela: "turma_disciplinas", filtro: `select x.* from turma_disciplinas x join turmas t on t.id=x.turma_id where t.escola_id=$1` },
  ...["aulas_fixas", "limites_diarios_professor", "horarios", "horarios_experimentais"].map(POR_ESCOLA),
];
const GERAIS = ["planos", "disciplinas_catalogo", "codigos_rco_disciplina"];

async function main() {
  const destinoUrl = process.argv.find((a) => a.startsWith("--destino="))?.slice("--destino=".length) ?? process.env.DESTINO_URL ?? "";
  const host = (() => { try { return new URL(destinoUrl).hostname; } catch { return ""; } })();
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) throw new Error(`DESTINO_URL tem que ser um banco em localhost (veio: "${host || "vazio"}")`);

  const real = new pg.Client({ connectionString: urlDoReal(), ssl: { rejectUnauthorized: false } });
  const local = new pg.Client({ connectionString: destinoUrl });
  await real.connect();
  await local.connect();
  try {
    await real.query("begin transaction read only");
    const [esc] = (await real.query("select nome_fantasia from escolas where id=$1", [ESCOLA])).rows;
    if (!esc) throw new Error(`escola ${ESCOLA} nao encontrada no banco real`);
    console.log(`Escola: ${esc.nome_fantasia} (${ESCOLA}) -> ${destinoUrl.replace(/\/\/[^@]*@/, "//***@")}\n`);

    // colunas que existem nos DOIS bancos (o real pode ter coluna a mais de migracao manual), com o tipo
    const colunas = async (c: pgTipos.Client, t: string) => new Map((await c.query(
      "select column_name, data_type from information_schema.columns where table_schema='public' and table_name=$1", [t]))
      .rows.map((r) => [r.column_name as string, r.data_type as string]));

    const dados: Record<string, any[]> = {};
    for (const t of GERAIS) dados[t] = (await real.query(`select * from "${t}"`)).rows;
    for (const { tabela, filtro } of TABELAS) dados[tabela] = (await real.query(filtro, [ESCOLA])).rows;
    await real.query("rollback");

    await local.query("begin");
    // apaga a escola no destino (filhos antes dos pais) e repoe as tabelas gerais
    for (const { tabela, filtro } of [...TABELAS].reverse()) {
      const ids = (await local.query(filtro.replace("select * from", "select id from").replace(/select x\.\*/, "select x.id"), [ESCOLA])).rows.map((r) => r.id);
      if (ids.length) await local.query(`delete from "${tabela}" where id = any($1)`, [ids]);
    }
    for (const t of [...GERAIS, ...TABELAS.map((x) => x.tabela)]) {
      const linhas = dados[t];
      if (!linhas.length) { console.log(`  ${t.padEnd(30)} 0`); continue; }
      const noLocal = await colunas(local, t);
      const nomes = Object.keys(linhas[0]).filter((k) => noLocal.has(k));
      // tabelas gerais: o que ja existe no local fica (outras escolas de teste podem apontar para elas)
      const conflito = GERAIS.includes(t) ? " on conflict do nothing" : "";
      const json = (k: string) => /json/.test(noLocal.get(k) ?? "");
      const porLote = Math.max(1, Math.floor(30000 / nomes.length));
      for (let i = 0; i < linhas.length; i += porLote) {
        const lote = linhas.slice(i, i + porLote);
        const params: unknown[] = [];
        const valores = lote.map((r) => `(${nomes.map((k) => { const v = r[k]; params.push(v != null && json(k) ? JSON.stringify(v) : v); return `$${params.length}`; }).join(", ")})`);
        await local.query(`insert into "${t}" (${nomes.map((k) => `"${k}"`).join(", ")}) values ${valores.join(", ")}${conflito}`, params);
      }
      console.log(`  ${t.padEnd(30)} ${linhas.length}`);
    }
    // sequencias: proximo id depois do maior copiado
    for (const t of [...GERAIS, ...TABELAS.map((x) => x.tabela)]) {
      if (!(await colunas(local, t)).has("id")) continue; // ex.: codigos_rco_disciplina (chave e o codigo SAE)
      const [s] = (await local.query("select pg_get_serial_sequence($1, 'id') seq", [`public.${t}`])).rows;
      if (s?.seq) await local.query(`select setval($1, greatest((select coalesce(max(id), 0) from "${t}"), 1))`, [s.seq]);
    }
    await local.query("commit");
    console.log("\nCOPIADO para o banco local.");
  } catch (e) {
    await local.query("rollback").catch(() => {});
    throw e;
  } finally {
    await real.end();
    await local.end();
  }
}

main().catch((e) => { console.error("ERRO:", e.message ?? e); process.exit(1); });
