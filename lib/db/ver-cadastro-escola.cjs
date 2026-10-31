// (31/10/2026) So LE. Raio-x do cadastro de uma escola: cursos e matrizes (disciplinas e aulas por serie),
// turmas (turno, nivel, matriz, codigos SERE), esquema de horarios, professores, disciplinas e aulas na grade.
// Uso: node C:\projetos\nexgrade-app\lib\db\ver-cadastro-escola.cjs "<trecho do nome da escola>"
// Relatorio completo em _arquivo\cadastro-<escola>.txt
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const trecho = process.argv.slice(2).join(" ").trim();
const linhas = [];
const log = (s = "") => { linhas.push(s); console.log(s); };

(async () => {
  if (!trecho) { console.log('Uso: node ver-cadastro-escola.cjs "iedo"'); return; }
  const m = fs.readFileSync(path.join(__dirname, ".env"), "utf8").match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m);
  const c = new Client({ connectionString: process.env.DATABASE_URL || m[1], ssl: { rejectUnauthorized: false } });
  await c.connect();
  let arq = null;
  try {
    const esc = (await c.query("select id, nome_fantasia, codigo_inep, cidade from escolas where nome_fantasia ilike $1", [`%${trecho}%`])).rows;
    if (esc.length !== 1) { log(`Escolas com "${trecho}": ${esc.map((e) => `${e.nome_fantasia} (${e.id})`).join(" | ") || "nenhuma"}`); return; }
    const e = esc[0];
    arq = path.join(__dirname, "_arquivo", `cadastro-${e.id}.txt`);
    log(`Escola: ${e.nome_fantasia} | id ${e.id} | INEP ${e.codigo_inep ?? "-"} | ${e.cidade ?? ""}`);
    const q = async (sql, p = [e.id]) => (await c.query(sql, p)).rows;

    const cursos = await q("select * from cursos where escola_id=$1 order by nome");
    log(`\n== Cursos (${cursos.length})`);
    for (const cu of cursos) {
      log(`  #${cu.id} ${cu.nome}${cu.ofertado === false ? " [nao ofertado]" : ""} | nivel ${cu.nivel ?? "-"}`);
      const mats = await q("select * from matrizes_curriculares where curso_id=$1 order by serie_ano", [cu.id]);
      for (const mt of mats) {
        const itens = await q(
          `select i.carga_horaria_semanal ch, i.categoria_curricular cat, d.nome from itens_matriz i join disciplinas d on d.id=i.disciplina_id
            where i.matriz_curricular_id=$1 order by i.categoria_curricular, d.nome`, [mt.id]);
        log(`     matriz #${mt.id} ${mt.serie_ano}: ${itens.length} disciplina(s), ${itens.reduce((s, x) => s + (x.ch || 0), 0)} aula(s)/semana`);
        for (const it of itens) log(`        ${String(it.ch).padStart(2)}  ${String(it.cat ?? "").padEnd(4)} ${it.nome}`);
      }
    }

    const turmas = await q(
      `select t.*, (select count(*)::int from turma_disciplinas td where td.turma_id=t.id) vinculos,
              (select coalesce(sum(coalesce(td.carga_horaria_semanal_override, d.carga_semanal)),0)::int from turma_disciplinas td join disciplinas d on d.id=td.disciplina_id where td.turma_id=t.id) carga,
              (select count(*)::int from horarios h where h.turma_id=t.id and coalesce(h.versao_grade,'oficial')='oficial') aulas
         from turmas t where t.escola_id=$1 order by t.turno, t.nome`);
    log(`\n== Turmas (${turmas.length})`);
    for (const t of turmas) log(`  #${t.id} ${String(t.nome).padEnd(12)} ${String(t.turno).padEnd(10)} nivel ${t.nivel_ensino ?? "-"} | matriz ${t.matriz_curricular_id ?? "-"} | SERE ${t.codigo_sere ?? "-"}/${t.codigo_sere_if ?? "-"} | vinculos ${t.vinculos} (carga ${t.carga}) | aulas na grade ${t.aulas}${t.fantasma ? " [fantasma]" : ""}`);

    const slots = await q("select turno, nivel_ensino, numero_aula, hora_inicio::text h, duracao_minutos d, letivo from horario_slots where escola_id=$1 order by turno, nivel_ensino, numero_aula");
    log(`\n== Esquema de horarios (${slots.length})`);
    const porT = new Map();
    for (const s of slots) { const k = `${s.turno}${s.nivel_ensino ? "/" + s.nivel_ensino : ""}`; porT.set(k, [...(porT.get(k) || []), `${s.numero_aula}a ${s.h.slice(0, 5)}${s.letivo === false ? "*" : ""}`]); }
    for (const [k, l] of porT) log(`  ${k}: ${l.join("  ")}`);

    const disc = await q("select d.id, d.nome, d.sigla, d.codigo_externo_rco cod, d.carga_semanal from disciplinas d where d.escola_id=$1 order by d.nome");
    log(`\n== Disciplinas (${disc.length})`);
    for (const d of disc) log(`  #${d.id} ${d.nome} | sigla ${d.sigla ?? "-"} | RCO ${d.cod ?? "-"} | carga ${d.carga_semanal}`);

    const profs = await q("select id, nome, ativo from professores where escola_id=$1 order by nome");
    log(`\n== Professores (${profs.length}): ${profs.map((p) => p.nome + (p.ativo ? "" : " [inativo]")).join(", ")}`);
    const tot = await q("select count(*)::int n from horarios where escola_id=$1 and coalesce(versao_grade,'oficial')='oficial'");
    log(`\nAulas na grade oficial: ${tot[0].n}`);
  } catch (err) {
    log(`ERRO: ${err.message}`); process.exitCode = 1;
  } finally {
    await c.end();
    if (arq) { fs.mkdirSync(path.dirname(arq), { recursive: true }); fs.writeFileSync(arq, linhas.join("\r\n"), "utf8"); console.log(`\nRelatorio completo: ${arq}`); }
  }
})();
