// SO LEITURA. Pausa de 1 hora entre turnos: quais professores tem AULA (ou HA) em dois turnos
// no mesmo dia com menos de 60 minutos entre o fim de um e o comeco do outro?
// Usa os horarios reais do esquema de cada turno. Antes de ligar a regra no motor.
// Rodar na pasta lib\db:  node pausa-turnos-aulas.cjs [--escola=romario|mario-braga|todas]
const fs = require("fs");
const { Client } = require("pg");
const url = process.env.DATABASE_URL || fs.readFileSync(".env", "utf8").match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m)[1];
const ESC = { romario: "org_3JxLX0hl4xYxiHbrUIIabRHaAO9" };
const arg = (process.argv.find((a) => a.startsWith("--escola=")) || "--escola=romario").split("=")[1];
const D = ["Seg", "Ter", "Qua", "Qui", "Sex"];
const T = { matutino: "Manhã", vespertino: "Tarde", noturno: "Noite" };
const hm = (x) => `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
(async () => {
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const escolas = arg === "todas" || !ESC[arg]
    ? (await c.query("select distinct escola_id from horarios")).rows.map((r) => r.escola_id)
    : [ESC[arg]];
  for (const E of escolas) {
    const nomeEsc = (await c.query("select nome_fantasia from escolas where id=$1", [E])).rows[0]?.nome_fantasia ?? E;
    const slots = (await c.query("select turno, numero_aula, hora_inicio, duracao_minutos from horario_slots where escola_id=$1", [E])).rows;
    const faixa = new Map();
    for (const s of slots) {
      const [h, m] = String(s.hora_inicio).slice(0, 5).split(":").map(Number);
      const ini = h * 60 + m, fim = ini + (s.duracao_minutos ?? 50), k = `${s.turno}|${s.numero_aula}`;
      const a = faixa.get(k); faixa.set(k, a ? [Math.min(a[0], ini), Math.max(a[1], fim)] : [ini, fim]);
    }
    const aulas = (await c.query(
      `select h.professor_id p, t.turno, h.dia_semana d, h.numero_aula a, 'aula' tipo, t.nome turma from horarios h join turmas t on t.id=h.turma_id
        where h.escola_id=$1 and coalesce(h.versao_grade,'oficial')='oficial' and not (h.assincrona and h.numero_aula > 6)`, [E])).rows;
    const has = (await c.query(
      `select dp.professor_id p, dp.turno, dp.dia_semana d, dp.horario_slot a, 'HA' tipo, '' turma from disponibilidade_professores dp
        join professores pr on pr.id=dp.professor_id where pr.escola_id=$1 and dp.hora_atividade_obrigatoria and dp.turno is not null`, [E])).rows;
    const nomes = new Map((await c.query("select id, nome from professores where escola_id=$1", [E])).rows.map((r) => [r.id, r.nome]));
    const itens = [...aulas, ...has];
    const porProfDia = new Map();
    for (const i of itens) { const k = `${i.p}|${i.d}`; (porProfDia.get(k) || porProfDia.set(k, []).get(k)).push(i); }
    const casos = [];
    for (const [k, l] of porProfDia) {
      const turnos = [...new Set(l.map((i) => i.turno))];
      if (turnos.length < 2) continue;
      for (const x of l) for (const y of l) {
        if (x.turno >= y.turno) continue;
        const a = faixa.get(`${x.turno}|${x.a}`), b = faixa.get(`${y.turno}|${y.a}`);
        if (!a || !b) continue;
        const dist = a[1] <= b[0] ? b[0] - a[1] : b[1] <= a[0] ? a[0] - b[1] : -1;
        if (dist < 60) casos.push({ p: x.p, d: x.d, x, y, dist, a, b });
      }
    }
    const soAula = casos.filter((c2) => c2.x.tipo === "aula" && c2.y.tipo === "aula");
    const comHA = casos.filter((c2) => c2.x.tipo === "HA" || c2.y.tipo === "HA");
    console.log(`\n=== ${nomeEsc} ===`);
    console.log(`Aula x aula com menos de 1 hora entre turnos: ${soAula.length} | envolvendo HA: ${comHA.length}`);
    const vistos = new Set();
    for (const c2 of [...soAula, ...comHA].sort((u, v) => (nomes.get(u.p) ?? "").localeCompare(nomes.get(v.p) ?? "") || u.d - v.d)) {
      const k = `${c2.p}|${c2.d}|${c2.x.turno}${c2.x.a}|${c2.y.turno}${c2.y.a}`; if (vistos.has(k)) continue; vistos.add(k);
      const desc = (i, f) => `${T[i.turno]} ${i.a}a ${hm(f[0])}-${hm(f[1])} ${i.tipo === "HA" ? "HA" : i.turma}`;
      console.log(`  ${nomes.get(c2.p)} | ${D[c2.d]} | ${desc(c2.x, c2.a)}  x  ${desc(c2.y, c2.b)} | pausa ${c2.dist < 0 ? "sobreposto" : c2.dist + " min"}`);
    }
  }
  await c.end();
})().catch((x) => { console.error("ERRO:", x.message); process.exit(1); });
