// [HA-CODOCENCIA-ROMARIO] (15/10/2026) Depois da codocencia de Recomposicao:
//  - Joseleine (#928): 20 aulas -> 6 HA (tabela SEED). Os 6 horarios da manha que sobraram do
//    R.9M (seg 6a, qua 4a e 6a, sex 2a, 3a e 6a) passam de "Atividade fora de sala" para HA.
//    Os 2 da tarde (seg 5a, qui 5a) continuam como estao.
//  - Fabio (#887): 30 aulas -> 10 HA; tinha 9. Ganha 1 HA no primeiro horario livre da tarde
//    (sem aula e sem bloqueio).
// Aprovado pela Simone em 15/10. Faz backup antes de gravar.
// Uso (na pasta lib\db):  node ajustar-ha-codocencia-romario.cjs            (dry-run)
//                         node ajustar-ha-codocencia-romario.cjs --aplicar
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const APLICAR = process.argv.includes("--aplicar");
const ESCOLA = "org_3JxLX0hl4xYxiHbrUIIabRHaAO9";
const DIA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
const JOSELEINE = 928, FABIO = 887;
const HA_JOSELEINE = [[0, 6], [2, 4], [2, 6], [4, 2], [4, 3], [4, 6]]; // [dia, aula] manha

function lerDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const m = fs.readFileSync(".env", "utf8").match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m);
  if (!m) throw new Error("DATABASE_URL nao definido (nem no ambiente nem no .env desta pasta)");
  return m[1];
}

(async () => {
  const c = new Client({ connectionString: lerDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  // motivo usado hoje nas HA do Fabio (mesmo padrao da escola)
  const modelo = (await c.query("select motivo from disponibilidade_professores where professor_id=$1 and hora_atividade_obrigatoria=true limit 1", [FABIO])).rows[0];
  const MOTIVO = modelo?.motivo || "Hora-atividade";
  console.log(`Motivo usado nas HA: "${MOTIVO}"\n`);
  const plano = { atualizar: [], inserir: [], problemas: [] };

  // Joseleine
  for (const [d, a] of HA_JOSELEINE) {
    const r = (await c.query("select * from disponibilidade_professores where professor_id=$1 and dia_semana=$2 and horario_slot=$3 and turno='matutino'", [JOSELEINE, d, a])).rows;
    const aula = (await c.query(`select 1 from horarios h join turmas t on t.id=h.turma_id where h.professor_id=$1 and t.turno='matutino' and h.dia_semana=$2 and h.numero_aula=$3 and coalesce(h.versao_grade,'oficial')='oficial'`, [JOSELEINE, d, a])).rowCount;
    const rot = `Joseleine manha ${DIA[d]} ${a}a`;
    if (aula) { plano.problemas.push(`${rot}: tem aula`); continue; }
    if (r.length !== 1 || !/^Atividade fora de sala/i.test(r[0].motivo ?? "")) { plano.problemas.push(`${rot}: esperado 1 bloqueio "Atividade fora de sala", achei ${r.length} (${r.map((x) => x.motivo).join("; ")})`); continue; }
    plano.atualizar.push({ id: r[0].id, rot, antes: r[0] });
  }

  // Fabio: primeiro horario livre da tarde
  const slots = (await c.query("select distinct numero_aula from horario_slots where escola_id=$1 and turno='vespertino' and coalesce(letivo,true)=true order by 1", [ESCOLA])).rows.map((x) => x.numero_aula);
  let escolhido = null;
  for (let d = 0; d < 5 && !escolhido; d++) {
    for (const a of slots) {
      const aula = (await c.query(`select 1 from horarios h join turmas t on t.id=h.turma_id where h.professor_id=$1 and t.turno='vespertino' and h.dia_semana=$2 and h.numero_aula=$3 and coalesce(h.versao_grade,'oficial')='oficial'`, [FABIO, d, a])).rowCount;
      const bloq = (await c.query("select id, disponivel from disponibilidade_professores where professor_id=$1 and dia_semana=$2 and horario_slot=$3 and (turno='vespertino' or turno is null)", [FABIO, d, a])).rows;
      if (!aula && !bloq.some((b) => b.disponivel === false)) { escolhido = { d, a, existente: bloq[0] ?? null }; break; }
    }
  }
  if (!escolhido) plano.problemas.push("Fabio: nenhum horario livre na tarde");
  else if (escolhido.existente) plano.atualizar.push({ id: escolhido.existente.id, rot: `Fabio tarde ${DIA[escolhido.d]} ${escolhido.a}a`, antes: escolhido.existente });
  else plano.inserir.push({ prof: FABIO, d: escolhido.d, a: escolhido.a, turno: "vespertino", rot: `Fabio tarde ${DIA[escolhido.d]} ${escolhido.a}a` });

  for (const x of plano.atualizar) console.log(`HA  | ${x.rot}  (antes: ${x.antes.motivo ?? "disponivel"})`);
  for (const x of plano.inserir) console.log(`HA  | ${x.rot}  (horario livre, novo)`);
  console.log(`\nResumo: ${plano.atualizar.length + plano.inserir.length} HA (Joseleine ${plano.atualizar.filter((x) => x.rot.startsWith("Joseleine")).length}, Fabio ${plano.atualizar.filter((x) => x.rot.startsWith("Fabio")).length + plano.inserir.length})`);
  if (plano.problemas.length) { console.log("\nATENCAO - ficam de fora:"); for (const p of plano.problemas) console.log("  - " + p); }
  if (!APLICAR) { console.log("\nDRY-RUN: nada foi alterado. Rode com --aplicar."); await c.end(); return; }

  const pasta = path.join(__dirname, "_arquivo"); if (!fs.existsSync(pasta)) fs.mkdirSync(pasta);
  const arq = path.join(pasta, `backup-ha-codocencia-romario-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(arq, JSON.stringify(plano, null, 1));
  console.log(`Backup: ${arq}`);
  await c.query("BEGIN");
  try {
    for (const x of plano.atualizar) await c.query("update disponibilidade_professores set disponivel=false, hora_atividade_obrigatoria=true, motivo=$1 where id=$2", [MOTIVO, x.id]);
    for (const x of plano.inserir) await c.query("insert into disponibilidade_professores (professor_id, dia_semana, horario_slot, disponivel, motivo, turno, hora_atividade_obrigatoria) values ($1,$2,$3,false,$4,$5,true)", [x.prof, x.d, x.a, MOTIVO, x.turno]);
    await c.query("COMMIT");
  } catch (e) { await c.query("ROLLBACK"); throw e; }
  console.log("\nGRAVADO.");
  await c.end();
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
