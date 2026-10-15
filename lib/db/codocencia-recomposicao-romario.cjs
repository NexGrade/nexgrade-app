// [CODOCENCIA-RECOMPOSICAO-ROMARIO] (15/10/2026) Resposta do diretor do Romario:
//  - R6TA-R6TD (Fabio e Flavia A., tarde) = codocencia de Recomposicao de Lingua Portuguesa;
//  - R.9M / R.6M (Joseleine) = codocencia de Recomposicao de Matematica.
// Hoje esses horarios estao gravados como "Atividade fora de sala" na disponibilidade.
// O script, para cada turma: (1) grava o professor de apoio na turma_disciplinas
// (professor_apoio_id = co-docencia); (2) cria a aula do professor de apoio nos MESMOS horarios
// do titular (grade oficial); (3) tira o bloqueio "Atividade fora de sala" desses horarios.
// Nao mexe em nenhum outro horario. Faz backup antes de gravar.
// Uso (na pasta lib\db):  node codocencia-recomposicao-romario.cjs            (dry-run)
//                         node codocencia-recomposicao-romario.cjs --aplicar
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const APLICAR = process.argv.includes("--aplicar");
const ESCOLA = "org_3JxLX0hl4xYxiHbrUIIabRHaAO9";
const LP = "Leitura e Recomposi%Portuguesa";
const MAT = "Rec. Aprend. Matem%";
const ALVOS = [
  { apoio: "f_bio%", turmas: ["6TA", "6TB"], disc: LP },
  { apoio: "fl_via a%", turmas: ["6TC", "6TD"], disc: LP },
  { apoio: "%joseleine%", turmas: ["9MA", "9MB", "9MC", "9MD", "9ME", "9MF", "6TA", "6TB", "6TC", "6TD"], disc: MAT },
];
const DIA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

function lerDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const m = fs.readFileSync(".env", "utf8").match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m);
  if (!m) throw new Error("DATABASE_URL nao definido (nem no ambiente nem no .env desta pasta)");
  return m[1];
}

