/**
 * [MATRIZ-3A-RCO] (31/10/2026) Catalogo mestre (disciplinas_catalogo, vale para escola nova) com o que as
 * matrizes novas do catalogo precisam e o arquivo do RCO do Mario Braga confirmou:
 *  - "Lingua Espanhola": Codigo Externo 3826 (estava sem; o RCO nao traz SAE).
 *  - "Pratica de Formacao": Codigo Externo 1269 (estava sem).
 *  - "Tecnologias e Ferramentas de Gestao" (3a serie de Administracao, RCO 0016 + 1624): nao existia;
 *    entra com Codigo Externo 3978 (RCO) e SAE 4767 (cadastro do Mario Braga), IFA, 2 aulas.
 * So preenche campo vazio: codigo ja cadastrado nunca e trocado (aparece no relatorio se for diferente).
 * Dry-run faz e desfaz (ROLLBACK). --aplicar grava (backup das linhas em lib/db/_arquivo).
 * Uso (na raiz do repositorio):
 *   pnpm --filter @workspace/api-server exec tsx scripts/catalogo-mestre-codigos-rco-mb.ts            (dry-run)
 *   pnpm --filter @workspace/api-server exec tsx scripts/catalogo-mestre-codigos-rco-mb.ts --aplicar  (backup + grava)
 */
import fs from "node:fs";
import path from "node:path";

const APLICAR = process.argv.includes("--aplicar");
const RAIZ = path.resolve(process.cwd(), "..", "..");
const CODIGOS: { nome: string; externo: number; sae?: string; criar?: { categoria: string; carga: number } }[] = [
  { nome: "Língua Espanhola", externo: 3826 },
  { nome: "Prática de Formação", externo: 1269 },
  { nome: "Tecnologias e Ferramentas de Gestão", externo: 3978, sae: "4767", criar: { categoria: "IFA", carga: 2 } },
];

function carregarDatabaseUrl() {
  if (process.env.DATABASE_URL) return;
  const linha = fs.readFileSync(path.join(RAIZ, "lib", "db", ".env"), "utf8").split(/\r?\n/).find((l) => l.trim().startsWith("DATABASE_URL="))!;
  process.env.DATABASE_URL = linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

async function main() {
  carregarDatabaseUrl();
  const { pool } = await import("@workspace/db");
  const { siglaParaDisciplina } = await import("../src/lib/sigla-disciplina");
  const c = await pool.connect();
  const q = async (sql: string, p: unknown[] = []) => (await c.query(sql, p)).rows;
  try {
    console.log(APLICAR ? "MODO: APLICAR\n" : "MODO: DRY-RUN (faz e desfaz; nada fica gravado)\n");
    const antes = await q("select * from disciplinas_catalogo where nome = any($1) order by id", [CODIGOS.map((x) => x.nome)]);
    if (APLICAR) {
      const arq = path.join(RAIZ, "lib", "db", "_arquivo", `backup-disciplinas-catalogo-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
      fs.mkdirSync(path.dirname(arq), { recursive: true });
      fs.writeFileSync(arq, JSON.stringify(antes, null, 1));
      console.log(`Backup: ${arq}\n`);
    }
    await c.query("BEGIN");
    try {
      for (const x of CODIGOS) {
        const linhas = antes.filter((r) => r.nome === x.nome);
        if (linhas.length > 1) throw new Error(`"${x.nome}" aparece ${linhas.length} vezes no catalogo mestre`);
        const [par] = x.sae ? await q("select codigo_externo from codigos_rco_disciplina where codigo_sae=$1", [Number(x.sae)]) : [];
        if (par && par.codigo_externo !== x.externo) throw new Error(`SAE ${x.sae} ja aponta para ${par.codigo_externo} na tabela SAE -> RCO`);
        const r = linhas[0];
        if (!r) {
          if (!x.criar) { console.log(`  [NAO ACHOU] ${x.nome}`); continue; }
          const sigla = siglaParaDisciplina(null, x.externo, x.nome);
          await c.query(`insert into disciplinas_catalogo (nome, codigo_sae, categoria_curricular_padrao, carga_semanal_sugerida, codigo_externo_rco, sigla)
            values ($1, $2, $3, $4, $5, $6)`, [x.nome, x.sae ?? null, x.criar.categoria, x.criar.carga, x.externo, sigla]);
          console.log(`  [INCLUIDA] ${x.nome} | SAE ${x.sae ?? "-"} | RCO ${x.externo} | ${x.criar.categoria} ${x.criar.carga} | sigla ${sigla ?? "-"}`);
          continue;
        }
        if (r.codigo_externo_rco != null) {
          console.log(`  [JA TEM] ${x.nome}: RCO ${r.codigo_externo_rco}${r.codigo_externo_rco !== x.externo ? `  <-- DIFERENTE do arquivo do RCO (${x.externo}); nao troquei` : ""}`);
          continue;
        }
        await c.query("update disciplinas_catalogo set codigo_externo_rco=$1, updated_at=now() where id=$2", [x.externo, r.id]);
        console.log(`  [CODIGO] #${r.id} ${x.nome}: RCO vazio -> ${x.externo}`);
      }
      // escolas com essas disciplinas em aula e sem codigo: passam a exportar pelo dicionario (rco-codigos.ts)
      const escolas = await q(`select e.nome_fantasia, d.nome, count(h.id)::int aulas from disciplinas d join escolas e on e.id=d.escola_id
        join horarios h on h.disciplina_id=d.id where d.nome = any($1) and d.codigo_externo_rco is null group by 1, 2 order by 1`, [CODIGOS.map((x) => x.nome)]);
      console.log(`\nEscolas com essas disciplinas na grade e sem codigo (exportam pelo dicionario depois do deploy): ${escolas.length}`);
      for (const e of escolas) console.log(`  ${e.nome_fantasia} | ${e.nome} | ${e.aulas} aulas`);
      if (APLICAR) { await c.query("COMMIT"); console.log("\nGRAVADO."); }
      else { await c.query("ROLLBACK"); console.log("\nDRY-RUN: NADA FOI GRAVADO."); }
    } catch (e) { await c.query("ROLLBACK"); throw e; }
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
