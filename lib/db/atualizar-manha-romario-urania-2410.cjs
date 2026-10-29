// [ATUALIZAR-MANHA-ROMARIO-2410] (24/10/2026) Passa a grade OFICIAL da manha do Romario
// para o Urania de 24/10 (urania-manha-romario-2026-10-24.json).
//  - Aulas: so mexe no que mudou (apaga a aula que saiu do lugar e cria a nova).
//    Nao mexe: Joseleine (codocencia), 7a aula da 3STM (assincronas), aulas de quem nao esta no Urania.
//  - Disciplina: a mesma sigla que ja estava certa para aquele professor/turma; senao o vinculo da turma.
//  - HA da manha: cada professor fica com o MESMO numero de HA que tem hoje (ja ajustado a tabela em 21/10),
//    colocadas nos lugares de HA do Urania novo; se faltar lugar, mantem a HA antiga que continua livre.
//  - "A definir" (Geografia 9ME): troca os bloqueios "Importado do sistema anterior" junto com as aulas.
// Uso (na pasta lib\db):  node atualizar-manha-romario-urania-2410.cjs            (dry-run)
//                         node atualizar-manha-romario-urania-2410.cjs --aplicar
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const APLICAR = process.argv.includes("--aplicar");
const ESCOLA = "org_3JxLX0hl4xYxiHbrUIIabRHaAO9";
const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex"];
const ALIAS = {
  JULIANEM: "%juliana m%", FLAVIAAP: "fl_via a%", FRANCILLE: "francielle salome%", NATAL: "%natal%",
  LUIZA: "luiz%", MATEUSZ: "mateus z%", EVBANCODEDADOSMG: "%est_dio%banco%",
  EVMETSISTMG: "%est_dio%an_lise%", EVIRTUAL: "%est_dio%mobile%", GEOGRAFIA: "%geografia%9me%",
};
const IGNORAR = ["RECOMMAT", "JOSELEINE"];
const norm = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const ehHA = (x) => /^H\.?A/i.test(x);
const rot = (d, a) => `${DIAS[d]} ${a}a`;
const K = (d, a) => `${d}-${a}`;

function lerDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const m = fs.readFileSync(".env", "utf8").match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m);
  if (!m) throw new Error("DATABASE_URL nao definido");
  return m[1];
}

