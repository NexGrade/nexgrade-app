// [HA-FALTANTE-MB-0311] (03/11/2026) Lanca a HA que falta no C.E. Prof. Mario Braga pela tabela SEED-PR
// (a mesma conta do conflito "hora_atividade_insuficiente": ver-conflitos.ts --incluir-aceitos). Nao mexe em
// nenhuma HA que ja existe nem em aula; so acrescenta, ate o professor chegar ao exigido.
// Onde a HA entra (nesta ordem, so em horario sem aula do professor, contando a turma integral no horario real e a
// aula assincrona, decisao de 01/11):
//   1. onde o Urania de 02-06/11 tem HA para ele (tarde: PDF "CORRETO" de 03/11; manha e noite: o de 31/10);
//      o horario pode estar livre, com "Bloqueio (importado)" (sobra de importacao antiga) ou com bloqueio sem motivo;
//   2. senao, horario livre (sem registro) no turno e dia em que ele ja tem aula: primeiro o que fecha janela,
//      depois o colado nas aulas do dia.
//   Prefere, dentro de cada grupo, o que fecha janela. No maximo 5 HA por professor, turno e dia.
// Nunca usa: bloqueio com motivo escrito (definido pela escola ou na tela), marcador "(ocupado: ...)".
// Uso (na pasta lib\db):  node lancar-ha-faltante-mario-braga-0311.cjs            (dry-run)
//                         node lancar-ha-faltante-mario-braga-0311.cjs --aplicar  (backup em _arquivo + grava)
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const APLICAR = process.argv.includes("--aplicar");
const ESCOLA = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";
const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex"];
const TURNOS = ["matutino", "vespertino", "noturno"];
const ROT = { matutino: "manha", vespertino: "tarde", noturno: "noite" };
const MOTIVO = "Importado do sistema anterior 02-06/11 (HA)"; // HA movel, como as do Urania (regra ehHAMovel)
const MOTIVO_SEED = "Hora-atividade institucional (recalculada automaticamente)"; // HA que nao veio do Urania
const MAX_DIA = 5;
// mesma tabela de lib/hora-atividade.ts (SEED-PR, Res. 7.200/2025), por turno
const TABELA = [0, 0, 0, 1, 1, 2, 2, 2, 2, 3, 3, 4, 4, 4, 4, 5, 5, 5, 6, 6, 6, 7, 7, 7, 8, 8, 8, 9, 9, 10, 10];
const haDoTurno = (n) => (n <= 0 ? 0 : n <= 30 ? TABELA[n] : Math.ceil(n / 3));
const min = (h) => { const [a, b] = String(h).split(":").map(Number); return a * 60 + b; };
const hhmm = (h) => String(h).slice(0, 5);
const ehHA = (x) => /^H\.?A\.?\*?$/i.test(x || "");
const palavras = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
const casaNome = (u, p) => { // mesmo casamento de atualizar-mario-braga-urania-0211.cjs
  const a = palavras(u), b = palavras(p);
  if (!a.length || !b.length || a[0] !== b[0]) return false;
  let j = 1;
  for (const w of a.slice(1)) { while (j < b.length && !(b[j] === w || (w.length <= 2 && b[j].startsWith(w)))) j++; if (j >= b.length) return false; j++; }
  return true;
};

function lerDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const m = fs.readFileSync(path.join(__dirname, ".env"), "utf8").match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m);
  if (!m) throw new Error("DATABASE_URL nao definido");
  return m[1];
}

