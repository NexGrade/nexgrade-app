// [VIRADA-ANO] (24/10/2026) SOMENTE LEITURA. Mostra como as turmas, series e matrizes estao gravadas
// numa escola, para montar a regra de "serie seguinte" da virada do ano letivo.
// Uso (na pasta lib\db): node listar-estrutura-virada.cjs [--escola=esc_...]   (padrao: escola de demonstracao)
const fs = require("fs");
const { Client } = require("pg");
const arg = process.argv.find((a) => a.startsWith("--escola="));
const ESCOLA = arg ? arg.split("=")[1] : "esc_1ce4d2d30c4146a99fb7ffa5";
function url() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  return fs.readFileSync(".env", "utf8").match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m)[1];
}
(async () => {
  const c = new Client({ connectionString: url(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  const esc = (await c.query("select id, nome_fantasia nome from escolas where id=$1", [ESCOLA])).rows[0];
  console.log(`Escola: ${esc ? esc.nome : "(nao achada)"} (${ESCOLA})`);
  const turmas = (await c.query(
    `select t.nome, t.serie, t.turno, t.nivel_ensino, t.ano_letivo, t.fantasma, m.serie_ano, cu.nome curso, cu.nivel curso_nivel,
            (select count(*) from turma_disciplinas td where td.turma_id=t.id)::int vinculos,
            (select count(*) from turma_disciplinas td where td.turma_id=t.id and td.professor_id is not null)::int com_prof
       from turmas t left join matrizes_curriculares m on m.id=t.matriz_curricular_id left join cursos cu on cu.id=m.curso_id
      where t.escola_id=$1 order by t.turno, t.nome`, [ESCOLA])).rows;
  console.log(`\n== Turmas (${turmas.length})  nome | serie | turno | nivel | ano | matriz(serie_ano) | curso | vinculos(com prof)`);
  for (const t of turmas) console.log(`  ${t.nome.padEnd(10)} | ${String(t.serie).padEnd(12)} | ${t.turno.padEnd(10)} | ${String(t.nivel_ensino).padEnd(13)} | ${t.ano_letivo}${t.fantasma ? " FANT" : ""} | ${String(t.serie_ano ?? "-").padEnd(10)} | ${String(t.curso ?? "-").slice(0, 45)} | ${t.vinculos}(${t.com_prof})`);
  const mats = (await c.query(
    `select cu.nome curso, cu.nivel, cu.ofertado, string_agg(m.serie_ano, ', ' order by m.serie_ano) series
       from cursos cu join matrizes_curriculares m on m.curso_id=cu.id where cu.escola_id=$1 and cu.ofertado group by 1,2,3 order by 2,1`, [ESCOLA])).rows;
  console.log(`\n== Cursos ofertados e series das matrizes (${mats.length})`);
  for (const m of mats) console.log(`  [${m.nivel}] ${m.curso.slice(0, 60)}: ${m.series}`);
  const n = async (sql) => (await c.query(sql, [ESCOLA])).rows[0].n;
  console.log("\n== Contagens");
  console.log(`  professores ativos: ${await n("select count(*)::int n from professores where escola_id=$1 and ativo")} | inativos: ${await n("select count(*)::int n from professores where escola_id=$1 and not ativo")}`);
  console.log(`  aulas na grade oficial: ${await n("select count(*)::int n from horarios where escola_id=$1 and coalesce(versao_grade,'oficial')='oficial'")}`);
  console.log(`  linhas de disponibilidade: ${await n("select count(*)::int n from disponibilidade_professores d join professores p on p.id=d.professor_id where p.escola_id=$1")}`);
  console.log(`  aulas fixas por ano: ${JSON.stringify((await c.query("select ano_letivo, count(*)::int n from aulas_fixas where escola_id=$1 group by 1", [ESCOLA])).rows)}`);
  console.log(`  reservas a partir de 2027: ${await n("select count(*)::int n from reservas where escola_id=$1 and data >= '2027-01-01'")}`);
  console.log("\nSOMENTE LEITURA: nada foi alterado.");
  await c.end();
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