(async () => {
  const ura = JSON.parse(fs.readFileSync("urania-manha-romario-2026-10-24.json", "utf8"));
  const c = new Client({ connectionString: lerDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  const profs = (await c.query("select id, nome from professores where escola_id=$1", [ESCOLA])).rows;
  const turmas = (await c.query("select id, nome from turmas where escola_id=$1 and turno='matutino'", [ESCOLA])).rows;
  const turmaPorNome = new Map(turmas.map((t) => [norm(t.nome), t]));
  const aulas = (await c.query(
    `select h.*, t.nome turma from horarios h join turmas t on t.id=h.turma_id
      where h.escola_id=$1 and t.turno='matutino' and coalesce(h.versao_grade,'oficial')='oficial'`, [ESCOLA])).rows;
  const vinc = (await c.query(
    `select td.turma_id, td.disciplina_id, td.professor_id from turma_disciplinas td join turmas t on t.id=td.turma_id
      where t.escola_id=$1 and t.turno='matutino'`, [ESCOLA])).rows;
  const problemas = [];

  // 1) liga professores
  const mapa = {};
  for (const nome of Object.keys(ura)) {
    const k = norm(nome);
    if (IGNORAR.includes(k)) continue;
    let ps = profs.filter((p) => norm(p.nome) === k);
    if (!ps.length && ALIAS[k]) ps = (await c.query("select id, nome from professores where escola_id=$1 and nome ilike $2", [ESCOLA, ALIAS[k]])).rows;
    if (!ps.length) ps = profs.filter((p) => norm(p.nome).startsWith(k) || k.startsWith(norm(p.nome)));
    if (ps.length > 1) { const s = ps.filter((p) => !/\(/.test(p.nome)); if (s.length === 1) ps = s; }
    if (ps.length === 1) mapa[nome] = ps[0]; else problemas.push(`professor ${nome}: ${ps.length} cadastros (${ps.map((p) => p.nome).join(" | ")}) - fica de fora`);
  }
  const idsMexer = new Set(Object.values(mapa).map((p) => p.id));
  const disp = (await c.query(
    `select * from disponibilidade_professores where professor_id = any($1) and turno='matutino'`, [[...idsMexer]])).rows;

  // 2) sigla -> disciplina (pelas celulas que ja estao certas)
  const sigla = new Map();
  for (const [nome, p] of Object.entries(mapa)) for (let d = 0; d < 5; d++) for (let a = 1; a <= 6; a++) {
    const u = ura[nome].grade[DIAS[d]][a - 1] || "";
    if (!u.includes("/")) continue;
    const [tu, sg] = u.split("/");
    const h = aulas.find((x) => x.professor_id === p.id && x.dia_semana === d && x.numero_aula === a && norm(x.turma) === norm(tu));
    if (!h) continue;
    const k = `${p.id}|${norm(tu)}|${norm(sg)}`;
    const cont = sigla.get(k) || new Map();
    cont.set(h.disciplina_id, (cont.get(h.disciplina_id) || 0) + 1);
    sigla.set(k, cont);
  }
  // fica a disciplina que mais aparece para a sigla; se duas siglas do mesmo professor/turma
  // cairem na mesma disciplina, a de menos votos perde (resolve pelo vinculo abaixo)
  const escolha = new Map();
  const porPT = new Map();
  for (const [k, cont] of sigla) {
    const [disc, n] = [...cont].sort((x, y) => y[1] - x[1])[0];
    const pt = k.split("|").slice(0, 2).join("|");
    porPT.set(pt, [...(porPT.get(pt) || []), { k, disc, n }]);
  }
  for (const [, xs] of porPT) {
    const usadas = new Set();
    for (const x of xs.sort((a, b) => b.n - a.n)) if (!usadas.has(x.disc)) { escolha.set(x.k, x.disc); usadas.add(x.disc); }
  }

  // 3) grade alvo dos professores do Urania
  const alvo = []; // {prof, turma, disc, d, a}
  const alvoSlotsProf = new Map();
  for (const [nome, p] of Object.entries(mapa)) {
    const ocup = new Set();
    for (let d = 0; d < 5; d++) for (let a = 1; a <= 6; a++) {
      const u = ura[nome].grade[DIAS[d]][a - 1] || "";
      if (!u.includes("/")) continue;
      const [tu, sg] = u.split("/");
      const t = turmaPorNome.get(norm(tu));
      if (!t) { problemas.push(`${p.nome} ${rot(d, a)}: turma ${tu} nao existe na manha`); continue; }
      let disc = escolha.get(`${p.id}|${norm(tu)}|${norm(sg)}`);
      if (!disc) {
        // disciplinas do professor nessa turma que nenhuma outra sigla ja usa
        const outras = new Set([...escolha].filter(([k]) => k.startsWith(`${p.id}|${norm(tu)}|`)).map(([, v]) => v));
        const ds = [...new Set(vinc.filter((v) => v.turma_id === t.id && v.professor_id === p.id).map((v) => v.disciplina_id))].filter((x) => !outras.has(x));
        const da = [...new Set(aulas.filter((x) => x.turma_id === t.id && x.professor_id === p.id).map((x) => x.disciplina_id))].filter((x) => !outras.has(x));
        disc = ds.length === 1 ? ds[0] : da.length === 1 ? da[0] : null;
      }
      if (!disc) { problemas.push(`${p.nome} ${rot(d, a)}: nao achei a disciplina de ${u}`); continue; }
      alvo.push({ prof: p.id, turma: t.id, turmaNome: t.nome, disc, d, a });
      ocup.add(K(d, a));
    }
    alvoSlotsProf.set(p.id, ocup);
  }

  // 4) diferenca de aulas (so professores ligados, sem a 7a aula)
  const atuais = aulas.filter((h) => idsMexer.has(h.professor_id) && h.numero_aula <= 6);
  const chave = (x) => `${x.professor_id ?? x.prof}|${x.turma_id ?? x.turma}|${x.disciplina_id ?? x.disc}|${x.dia_semana ?? x.d}|${x.numero_aula ?? x.a}`;
  const setAlvo = new Set(alvo.map(chave));
  const setAtual = new Set(atuais.map(chave));
  const apagar = atuais.filter((h) => !setAlvo.has(chave(h)));
  const criar = alvo.filter((x) => !setAtual.has(chave(x)));

  // turma com 2 aulas no mesmo horario depois da troca (fora codocencia/assincrona)
  const depois = [...aulas.filter((h) => !apagar.includes(h)).map((h) => ({ turma: h.turma_id, nome: h.turma, d: h.dia_semana, a: h.numero_aula, prof: h.professor_id, disc: h.disciplina_id, assinc: h.assincrona })),
    ...criar.map((x) => ({ turma: x.turma, nome: x.turmaNome, d: x.d, a: x.a, prof: x.prof, disc: x.disc }))];
  const porTurma = new Map();
  for (const x of depois) { if (x.assinc) continue; const k = `${x.turma}|${x.d}|${x.a}`; porTurma.set(k, [...(porTurma.get(k) || []), x]); }
  for (const [, xs] of porTurma) if (new Set(xs.map((x) => x.disc)).size > 1)
    problemas.push(`turma ${xs[0].nome} ${rot(xs[0].d, xs[0].a)}: ${xs.length} aulas de disciplinas diferentes (${xs.map((x) => profs.find((p) => p.id === x.prof)?.nome).join(", ")})`);

  // 5) HA e bloqueios da manha
  const haApagar = [], haCriar = [], bloqApagar = [], bloqCriar = [], resumoHA = [];
  for (const [nome, p] of Object.entries(mapa)) {
    const ocup = alvoSlotsProf.get(p.id);
    const meus = disp.filter((x) => x.professor_id === p.id);
    const haAtual = meus.filter((x) => x.hora_atividade_obrigatoria);
    const outrosBloq = meus.filter((x) => !x.hora_atividade_obrigatoria && x.disponivel === false);
    const bloqEm = (d, a) => outrosBloq.filter((x) => x.dia_semana === d && x.horario_slot === a);
    // aula nova em cima de bloqueio
    for (const s of ocup) {
      const [d, a] = s.split("-").map(Number);
      for (const b of bloqEm(d, a)) {
        if (/^Importado do sistema anterior/i.test(b.motivo || "")) bloqApagar.push({ b, prof: p.nome });
        else problemas.push(`${p.nome} ${rot(d, a)}: aula nova em cima do bloqueio "${b.motivo || "indisponivel"}"`);
      }
    }
    // traco do Urania sem bloqueio e sem aula
    for (let d = 0; d < 5; d++) for (let a = 1; a <= 6; a++) {
      const u = ura[nome].grade[DIAS[d]][a - 1] || "";
      if (u === "---" && !ocup.has(K(d, a)) && !bloqEm(d, a).length && !haAtual.some((x) => x.dia_semana === d && x.horario_slot === a))
        bloqCriar.push({ prof: p.id, nomeProf: p.nome, d, a, motivo: "Importado do sistema anterior (indisponível)" });
    }
    // HA: mesmo numero de hoje, nos lugares do Urania novo
    const N = haAtual.length;
    const livre = (d, a) => !ocup.has(K(d, a)) && !bloqEm(d, a).length;
    const uraHA = [];
    for (let d = 0; d < 5; d++) for (let a = 1; a <= 6; a++) if (ehHA(ura[nome].grade[DIAS[d]][a - 1] || "") && livre(d, a)) uraHA.push(K(d, a));
    const atualK = haAtual.map((x) => K(x.dia_semana, x.horario_slot));
    const final = [];
    for (const k of uraHA) if (atualK.includes(k) && final.length < N) final.push(k);
    for (const k of uraHA) if (!final.includes(k) && final.length < N) final.push(k);
    for (const k of atualK) { const [d, a] = k.split("-").map(Number); if (!final.includes(k) && final.length < N && livre(d, a)) final.push(k); }
    if (final.length < N) problemas.push(`${p.nome}: ${N - final.length} HA da manha sem lugar livre`);
    const sai = haAtual.filter((x) => !final.includes(K(x.dia_semana, x.horario_slot)));
    const entra = final.filter((k) => !atualK.includes(k));
    const modelo = haAtual[0];
    for (const x of sai) haApagar.push(x);
    for (const k of entra) { const [d, a] = k.split("-").map(Number); haCriar.push({ prof: p.id, d, a, motivo: modelo?.motivo ?? "Hora-atividade" }); }
    if (sai.length || entra.length) resumoHA.push(`  ${p.nome.padEnd(24)} HA ${N}: sai ${sai.map((x) => rot(x.dia_semana, x.horario_slot)).join(", ") || "-"} | entra ${entra.map((k) => rot(...k.split("-").map(Number))).join(", ") || "-"}`);
  }

  // 6) relatorio
  const nomeP = (id) => profs.find((p) => p.id === id)?.nome ?? id;
  const discNomes = new Map((await c.query("select id, nome from disciplinas where id = any($1)", [[...new Set([...apagar.map((h) => h.disciplina_id), ...criar.map((x) => x.disc)])]])).rows.map((r) => [r.id, r.nome]));
  const trocaDisc = criar.filter((x) => apagar.some((h) => h.professor_id === x.prof && h.turma_id === x.turma && h.dia_semana === x.d && h.numero_aula === x.a));
  if (trocaDisc.length) {
    console.log(`== Mesmo professor, turma e horario, mas DISCIPLINA diferente (${trocaDisc.length}) - conferir:`);
    for (const x of trocaDisc) {
      const h = apagar.find((h) => h.professor_id === x.prof && h.turma_id === x.turma && h.dia_semana === x.d && h.numero_aula === x.a);
      console.log(`  ${String(nomeP(x.prof)).padEnd(24)} ${rot(x.d, x.a)} ${x.turmaNome}: ${discNomes.get(h.disciplina_id)} -> ${discNomes.get(x.disc)}  (Urania: ${ura[Object.keys(mapa).find((n) => mapa[n].id === x.prof)].grade[DIAS[x.d]][x.a - 1]})`);
    }
    console.log("");
  }
  const porProf = new Map();
  for (const h of apagar) porProf.set(h.professor_id, [...(porProf.get(h.professor_id) || []), `-${rot(h.dia_semana, h.numero_aula)} ${h.turma}`]);
  for (const x of criar) porProf.set(x.prof, [...(porProf.get(x.prof) || []), `+${rot(x.d, x.a)} ${x.turmaNome}`]);
  console.log(`== AULAS: ${apagar.length} saem do lugar, ${criar.length} entram (${porProf.size} professores)`);
  for (const [id, l] of porProf) console.log(`  ${String(nomeP(id)).padEnd(24)} ${l.join("  ")}`);
  console.log(`\n== HA da manha: ${haApagar.length} saem, ${haCriar.length} entram`);
  resumoHA.forEach((l) => console.log(l));
  console.log(`\n== Bloqueios "Importado do sistema anterior": ${bloqApagar.length} saem, ${bloqCriar.length} entram`);
  for (const b of bloqApagar) console.log(`  - ${b.prof} ${rot(b.b.dia_semana, b.b.horario_slot)}`);
  for (const b of bloqCriar) console.log(`  + ${b.nomeProf} ${rot(b.d, b.a)}`);
  if (problemas.length) { console.log(`\nATENCAO (${problemas.length}):`); problemas.forEach((p) => console.log("  - " + p)); }
  const totalDepois = aulas.length - apagar.length + criar.length;
  console.log(`\nAulas da manha: hoje ${aulas.length} -> depois ${totalDepois}`);
  if (!APLICAR) { console.log("\nDRY-RUN: nada foi alterado. Rode com --aplicar."); await c.end(); return; }
  if (problemas.length) { console.log("\nNAO GRAVADO: resolva os itens de ATENCAO antes."); await c.end(); return; }

  const pasta = path.join(__dirname, "_arquivo"); if (!fs.existsSync(pasta)) fs.mkdirSync(pasta);
  const arq = path.join(pasta, `backup-manha-romario-2410-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(arq, JSON.stringify({ horariosManha: aulas, disponibilidadeManha: disp }, null, 1));
  console.log(`Backup: ${arq}`);
  await c.query("BEGIN");
  try {
    if (apagar.length) await c.query("delete from horarios where id = any($1)", [apagar.map((h) => h.id)]);
    for (const x of criar) await c.query(
      `insert into horarios (escola_id, turma_id, disciplina_id, professor_id, dia_semana, numero_aula, versao_grade)
       values ($1,$2,$3,$4,$5,$6,'oficial')`, [ESCOLA, x.turma, x.disc, x.prof, x.d, x.a]);
    const del = [...haApagar.map((x) => x.id), ...bloqApagar.map((b) => b.b.id)];
    if (del.length) await c.query("delete from disponibilidade_professores where id = any($1)", [del]);
    for (const x of haCriar) await c.query(
      `insert into disponibilidade_professores (professor_id, dia_semana, horario_slot, disponivel, motivo, turno, hora_atividade_obrigatoria)
       values ($1,$2,$3,false,$4,'matutino',true)`, [x.prof, x.d, x.a, x.motivo]);
    for (const x of bloqCriar) await c.query(
      `insert into disponibilidade_professores (professor_id, dia_semana, horario_slot, disponivel, motivo, turno, hora_atividade_obrigatoria)
       values ($1,$2,$3,false,$4,'matutino',false)`, [x.prof, x.d, x.a, x.motivo]);
    await c.query("COMMIT");
  } catch (e) { await c.query("ROLLBACK"); throw e; }
  console.log("\nGRAVADO. Rode de novo o comparar-urania-manha-romario.cjs para conferir.");
  await c.end();
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
