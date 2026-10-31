// [ATUALIZAR-MARIO-BRAGA-0211] (31/10/2026) Mario Braga: a 8MB ficou com 1 de 2 aulas de Lingua Inglesa
// no Urania de 02-06/11 (o unico horario vago da turma, qui 5a da manha, e traco da Marise no Urania).
// Decisao da escola (31/10): a Marise da essa aula na qui 5a. Inclui a aula e tira o bloqueio dela nesse horario.
// Para (nao grava) se o horario nao estiver vago na 8MB, se a Marise tiver aula no mesmo horario real ou se
// o que estiver na disponibilidade dela ali for hora-atividade.
// Uso: node C:\projetos\nexgrade-app\lib\db\incluir-ingles-8mb-qui5.cjs            (dry-run)
//      node C:\projetos\nexgrade-app\lib\db\incluir-ingles-8mb-qui5.cjs --aplicar  (backup em _arquivo + grava)
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const APLICAR = process.argv.includes("--aplicar");
const ESCOLA = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";
const DIA = 3; // quinta
const AULA = 5; // 11:05 (manha)

(async () => {
  const m = fs.readFileSync(path.join(__dirname, ".env"), "utf8").match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m);
  const c = new Client({ connectionString: process.env.DATABASE_URL || m[1], ssl: { rejectUnauthorized: false } });
  await c.connect();
  console.log(APLICAR ? "MODO: APLICAR\n" : "MODO: DRY-RUN (nada sera alterado)\n");
  try {
    const turma = (await c.query("select id, nome, turno from turmas where escola_id=$1 and nome='8MB'", [ESCOLA])).rows;
    const prof = (await c.query("select id, nome from professores where escola_id=$1 and nome ilike 'marise%'", [ESCOLA])).rows;
    if (turma.length !== 1 || prof.length !== 1) throw new Error(`esperava 1 turma 8MB e 1 Marise; achei ${turma.length} e ${prof.length}`);
    const t = turma[0], p = prof[0];
    const slot = (await c.query("select hora_inicio::text h from horario_slots s join turmas t on t.id=$2 where s.escola_id=$1 and s.turno='matutino' and s.numero_aula=$3 and s.nivel_ensino is not distinct from t.nivel_ensino", [ESCOLA, t.id, AULA])).rows[0];
    const vinc = (await c.query(
      "select td.disciplina_id, d.nome from turma_disciplinas td join disciplinas d on d.id=td.disciplina_id where td.turma_id=$1 and td.professor_id=$2 and d.nome ilike '%ingl%'", [t.id, p.id])).rows;
    const naTurma = (await c.query(
      "select h.id, d.nome disc, pr.nome prof from horarios h join disciplinas d on d.id=h.disciplina_id join professores pr on pr.id=h.professor_id where h.turma_id=$1 and h.dia_semana=$2 and h.numero_aula=$3 and coalesce(h.versao_grade,'oficial')='oficial'", [t.id, DIA, AULA])).rows;
    const daProf = (await c.query(
      "select h.id, t.nome turma, t.turno, h.numero_aula from horarios h join turmas t on t.id=h.turma_id where h.professor_id=$1 and h.dia_semana=$2 and coalesce(h.versao_grade,'oficial')='oficial' and ((t.turno in ('matutino','integral') and h.numero_aula=$3))", [p.id, DIA, AULA])).rows;
    const disp = (await c.query(
      "select * from disponibilidade_professores where professor_id=$1 and turno='matutino' and dia_semana=$2 and horario_slot=$3", [p.id, DIA, AULA])).rows;

    console.log(`Turma ${t.nome} (#${t.id}) | professora ${p.nome} (#${p.id}) | quinta ${AULA}a aula ${slot?.h?.slice(0, 5) ?? "?"}`);
    console.log(`Vinculo de Ingles na 8MB: ${vinc.map((v) => `${v.nome} (#${v.disciplina_id})`).join(", ") || "NENHUM"}`);
    console.log(`Na 8MB nesse horario: ${naTurma.map((x) => `${x.disc} (${x.prof})`).join(", ") || "vago"}`);
    console.log(`Marise nesse horario: ${daProf.map((x) => `aula na ${x.turma}`).join(", ") || "sem aula"}`);
    console.log(`Disponibilidade dela nesse horario: ${disp.map((x) => `${x.hora_atividade_obrigatoria ? "HA" : x.disponivel ? "disponivel" : "bloqueio"} (${x.motivo ?? "sem motivo"})`).join(", ") || "nada cadastrado"}`);

    const problemas = [];
    if (vinc.length !== 1) problemas.push("vinculo de Ingles da Marise na 8MB nao encontrado (ou mais de um)");
    if (naTurma.length) problemas.push("o horario nao esta vago na 8MB");
    if (daProf.length) problemas.push("a Marise ja tem aula nesse horario");
    if (disp.some((x) => x.hora_atividade_obrigatoria)) problemas.push("nesse horario esta a HA dela");
    if (problemas.length) { console.log(`\nPARADO: ${problemas.join("; ")}. Nada foi alterado.`); process.exitCode = 1; return; }

    const sai = disp.filter((x) => !x.disponivel);
    console.log(`\nVai: incluir Ingles da Marise na 8MB qui ${AULA}a${sai.length ? ` e tirar ${sai.length} bloqueio(s) dela nesse horario` : ""}.`);
    if (!APLICAR) { console.log("\nDRY-RUN: nada foi alterado. Rode com --aplicar."); return; }

    const arq = path.join(__dirname, "_arquivo", `backup-ingles-8mb-qui5-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.mkdirSync(path.dirname(arq), { recursive: true });
    fs.writeFileSync(arq, JSON.stringify({ disponibilidade: disp }, null, 1));
    await c.query("BEGIN");
    try {
      if (sai.length) await c.query("delete from disponibilidade_professores where id = any($1)", [sai.map((x) => x.id)]);
      await c.query(
        `insert into horarios (escola_id, turma_id, disciplina_id, professor_id, dia_semana, numero_aula, versao_grade)
         values ($1,$2,$3,$4,$5,$6,'oficial')`, [ESCOLA, t.id, vinc[0].disciplina_id, p.id, DIA, AULA]);
      await c.query("COMMIT");
    } catch (e) { await c.query("ROLLBACK"); throw e; }
    console.log(`\nGRAVADO. Backup: ${arq}`);
  } catch (e) {
    console.error("ERRO:", e.message); process.exitCode = 1;
  } finally {
    await c.end();
  }
})();