(async () => {
  const URA = {
    matutino: JSON.parse(fs.readFileSync(path.join(__dirname, "urania-mario-braga-2026-11-02.json"), "utf8")).matutino,
    noturno: JSON.parse(fs.readFileSync(path.join(__dirname, "urania-mario-braga-2026-11-02.json"), "utf8")).noturno,
    vespertino: JSON.parse(fs.readFileSync(path.join(__dirname, "urania-mario-braga-tarde-2026-11-03.json"), "utf8")).vespertino,
  };
  const c = new Client({ connectionString: lerDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  console.log(APLICAR ? "MODO: APLICAR\n" : "MODO: DRY-RUN (nada sera alterado)\n");
  const profs = (await c.query("select id, nome, carga_horaria_total from professores where escola_id=$1", [ESCOLA])).rows;
  const turmas = new Map((await c.query("select id, nome, turno from turmas where escola_id=$1", [ESCOLA])).rows.map((t) => [t.id, t]));
  const semTurma = new Set((await c.query("select id from disciplinas where escola_id=$1 and coalesce(sem_turma,false)", [ESCOLA])).rows.map((r) => r.id));
  const slots = (await c.query("select turno, nivel_ensino, numero_aula, hora_inicio::text hora_inicio, duracao_minutos from horario_slots where escola_id=$1", [ESCOLA])).rows;
  // aula da integral -> turno e aula reais (maior sobreposicao), como lib/turno-integral.ts
  const mapaInt = new Map();
  for (const i of slots.filter((s) => s.turno === "integral")) {
    let melhor = null, sob = 0;
    for (const s of slots.filter((s) => TURNOS.includes(s.turno))) {
      const o = Math.min(min(i.hora_inicio) + i.duracao_minutos, min(s.hora_inicio) + s.duracao_minutos) - Math.max(min(i.hora_inicio), min(s.hora_inicio));
      if (o > sob) { sob = o; melhor = { turno: s.turno, aula: s.numero_aula }; }
    }
    if (melhor) mapaInt.set(i.numero_aula, melhor);
  }
  const aulas = (await c.query(`select professor_id, turma_id, disciplina_id, dia_semana, numero_aula from horarios
     where escola_id=$1 and coalesce(versao_grade,'oficial')='oficial'`, [ESCOLA])).rows
    .map((h) => { const t = turmas.get(h.turma_id); const r = t?.turno === "integral" ? mapaInt.get(h.numero_aula) : { turno: t?.turno, aula: h.numero_aula }; return { ...h, turno: r?.turno, aula: r?.aula }; })
    .filter((h) => TURNOS.includes(h.turno));
  const disp = (await c.query("select d.* from disponibilidade_professores d join professores p on p.id=d.professor_id where p.escola_id=$1", [ESCOLA])).rows;

  // exigido x marcado (conflitos.ts: aulas por turno real, sem disciplina "semTurma", carga > 0)
  const faltas = [];
  for (const p of profs.filter((p) => p.carga_horaria_total > 0)) {
    const porTurno = {};
    for (const h of aulas) if (h.professor_id === p.id && !semTurma.has(h.disciplina_id)) porTurno[h.turno] = (porTurno[h.turno] || 0) + 1;
    const exigido = Object.values(porTurno).reduce((s, n) => s + haDoTurno(n), 0);
    const marcadas = disp.filter((d) => d.professor_id === p.id && d.hora_atividade_obrigatoria).length;
    if (exigido > marcadas) faltas.push({ p, exigido, marcadas, falta: exigido - marcadas });
  }
  // numero da aula pelo horario do Urania (manha: Medio/Tecnico tem a 6a)
  const numDoTurno = (turno) => {
    const m = new Map();
    for (const s of slots.filter((s) => s.turno === turno).sort((a) => (a.nivel_ensino === "medio_tecnico" ? -1 : 1))) if (!m.has(hhmm(s.hora_inicio))) m.set(hhmm(s.hora_inicio), s.numero_aula);
    return m;
  };

  const criar = [], trocarBloqueio = [], problemas = [], avisos = [];
  for (const f of faltas) {
    const { p } = f;
    const meus = disp.filter((d) => d.professor_id === p.id);
    const reg = (t, d, a) => meus.find((x) => x.turno === t && x.dia_semana === d && x.horario_slot === a);
    const temAula = (t, d, a) => aulas.some((h) => h.professor_id === p.id && h.turno === t && h.dia_semana === d && h.aula === a);
    const usados = new Set();
    const haNoDia = (t, d) => meus.filter((x) => x.hora_atividade_obrigatoria && x.turno === t && x.dia_semana === d).length + [...usados].filter((k) => k.startsWith(`${t}|${d}|`)).length;
    // ocupado = aula ou HA (ja existente ou escolhida aqui); janela = horario livre entre dois ocupados do dia
    const ocupado = (t, d, a) => temAula(t, d, a) || !!reg(t, d, a)?.hora_atividade_obrigatoria || usados.has(`${t}|${d}|${a}`);
    const aulasDoTurno = (t) => slots.filter((s) => s.turno === t).map((s) => s.numero_aula).filter((v, i, xs) => xs.indexOf(v) === i).sort((a, b) => a - b);
    const fechaJanela = (t, d, a) => { const ns = aulasDoTurno(t); return ns.some((x) => x < a && ocupado(t, d, x)) && ns.some((x) => x > a && ocupado(t, d, x)); };
    const colado = (t, d, a) => ocupado(t, d, a - 1) || ocupado(t, d, a + 1);
    // o que esta no horario hoje decide se pode
    const situacao = (t, d, a) => {
      if (temAula(t, d, a)) return { pode: false };
      const r = reg(t, d, a);
      if (!r) return { pode: true, tipo: "livre" };
      if (r.hora_atividade_obrigatoria) return { pode: false };
      if ((r.motivo || "").includes("(ocupado:")) return { pode: false };
      if (r.disponivel !== false) return { pode: true, tipo: "livre", r };
      if (/^bloqueio \(importado\)$/i.test(r.motivo || "")) return { pode: true, tipo: "bloqueio importado", r };
      if (!(r.motivo || "").trim()) return { pode: true, tipo: "bloqueio sem motivo", r };
      return { pode: false, tipo: `bloqueio "${r.motivo}"` };
    };
    // 1) HA do Urania
    const candU = [];
    for (const t of TURNOS) {
      const nome = Object.keys(URA[t]).find((n) => casaNome(n.replace(/\*/g, ""), p.nome));
      if (!nome) continue;
      const num = numDoTurno(t);
      URA[t][nome].slots.forEach((h, i) => DIAS.forEach((dn, d) => {
        if (!ehHA(URA[t][nome].grade[dn][i])) return;
        const a = num.get(h); if (a == null) return;
        const s = situacao(t, d, a);
        if (s.pode) candU.push({ t, d, a, s, origem: "Urania" });
        else if (s.tipo) avisos.push(`${p.nome}: ${ROT[t]} ${dn} ${a}a e HA no Urania, mas tem ${s.tipo}`);
      }));
    }
    // 2) livre nos dias em que ja tem aula no turno
    const candL = [];
    for (const t of TURNOS) for (let d = 0; d < 5; d++) {
      if (!aulas.some((h) => h.professor_id === p.id && h.turno === t && h.dia_semana === d)) continue;
      for (const a of aulasDoTurno(t)) { const s = situacao(t, d, a); if (s.pode && s.tipo === "livre" && !candU.some((x) => x.t === t && x.d === d && x.a === a)) candL.push({ t, d, a, s, origem: "livre" }); }
    }
    const escolhidas = [];
    const pegar = (lista, regra) => {
      for (;;) {
        if (escolhidas.length >= f.falta) return;
        const ok = lista.filter((x) => !usados.has(`${x.t}|${x.d}|${x.a}`) && haNoDia(x.t, x.d) < MAX_DIA && regra(x));
        const x = ok.find((x) => fechaJanela(x.t, x.d, x.a)) ?? ok.find((x) => colado(x.t, x.d, x.a)) ?? (regra === todos ? ok[0] : undefined);
        if (!x) return;
        x.janela = fechaJanela(x.t, x.d, x.a);
        usados.add(`${x.t}|${x.d}|${x.a}`); escolhidas.push(x);
      }
    };
    const todos = () => true;
    pegar(candU, todos);
    pegar(candL, (x) => x.origem === "livre");
    console.log(`${p.nome}: HA ${f.marcadas} de ${f.exigido}, falta ${f.falta}`);
    for (const x of escolhidas) {
      console.log(`   + ${ROT[x.t]} ${DIAS[x.d]} ${x.a}a  (${x.origem === "Urania" ? "HA no Urania" : "livre, colado nas aulas"}${x.s.tipo !== "livre" ? `; hoje: ${x.s.tipo}` : ""}${x.janela ? "; fecha janela" : ""})`);
      criar.push({ prof: p.id, turno: x.t, d: x.d, a: x.a, motivo: x.origem === "Urania" ? MOTIVO : MOTIVO_SEED });
      if (x.s.r) trocarBloqueio.push({ nome: p.nome, r: x.s.r });
    }
    if (escolhidas.length < f.falta) problemas.push(`${p.nome}: so achei ${escolhidas.length} de ${f.falta} horario(s); o resto continua faltando`);
    console.log("");
  }
  console.log(`Resumo: ${criar.length} HA a lancar para ${faltas.length} professor(es); ${trocarBloqueio.length} delas no lugar de registro que existe hoje (listado acima). Nenhuma HA nem aula existente muda.`);
  if (avisos.length) { console.log(`\nHA do Urania que NAO entram (o horario tem outra coisa):`); avisos.forEach((a) => console.log("  - " + a)); }
  if (problemas.length) { console.log(`\nFica faltando:`); problemas.forEach((a) => console.log("  - " + a)); }
  if (!APLICAR) { console.log("\nDRY-RUN: nada foi alterado. Rode com --aplicar."); await c.end(); return; }
  if (!criar.length) { console.log("Nada a gravar."); await c.end(); return; }

  const pasta = path.join(__dirname, "_arquivo"); if (!fs.existsSync(pasta)) fs.mkdirSync(pasta);
  const arq = path.join(pasta, `backup-ha-faltante-mb-0311-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(arq, JSON.stringify({ disponibilidade: disp.filter((d) => faltas.some((f) => f.p.id === d.professor_id)), criar }, null, 1));
  console.log(`Backup: ${arq}`);
  await c.query("BEGIN");
  try {
    for (const x of criar) await c.query(
      `insert into disponibilidade_professores (professor_id, dia_semana, horario_slot, turno, disponivel, hora_atividade_obrigatoria, motivo)
       values ($1,$2,$3,$4,true,true,$5) on conflict (professor_id, dia_semana, horario_slot, turno)
       do update set disponivel = true, hora_atividade_obrigatoria = true, motivo = excluded.motivo
       where disponibilidade_professores.hora_atividade_obrigatoria = false`, [x.prof, x.d, x.a, x.turno, x.motivo]);
    await c.query("COMMIT");
  } catch (e) { await c.query("ROLLBACK"); throw e; }
  console.log("\nGRAVADO. Rode de novo este script (dry-run) e o ver-conflitos.ts para conferir.");
  await c.end();
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
