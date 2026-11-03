// [HA-FIXA-CRISTIANE-0311] (03/11/2026) Mario Braga, tarde: a HA fixa da Cristiane passa de seg 2a para qui 2a,
// como no Urania "CORRETO" de 02-06/11 (la, seg 2a e traco e qui 2a e HA). Continua fixa, com o mesmo texto.
// Seg 2a fica "Bloqueio (importado)", como os outros tracos do Urania. Para se houver aula dela em qui 2a
// (horario real, contando a turma integral) ou se a qui 2a tiver outro registro que nao seja "Bloqueio (importado)"
// (esse e sobra do Urania de 05-09/10 e sai).
// Uso (na pasta lib\db):  node mover-ha-fixa-cristiane-0311.cjs            (dry-run)
//                         node mover-ha-fixa-cristiane-0311.cjs --aplicar  (backup em _arquivo + grava)
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const APLICAR = process.argv.includes("--aplicar");
const ESCOLA = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";
const TURNO = "vespertino", DE = { d: 0, a: 2 }, PARA = { d: 3, a: 2 };
const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex"];

function lerDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const m = fs.readFileSync(path.join(__dirname, ".env"), "utf8").match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m);
  if (!m) throw new Error("DATABASE_URL nao definido");
  return m[1];
}

(async () => {
  const c = new Client({ connectionString: lerDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  console.log(APLICAR ? "MODO: APLICAR\n" : "MODO: DRY-RUN (nada sera alterado)\n");
  const profs = (await c.query("select id, nome from professores where escola_id=$1 and nome ilike 'Cristiane%'", [ESCOLA])).rows;
  if (profs.length !== 1) throw new Error(`esperava 1 Cristiane, achei ${profs.length}`);
  const p = profs[0];
  const disp = (await c.query("select * from disponibilidade_professores where professor_id=$1 and turno=$2 order by dia_semana, horario_slot", [p.id, TURNO])).rows;
  console.log(`${p.nome} (#${p.id}), tarde hoje:`);
  for (const x of disp) console.log(`  ${DIAS[x.dia_semana]} ${x.horario_slot}a  ${x.hora_atividade_obrigatoria ? "HA" : x.disponivel ? "livre" : "bloqueio"}  "${x.motivo ?? ""}"`);
  // aulas dela na tarde, com a integral no horario real (mesma conta de ver-conflitos/conferir-ha-na-integral)
  const aulas = (await c.query(
    `select h.dia_semana, h.numero_aula, t.nome, t.turno from horarios h join turmas t on t.id=h.turma_id
      where h.escola_id=$1 and h.professor_id=$2 and coalesce(h.versao_grade,'oficial')='oficial'`, [ESCOLA, p.id])).rows;
  const slots = (await c.query("select turno, numero_aula, hora_inicio::text h, duracao_minutos m from horario_slots where escola_id=$1", [ESCOLA])).rows;
  const min = (h) => { const [a, b] = h.split(":").map(Number); return a * 60 + b; };
  const tarde = slots.filter((s) => s.turno === TURNO);
  const realTarde = (x) => {
    if (x.turno === TURNO) return x.numero_aula;
    if (x.turno !== "integral") return null;
    const s = slots.find((s) => s.turno === "integral" && s.numero_aula === x.numero_aula); if (!s) return null;
    let melhor = null, sob = 0;
    for (const t of tarde) { const o = Math.min(min(s.h) + s.m, min(t.h) + t.m) - Math.max(min(s.h), min(t.h)); if (o > sob) { sob = o; melhor = t.numero_aula; } }
    return melhor;
  };
  const problemas = [];
  const ha = disp.find((x) => x.dia_semana === DE.d && x.horario_slot === DE.a && x.hora_atividade_obrigatoria);
  if (!ha) problemas.push(`nao ha HA em ${DIAS[DE.d]} ${DE.a}a`);
  const noDestino = disp.find((x) => x.dia_semana === PARA.d && x.horario_slot === PARA.a);
  // bloqueio importado que sobrou do Urania de 05-09/10 (no de 02-06/11 qui 2a e HA): sai
  const blqVelho = noDestino && !noDestino.hora_atividade_obrigatoria && noDestino.motivo === "Bloqueio (importado)" ? noDestino : null;
  if (noDestino && !blqVelho) problemas.push(`${DIAS[PARA.d]} ${PARA.a}a ja tem registro: "${noDestino.motivo ?? ""}"`);
  const aulaDestino = aulas.find((x) => x.dia_semana === PARA.d && realTarde(x) === PARA.a);
  if (aulaDestino) problemas.push(`aula na ${aulaDestino.nome} em ${DIAS[PARA.d]} ${PARA.a}a`);
  const aulaOrigem = aulas.find((x) => x.dia_semana === DE.d && realTarde(x) === DE.a);
  if (aulaOrigem) problemas.push(`aula na ${aulaOrigem.nome} em ${DIAS[DE.d]} ${DE.a}a (nao da para bloquear)`);

  if (ha) console.log(`\nMuda: HA "${ha.motivo}" ${DIAS[DE.d]} ${DE.a}a -> ${DIAS[PARA.d]} ${PARA.a}a (continua fixa)`);
  if (blqVelho) console.log(`Sai: ${DIAS[PARA.d]} ${PARA.a}a "Bloqueio (importado)" (no Urania de 02-06/11 e HA)`);
  console.log(`Entra: ${DIAS[DE.d]} ${DE.a}a "Bloqueio (importado)" (traco do Urania)`);
  if (problemas.length) { console.log(`\nATENCAO (${problemas.length}):`); problemas.forEach((x) => console.log("  - " + x)); }
  if (!APLICAR) { console.log("\nDRY-RUN: nada foi alterado. Rode com --aplicar."); await c.end(); return; }
  if (problemas.length) { console.log("\nNAO GRAVADO: resolva os itens de ATENCAO antes."); await c.end(); process.exitCode = 1; return; }

  const pasta = path.join(__dirname, "_arquivo"); if (!fs.existsSync(pasta)) fs.mkdirSync(pasta);
  const arq = path.join(pasta, `backup-ha-fixa-cristiane-0311-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(arq, JSON.stringify({ professor: p, disponibilidade: disp }, null, 1));
  console.log(`Backup: ${arq}`);
  await c.query("BEGIN");
  try {
    if (blqVelho) await c.query("delete from disponibilidade_professores where id=$1", [blqVelho.id]);
    await c.query("update disponibilidade_professores set dia_semana=$1, horario_slot=$2 where id=$3", [PARA.d, PARA.a, ha.id]);
    await c.query(
      `insert into disponibilidade_professores (professor_id, dia_semana, horario_slot, turno, disponivel, hora_atividade_obrigatoria, motivo)
       values ($1,$2,$3,$4,false,false,'Bloqueio (importado)')`, [p.id, DE.d, DE.a, TURNO]);
    await c.query("COMMIT");
  } catch (e) { await c.query("ROLLBACK"); throw e; }
  console.log("\nGRAVADO. Rode de novo este script (dry-run) para conferir.");
  await c.end();
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