(async () => {
  const c = new Client({ connectionString: lerDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  const plano = { tds: [], aulas: [], liberar: [], problemas: [] };
  for (const a of ALVOS) {
    const ps = (await c.query("select id, nome from professores where escola_id=$1 and nome ilike $2", [ESCOLA, a.apoio])).rows;
    if (ps.length !== 1) { plano.problemas.push(`professor "${a.apoio}": ${ps.length} encontrados (${ps.map((p) => p.nome).join(", ")})`); continue; }
    const ap = ps[0];
    console.log(`\n== ${ap.nome} (#${ap.id})`);
    for (const nomeTurma of a.turmas) {
      const t = (await c.query("select id, nome, turno from turmas where escola_id=$1 and nome=$2", [ESCOLA, nomeTurma])).rows[0];
      if (!t) { plano.problemas.push(`turma ${nomeTurma} nao encontrada`); continue; }
      const aulas = (await c.query(
        `select h.*, d.nome disc, p.nome prof from horarios h join disciplinas d on d.id=h.disciplina_id join professores p on p.id=h.professor_id
          where h.turma_id=$1 and coalesce(h.versao_grade,'oficial')='oficial' and d.nome ilike $2 order by h.dia_semana, h.numero_aula`, [t.id, a.disc])).rows;
      const titulares = aulas.filter((h) => h.professor_id !== ap.id);
      const discIds = [...new Set(aulas.map((h) => h.disciplina_id))];
      if (discIds.length !== 1) { plano.problemas.push(`${nomeTurma}: ${discIds.length} disciplinas de recomposicao na grade`); continue; }
      const td = (await c.query("select id, professor_id, professor_apoio_id from turma_disciplinas where turma_id=$1 and disciplina_id=$2", [t.id, discIds[0]])).rows[0];
      if (!td) { plano.problemas.push(`${nomeTurma}: sem vinculo turma_disciplinas`); continue; }
      if (td.professor_apoio_id && td.professor_apoio_id !== ap.id) { plano.problemas.push(`${nomeTurma} ${aulas[0].disc}: ja tem outro professor de apoio (#${td.professor_apoio_id})`); continue; }
      if (td.professor_apoio_id !== ap.id) plano.tds.push({ id: td.id, antes: td.professor_apoio_id, apoio: ap.id });
      const slots = [];
      for (const h of titulares) {
        const ja = aulas.some((x) => x.professor_id === ap.id && x.dia_semana === h.dia_semana && x.numero_aula === h.numero_aula);
        const outra = (await c.query(
          `select t2.nome from horarios h2 join turmas t2 on t2.id=h2.turma_id where h2.professor_id=$1 and t2.turno=$2 and h2.dia_semana=$3 and h2.numero_aula=$4
             and coalesce(h2.versao_grade,'oficial')='oficial' and h2.turma_id<>$5`, [ap.id, t.turno, h.dia_semana, h.numero_aula, t.id])).rows;
        const bloq = (await c.query(
          "select id, motivo, disponivel, hora_atividade_obrigatoria, turno from disponibilidade_professores where professor_id=$1 and dia_semana=$2 and horario_slot=$3 and (turno=$4 or turno is null) and disponivel=false",
          [ap.id, h.dia_semana, h.numero_aula, t.turno])).rows;
        const rotulo = `${DIA[h.dia_semana]} ${h.numero_aula}a`;
        if (outra.length) { plano.problemas.push(`${ap.nome} ${nomeTurma} ${rotulo}: ja tem aula na ${outra.map((x) => x.nome).join(", ")}`); continue; }
        const outros = bloq.filter((b) => !/^Atividade fora de sala/i.test(b.motivo ?? ""));
        if (outros.length) { plano.problemas.push(`${ap.nome} ${nomeTurma} ${rotulo}: bloqueio "${outros.map((b) => b.motivo || (b.hora_atividade_obrigatoria ? "HA" : "indisponivel")).join("; ")}"`); continue; }
        for (const b of bloq) plano.liberar.push({ id: b.id, prof: ap.nome, rotulo, motivo: b.motivo, turno: t.turno });
        if (!ja) plano.aulas.push({ base: h, apoio: ap.id });
        slots.push(rotulo + (ja ? " (ja existe)" : ""));
      }
      console.log(`  ${nomeTurma.padEnd(4)} ${aulas[0]?.disc ?? "?"} | titular: ${[...new Set(titulares.map((h) => h.prof))].join(", ")} | ${slots.join(", ") || "nenhum horario"}`);
    }
  }
  const liberarUnicos = [...new Map(plano.liberar.map((l) => [l.id, l])).values()];
  console.log(`\nResumo: ${plano.tds.length} vinculos com professor de apoio | ${plano.aulas.length} aulas novas do apoio | ${liberarUnicos.length} bloqueios "Atividade fora de sala" liberados`);
  if (plano.problemas.length) { console.log(`\nATENCAO (${plano.problemas.length}) - estes itens ficam de fora:`); for (const p of plano.problemas) console.log("  - " + p); }
  if (!APLICAR) { console.log("\nDRY-RUN: nada foi alterado. Rode com --aplicar."); await c.end(); return; }

  const pasta = path.join(__dirname, "_arquivo"); if (!fs.existsSync(pasta)) fs.mkdirSync(pasta);
  const arq = path.join(pasta, `backup-codocencia-romario-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  const backupDisp = liberarUnicos.length ? (await c.query("select * from disponibilidade_professores where id = any($1)", [liberarUnicos.map((l) => l.id)])).rows : [];
  fs.writeFileSync(arq, JSON.stringify({ tds: plano.tds, disponibilidade: backupDisp }, null, 1));
  console.log(`Backup: ${arq}`);
  await c.query("BEGIN");
  try {
    for (const td of plano.tds) await c.query("update turma_disciplinas set professor_apoio_id=$1 where id=$2", [td.apoio, td.id]);
    for (const a of plano.aulas) {
      const h = a.base;
      await c.query(
        `insert into horarios (escola_id, turma_id, disciplina_id, professor_id, dia_semana, numero_aula, sala, versao_grade, assincrona, fixa)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [h.escola_id, h.turma_id, h.disciplina_id, a.apoio, h.dia_semana, h.numero_aula, h.sala, h.versao_grade ?? "oficial", h.assincrona, h.fixa]);
    }
    if (liberarUnicos.length) await c.query("delete from disponibilidade_professores where id = any($1)", [liberarUnicos.map((l) => l.id)]);
    await c.query("COMMIT");
  } catch (e) { await c.query("ROLLBACK"); throw e; }
  console.log("\nGRAVADO. Proximo passo: recalcular a hora-atividade dos 3 professores (agora com aulas).");
  await c.end();
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
