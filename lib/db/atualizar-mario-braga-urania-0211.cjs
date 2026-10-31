// [ATUALIZAR-MARIO-BRAGA-0211] (31/10/2026) Passa a grade OFICIAL do C.E. Prof. Mario Braga para o
// Urania da semana 02 a 06/11/2026 (Relatorio de Professores: manha, tarde e noite), lido dos PDFs
// pelas coordenadas em urania-mario-braga-2026-11-02.json.
//  - Aulas: so mexe no que mudou (apaga a aula que saiu do lugar e cria a nova), so nas turmas que
//    aparecem no relatorio daquele turno e so para os professores encontrados no cadastro.
//    Nao mexe: aulas assincronas, turmas fantasma (PAEE), hibridas (HIBRIDA-*), marcadores
//    (COORD, FORM, PAC, IF-2B, 2B*...), professores fora do Urania.
//  - Turma integral (1ME DOC): o relatorio da manha traz as aulas da manha dela (convertidas para a
//    numeracao do integral); as da tarde nao estao no Urania e ficam como estao.
//  - Numero da aula pelo horario de inicio do esquema de cada turno (noite: 18:00 e a entrada).
//  - Disciplina: a mesma que ja estava certa para aquele professor/turma/sigla; senao o vinculo da turma.
//  - HA: cada professor fica com o MESMO numero de HA de hoje no turno (regra SEED de 21/10), nos lugares
//    de HA/HA* do Urania; so muda de lugar HA movel (importada/automatica). HA manual/fixa/probatorio fica.
//  - Traco (---) do Urania sem aula, sem HA e sem bloqueio vira "Bloqueio (importado)"; bloqueio importado
//    que ficar debaixo de aula nova sai.
//  - Para (nao grava) se sobrar qualquer item de ATENCAO: professor em duas aulas no mesmo horario real,
//    turma com duas disciplinas no mesmo horario, aula fixa que sairia do lugar, aula nova sobre bloqueio manual.
// Uso (na pasta lib\db):  node atualizar-mario-braga-urania-0211.cjs            (dry-run)
//                         node atualizar-mario-braga-urania-0211.cjs --aplicar  (backup em _arquivo + grava)
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const APLICAR = process.argv.includes("--aplicar");
const ESCOLA = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";
const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex"];
const TURNOS = ["matutino", "vespertino", "noturno"];
const ROT = { matutino: "Manha", vespertino: "Tarde", noturno: "Noite", integral: "Integral" };
const MOTIVO_HA = "Importado do sistema anterior 02-06/11 (HA)";
const MOTIVO_BLQ = "Bloqueio (importado)";
const ALIAS = {}; // nome do Urania (normalizado) -> trecho do nome no cadastro (ilike), se precisar
const IGNORAR = [/^HIBRIDA/];
const HA_PELO_URANIA = new Set([652]); // Mario: reativado em 31/10, sem HA cadastrada na tarde
const norm = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const ehHA = (x) => /^H\.?A\.?\*?$/i.test(x);
const ehAula = (x) => x.includes("/");
// mesma regra dos scripts de HA (simular-ha-*.ts): automatica (inclusive "HA de outro turno") ou importada
const movel = (m) => !!m && (/^hora-atividade institucional \(recalculada/i.test(m) || /^importado do (sistema anterior|ur[aâ]nia)/i.test(m));
const blqImportado = (m) => /^bloqueio \(importado\)$/i.test(m || "") || /^importado do sistema anterior.*indispon/i.test(m || "");
const min = (h) => { const [a, b] = String(h).split(":").map(Number); return a * 60 + b; };
const hhmm = (h) => String(h).slice(0, 5);
const rot = (d, a) => `${DIAS[d]} ${a}a`;
// o relatorio e longo: alem da tela, vai inteiro para _arquivo/relatorio-urania-0211.txt
const RELATORIO = path.join(__dirname, "_arquivo", "relatorio-urania-0211.txt");
const linhasRel = [];
const logOriginal = console.log;
console.log = (...a) => { linhasRel.push(a.join(" ")); logOriginal(...a); };
process.on("exit", () => {
  try { fs.mkdirSync(path.dirname(RELATORIO), { recursive: true }); fs.writeFileSync(RELATORIO, linhasRel.join("\r\n"), "utf8"); logOriginal(`\nRelatorio completo: ${RELATORIO}`); } catch { /* sem relatorio */ }
});

function lerDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const m = fs.readFileSync(path.join(__dirname, ".env"), "utf8").match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m);
  if (!m) throw new Error("DATABASE_URL nao definido");
  return m[1];
}

// mesmo calculo de artifacts/api-server/src/lib/turno-integral.ts: aula do integral -> aula real de maior sobreposicao
function mapaIntegral(slots) {
  const integral = slots.filter((s) => s.turno === "integral" && s.numero_aula >= 1);
  const cand = [];
  for (const t of TURNOS) {
    const doTurno = slots.filter((s) => s.turno === t && s.numero_aula >= 1 && s.letivo !== false);
    const pref = t === "matutino"
      ? (doTurno.some((s) => s.nivel_ensino === "medio_tecnico") ? doTurno.filter((s) => s.nivel_ensino === "medio_tecnico") : doTurno)
      : doTurno;
    cand.push(...pref);
  }
  const m = new Map();
  for (const i of integral) {
    const ini = min(i.hora_inicio), fim = ini + i.duracao_minutos;
    let melhor = null, sob = 0;
    for (const c of cand) {
      const ci = min(c.hora_inicio), cf = ci + c.duracao_minutos;
      const s = Math.min(fim, cf) - Math.max(ini, ci);
      if (s > sob) { sob = s; melhor = c; }
    }
    if (melhor) m.set(i.numero_aula, { turno: melhor.turno, aula: melhor.numero_aula });
  }
  return m;
}

(async () => {
  const URA = JSON.parse(fs.readFileSync(path.join(__dirname, "urania-mario-braga-2026-11-02.json"), "utf8"));
  const c = new Client({ connectionString: lerDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  console.log(APLICAR ? "MODO: APLICAR\n" : "MODO: DRY-RUN (nada sera alterado)\n");
  // todos os professores (ativo primeiro): ha aula de professor marcado inativo na grade
  const profs = (await c.query("select id, nome, ativo from professores where escola_id=$1 order by ativo desc, id", [ESCOLA])).rows;
  // nome do Urania x cadastro por PALAVRA ("ANDRE" nao e "Andreia"; "ANTONIO SILVA" = "Antonio Carlos da Silva";
  // "FRANCIELLE S." = "Francielle Salome")
  const palavras = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  const casaNome = (u, p) => {
    const a = palavras(u), b = palavras(p);
    if (!a.length || !b.length || a[0] !== b[0]) return false;
    let j = 1;
    for (const w of a.slice(1)) {
      while (j < b.length && !(b[j] === w || (w.length <= 2 && b[j].startsWith(w)))) j++;
      if (j >= b.length) return false;
      j++;
    }
    return true;
  };
  const turmas = (await c.query("select id, nome, turno, coalesce(fantasma,false) fantasma from turmas where escola_id=$1", [ESCOLA])).rows;
  const turmaPorId = new Map(turmas.map((t) => [t.id, t]));
  const slots = (await c.query("select turno, nivel_ensino, numero_aula, hora_inicio::text hora_inicio, duracao_minutos, letivo from horario_slots where escola_id=$1", [ESCOLA])).rows;
  const mapaInt = mapaIntegral(slots);
  const intDoReal = new Map([...mapaInt].map(([n, r]) => [`${r.turno}|${r.aula}`, n])); // "matutino|3" -> 3
  const aulas = (await c.query(
    `select h.* from horarios h join turmas t on t.id=h.turma_id
      where h.escola_id=$1 and coalesce(h.versao_grade,'oficial')='oficial'`, [ESCOLA])).rows;
  const vinc = (await c.query(
    `select td.turma_id, td.disciplina_id, td.professor_id, td.professor_apoio_id, td.grupo_trio from turma_disciplinas td
       join turmas t on t.id=td.turma_id where t.escola_id=$1`, [ESCOLA])).rows;
  const disp = (await c.query(
    "select * from disponibilidade_professores where professor_id = any($1)", [profs.map((p) => p.id)])).rows;
  const discNome = new Map((await c.query("select id, nome from disciplinas where escola_id=$1", [ESCOLA])).rows.map((r) => [r.id, r.nome]));
  const nomeP = (id) => profs.find((p) => p.id === id)?.nome ?? `#${id}`;
  const realDe = (h) => { const t = turmaPorId.get(h.turma_id); if (t?.turno !== "integral") return { turno: t?.turno, aula: h.numero_aula }; return mapaInt.get(h.numero_aula) ?? { turno: "integral", aula: h.numero_aula }; };

  const problemas = [];
  const apagar = [], criar = [], haApagar = [], haCriar = [], blqApagar = [], blqCriar = [];
  const resumoHA = [], resumoAulas = [], semCadastro = [], avisos = [], trocaVinculo = [], reativar = new Map(), cedeuAoUrania = [];

  for (const turno of TURNOS) {
    const ura = URA[turno];
    // numero da aula pelo horario de inicio (matutino: Medio/Tecnico tem a 6a aula)
    const doTurno = slots.filter((s) => s.turno === turno);
    const aulaDaHora = new Map();
    for (const s of doTurno.sort((a, b) => (a.nivel_ensino === "medio_tecnico" ? -1 : 1))) if (!aulaDaHora.has(hhmm(s.hora_inicio))) aulaDaHora.set(hhmm(s.hora_inicio), s.numero_aula);
    const horasUra = Object.values(ura)[0].slots;
    const NUM = horasUra.map((h) => aulaDaHora.get(h));
    if (NUM.some((n) => n == null)) { problemas.push(`${ROT[turno]}: horario do Urania sem aula no esquema (${horasUra.filter((h, i) => NUM[i] == null).join(", ")})`); continue; }

    // turmas que aparecem no Urania deste turno
    const nomesUra = new Set();
    for (const v of Object.values(ura)) for (const d of DIAS) for (const x of v.grade[d]) if (ehAula(x)) nomesUra.add(norm(x.split("/")[0]));
    const turmaPorNome = new Map();
    for (const t of turmas) if (!t.fantasma && (t.turno === turno || t.turno === "integral") && nomesUra.has(norm(t.nome))) turmaPorNome.set(norm(t.nome), t);
    for (const n of nomesUra) if (!turmaPorNome.has(n)) problemas.push(`${ROT[turno]}: turma ${n} do Urania nao existe no cadastro`);
    const turmasUra = new Set([...turmaPorNome.values()].map((t) => t.id));
    // aula do banco para (turma, aula do turno): integral convertida
    const aulaNaTurma = (t, a) => (t.turno === "integral" ? intDoReal.get(`${turno}|${a}`) : a);

    // 1) professores
    const mapa = {};
    for (const nome of Object.keys(ura)) {
      if (IGNORAR.some((r) => r.test(nome))) continue;
      const limpo = nome.replace(/\*/g, "");
      const k = norm(limpo);
      let ps = profs.filter((p) => norm(p.nome) === k);
      if (!ps.length && ALIAS[k]) ps = profs.filter((p) => p.nome.toLowerCase().includes(ALIAS[k]));
      if (!ps.length) ps = profs.filter((p) => casaNome(limpo, p.nome));
      if (ps.length > 1) { const s = ps.filter((p) => p.ativo); if (s.length >= 1) ps = s; }
      if (ps.length > 1) { const s = ps.filter((p) => !/\(/.test(p.nome)); if (s.length === 1) ps = s; }
      const temAula = DIAS.some((d) => ura[nome].grade[d].some(ehAula));
      // [decisao 31/10] professor inativo com aula no Urania volta a ficar ativo
      if (ps.length === 1 && !ps[0].ativo && temAula) reativar.set(ps[0].id, ps[0].nome);
      if (ps.length === 1) mapa[nome] = ps[0];
      else if (temAula) problemas.push(`${ROT[turno]}: professor ${nome} - ${ps.length} cadastros (${ps.map((p) => p.nome).join(" | ") || "nenhum"}), fica de fora`);
      else semCadastro.push(`${ROT[turno]} ${nome}`);
    }
    const ids = new Set(Object.values(mapa).map((p) => p.id));

    // aulas hibridas (HIBRIDA-1NB etc. no Urania): ficam como estao, nao entram na comparacao
    const hibridas = new Set();
    for (const [nome, v] of Object.entries(ura)) if (/^HIBRIDA/.test(nome)) for (let d = 0; d < 5; d++) NUM.forEach((a, i) => {
      const u = v.grade[DIAS[d]][i] || ""; if (!ehAula(u)) return;
      const t = turmaPorNome.get(norm(u.split("/")[0])); if (t) hibridas.add(`${t.id}|${d}|${aulaNaTurma(t, a)}`);
    });
    // aulas atuais comparaveis: professor do Urania, turma do Urania, horario do turno, nao assincrona, nao hibrida
    const atuais = aulas.filter((h) => ids.has(h.professor_id) && turmasUra.has(h.turma_id) && !h.assincrona && realDe(h).turno === turno
      && !hibridas.has(`${h.turma_id}|${h.dia_semana}|${h.numero_aula}`));

    // 2) sigla -> disciplina pelas celulas que ja estao certas
    const voto = new Map();
    for (const [nome, p] of Object.entries(mapa)) for (let d = 0; d < 5; d++) NUM.forEach((a, i) => {
      const u = ura[nome].grade[DIAS[d]][i] || "";
      if (!ehAula(u)) return;
      const [tu, sg] = u.split("/");
      const t = turmaPorNome.get(norm(tu)); if (!t) return;
      const h = atuais.find((x) => x.professor_id === p.id && x.turma_id === t.id && x.dia_semana === d && x.numero_aula === aulaNaTurma(t, a));
      if (!h) return;
      const k = `${p.id}|${t.id}|${norm(sg)}`;
      const m = voto.get(k) || new Map(); m.set(h.disciplina_id, (m.get(h.disciplina_id) || 0) + 1); voto.set(k, m);
    });
    const escolha = new Map(); const porPT = new Map();
    for (const [k, m] of voto) { const [disc, n] = [...m].sort((x, y) => y[1] - x[1])[0]; const pt = k.split("|").slice(0, 2).join("|"); porPT.set(pt, [...(porPT.get(pt) || []), { k, disc, n }]); }
    for (const [, xs] of porPT) { const usadas = new Set(); for (const x of xs.sort((a, b) => b.n - a.n)) if (!usadas.has(x.disc)) { escolha.set(x.k, x.disc); usadas.add(x.disc); } }
    // a mesma sigla no turno inteiro (outros professores/turmas): "GEO" e Geografia em toda parte
    const votoSigla = new Map();
    for (const [k, m] of voto) { const sg = k.split("|")[2]; const g = votoSigla.get(sg) || new Map(); for (const [disc, n] of m) g.set(disc, (g.get(disc) || 0) + n); votoSigla.set(sg, g); }
    // semelhanca sigla x nome ("RISAMB" ~ "Riscos Ambientais"): letras da sigla em ordem, valendo mais no inicio das palavras
    const PARADA = new Set(["DE", "DA", "DO", "DAS", "DOS", "E", "EM", "A", "O", "NA", "NO", "PARA"]);
    // melhor encaixe (nao o primeiro): "INGL" casa com "INGLesa" (inicio da palavra) e nao com "lINGua" + "Leitura"
    const parecida = (sigla, nome) => {
      const s = norm(sigla).replace(/\d+/g, ""), ws = palavras(nome).filter((w) => !PARADA.has(w));
      const memo = new Map();
      const melhor = (i, w, j) => {
        if (i === s.length) return 0;
        if (w >= ws.length) return -Infinity;
        const k = `${i}|${w}|${j}`; if (memo.has(k)) return memo.get(k);
        let r = melhor(i, w + 1, 0); // pula o resto da palavra
        if (j < ws[w].length) {
          r = Math.max(r, melhor(i, w, j + 1)); // pula a letra
          if (s[i] === ws[w][j]) r = Math.max(r, (j === 0 ? 3 : 1) + melhor(i + 1, w, j + 1)); // usa a letra (inicio de palavra vale mais)
        }
        memo.set(k, r); return r;
      };
      const r = s.length ? melhor(0, 0, 0) : 0;
      return Number.isFinite(r) ? r : 0;
    };
    const escolherPorSigla = (sg, cands) => {
      const g = votoSigla.get(norm(sg));
      if (g) { const v = cands.map((d) => [d, g.get(d) || 0]).sort((a, b) => b[1] - a[1]); if (v.length && v[0][1] > 0 && (v.length === 1 || v[0][1] > v[1][1])) return v[0][0]; }
      const p = cands.map((d) => [d, parecida(sg, discNome.get(d))]).sort((a, b) => b[1] - a[1]);
      if (p.length && p[0][1] > 0 && (p.length === 1 || p[0][1] > p[1][1])) return p[0][0];
      return null;
    };

    // 3) grade alvo
    const alvo = []; const ocupProf = new Map(); const porNome = new Map();
    for (const [nome, p] of Object.entries(mapa)) {
      const ocup = new Set();
      for (let d = 0; d < 5; d++) NUM.forEach((a, i) => {
        const u = ura[nome].grade[DIAS[d]][i] || "";
        if (!ehAula(u)) return;
        const [tu, sg] = u.split("/");
        const t = turmaPorNome.get(norm(tu)); if (!t) return;
        const aT = aulaNaTurma(t, a);
        if (aT == null) { problemas.push(`${p.nome} ${rot(d, a)} ${ROT[turno]}: ${tu} (integral) sem aula equivalente`); return; }
        // [correcao 31/10] professor com MAIS de uma disciplina na turma: decide primeiro pela semelhanca da sigla com o
        // nome da disciplina (OTPED = Organizacao do Trabalho Pedagogico; BIO = Biologia). A "pista" da celula que ja
        // estava certa enganava quando quase toda a grade mudou de lugar (caia em outra disciplina do mesmo professor).
        const chaveSg = `${p.id}|${t.id}|${norm(sg)}`;
        const dvTodas = [...new Set(vinc.filter((v) => v.turma_id === t.id && (v.professor_id === p.id || v.professor_apoio_id === p.id)).map((v) => v.disciplina_id))];
        let disc = dvTodas.length === 1 ? dvTodas[0] : null;
        // so manha e tarde: a noite ja estava igual ao Urania (26/10) e la a pista da celula certa e exata
        // (pelo nome, "SOCIO" iria para a disciplina do itinerario e Fisica II/III se trocariam)
        if (!disc && dvTodas.length > 1 && turno !== "noturno" && !porNome.has(chaveSg)) {
          // todas as siglas deste professor nesta turma, decididas juntas
          const siglas = new Set();
          for (const dd of DIAS) for (const x of ura[nome].grade[dd]) if (ehAula(x) && norm(x.split("/")[0]) === norm(tu)) siglas.add(x.split("/")[1]);
          const decidida = new Map(), nota = new Map();
          for (const s of siglas) {
            // empate: fica o nome mais curto, que a sigla abrevia por inteiro (ARTE = Arte, nao Arte Paranaense)
            const pts = dvTodas.map((x) => [x, parecida(s, discNome.get(x)) - norm(discNome.get(x)).length / 1000]).sort((a, b) => b[1] - a[1]);
            const ok = pts[0][1] > 0.5 && pts[0][1] > (pts[1]?.[1] ?? 0);
            decidida.set(s, ok ? pts[0][0] : null); nota.set(s, ok ? pts[0][1] : 0);
          }
          // duas siglas na mesma disciplina: fica a mais parecida; a outra vai para a regra da que sobrou
          for (const s of siglas) for (const o of siglas) if (s !== o && decidida.get(s) && decidida.get(s) === decidida.get(o))
            decidida.set(nota.get(s) >= nota.get(o) ? o : s, null);
          // a sigla que nao lembra nenhum nome fica com a disciplina que sobrou (LRPORT = Lingua Portuguesa quando INGL ja e Ingles)
          const semNome = [...siglas].filter((s) => !decidida.get(s));
          const sobra = dvTodas.filter((x) => ![...decidida.values()].includes(x));
          if (semNome.length === 1 && sobra.length === 1) decidida.set(semNome[0], sobra[0]);
          for (const [s, x] of decidida) porNome.set(`${p.id}|${t.id}|${norm(s)}`, x);
        }
        if (!disc && porNome.get(chaveSg)) disc = porNome.get(chaveSg);
        if (!disc) disc = escolha.get(chaveSg) ?? null;
        if (!disc) {
          const outras = new Set([...escolha].filter(([k]) => k.startsWith(`${p.id}|${t.id}|`)).map(([, v]) => v));
          const dv = dvTodas.filter((x) => !outras.has(x));
          const da = [...new Set(atuais.filter((x) => x.turma_id === t.id && x.professor_id === p.id).map((x) => x.disciplina_id))].filter((x) => !outras.has(x));
          disc = dv.length === 1 ? dv[0] : da.length === 1 ? da[0] : escolherPorSigla(sg, dv.length ? dv : da);
          // [decisao 31/10] professor sem vinculo nessa disciplina da turma (ex.: Mario x Historia da tarde, hoje com a
          // Emanuele): o vinculo passa para quem da a aula no Urania, se o professor de hoje nao der essa sigla la
          if (!disc && !dv.length && !da.length) {
            const daTurma = [...new Set(vinc.filter((v) => v.turma_id === t.id).map((v) => v.disciplina_id))];
            const dt = escolherPorSigla(sg, daTurma);
            const v = dt && vinc.find((x) => x.turma_id === t.id && x.disciplina_id === dt);
            const donoNome = v && Object.keys(mapa).find((n) => mapa[n].id === v.professor_id);
            const donoDaSigla = donoNome && DIAS.some((dd) => ura[donoNome].grade[dd].some((x) => ehAula(x) && norm(x.split("/")[0]) === norm(tu) && norm(x.split("/")[1]) === norm(sg)));
            if (v && !donoDaSigla) {
              disc = dt;
              if (!trocaVinculo.some((x) => x.turma === t.id && x.disc === dt)) trocaVinculo.push({ turma: t.id, turmaNome: t.nome, disc: dt, de: v.professor_id, para: p.id });
              v.professor_id = p.id;
            }
          }
          if (disc) escolha.set(`${p.id}|${t.id}|${norm(sg)}`, disc); // a mesma sigla fica na mesma disciplina nas outras celulas
        }
        if (!disc) { problemas.push(`${p.nome} ${rot(d, a)} ${ROT[turno]}: nao achei a disciplina de ${u}`); return; }
        alvo.push({ turno, prof: p.id, turma: t.id, turmaNome: t.nome, disc, d, a: aT, aReal: a });
        ocup.add(`${d}-${a}`);
      });
      ocupProf.set(p.id, ocup);
    }

    // 4) diferenca
    const chave = (x) => `${x.professor_id ?? x.prof}|${x.turma_id ?? x.turma}|${x.disciplina_id ?? x.disc}|${x.dia_semana ?? x.d}|${x.numero_aula ?? x.a}`;
    const setAlvo = new Set(alvo.map(chave)), setAtual = new Set(atuais.map(chave));
    const sai = atuais.filter((h) => !setAlvo.has(chave(h)));
    const entra = alvo.filter((x) => !setAtual.has(chave(x)));
    // [decisao 31/10] aula fixa vai para o horario do Urania e continua fixa
    for (const h of sai.filter((h) => h.fixa)) {
      const nova = entra.find((x) => !x.fixa && x.prof === h.professor_id && x.turma === h.turma_id && x.disc === h.disciplina_id);
      if (nova) { nova.fixa = true; avisos.push(`aula FIXA de ${nomeP(h.professor_id)} na ${turmaPorId.get(h.turma_id)?.nome}: ${rot(h.dia_semana, h.numero_aula)} -> ${rot(nova.d, nova.a)} (continua fixa)`); }
      else avisos.push(`aula FIXA de ${nomeP(h.professor_id)} na ${turmaPorId.get(h.turma_id)?.nome} ${rot(h.dia_semana, h.numero_aula)} sai (o Urania nao tem aula dessa disciplina a mais)`);
    }
    apagar.push(...sai); criar.push(...entra);
    const porProf = new Map();
    for (const h of sai) porProf.set(h.professor_id, [...(porProf.get(h.professor_id) || []), `-${rot(h.dia_semana, h.numero_aula)} ${turmaPorId.get(h.turma_id)?.nome}`]);
    for (const x of entra) porProf.set(x.prof, [...(porProf.get(x.prof) || []), `+${rot(x.d, x.a)} ${x.turmaNome}`]);
    resumoAulas.push(`== ${ROT[turno]}: ${sai.length} aulas saem do lugar, ${entra.length} entram (${porProf.size} professores; ${Object.keys(mapa).length} professores do Urania ligados ao cadastro)`);
    for (const [id, l] of porProf) resumoAulas.push(`  ${String(nomeP(id)).padEnd(26)} ${l.join("  ")}`);

    // 5) HA e bloqueios do turno
    for (const [nome, p] of Object.entries(mapa)) {
      const ocup = ocupProf.get(p.id);
      const meus = disp.filter((x) => x.professor_id === p.id && x.turno === turno);
      const haAtual = meus.filter((x) => x.hora_atividade_obrigatoria);
      const outrosBloq = meus.filter((x) => !x.hora_atividade_obrigatoria && x.disponivel === false);
      const bloqEm = (d, a) => outrosBloq.filter((x) => x.dia_semana === d && x.horario_slot === a);
      for (const s of ocup) {
        const [d, a] = s.split("-").map(Number);
        // [decisao 31/10] o Urania prevalece: sai o bloqueio (importado ou nao) que esta debaixo da aula
        for (const b of bloqEm(d, a)) {
          blqApagar.push({ b, prof: p.nome, turno });
          if (!blqImportado(b.motivo)) cedeuAoUrania.push(`${ROT[turno]} ${p.nome} ${rot(d, a)}: sai "${b.motivo || "indisponivel"}"`);
        }
        for (const x of haAtual.filter((x) => x.dia_semana === d && x.horario_slot === a && !movel(x.motivo)))
          cedeuAoUrania.push(`${ROT[turno]} ${p.nome} ${rot(d, a)}: "${x.motivo}" vai para um lugar de HA do Urania`);
      }
      for (let d = 0; d < 5; d++) NUM.forEach((a, i) => {
        const u = ura[nome].grade[DIAS[d]][i] || "";
        if (u === "---" && !ocup.has(`${d}-${a}`) && !meus.some((x) => x.dia_semana === d && x.horario_slot === a))
          blqCriar.push({ prof: p.id, nomeProf: p.nome, turno, d, a });
      });
      // HA: mesmo numero de hoje, nos lugares de HA do Urania
      // HA manual/fixa fica onde esta, menos a que o Urania cobriu com aula (essa entra na conta das moveis)
      const fixas = haAtual.filter((x) => !movel(x.motivo) && !ocup.has(`${x.dia_semana}-${x.horario_slot}`)).map((x) => `${x.dia_semana}-${x.horario_slot}`);
      const livre = (d, a) => !ocup.has(`${d}-${a}`) && !bloqEm(d, a).some((b) => !blqImportado(b.motivo));
      const uraHA = [];
      for (let d = 0; d < 5; d++) NUM.forEach((a, i) => { if (ehHA(ura[nome].grade[DIAS[d]][i] || "") && livre(d, a)) uraHA.push(`${d}-${a}`); });
      // [decisao 31/10] Mario estava inativo, sem HA na tarde: fica com a HA do Urania
      const N = HA_PELO_URANIA.has(p.id) ? Math.max(haAtual.length, uraHA.length) : haAtual.length;
      const atualK = haAtual.map((x) => `${x.dia_semana}-${x.horario_slot}`);
      const final = [...fixas];
      for (const k of uraHA) if (atualK.includes(k) && !final.includes(k) && final.length < N) final.push(k);
      for (const k of uraHA) if (!final.includes(k) && final.length < N) final.push(k);
      for (const k of atualK) { const [d, a] = k.split("-").map(Number); if (!final.includes(k) && final.length < N && livre(d, a)) final.push(k); }
      if (final.length < N) avisos.push(`${p.nome} ${ROT[turno]}: fica com ${final.length} HA em vez de ${N} (o Urania nao tem mais horario livre)`);
      const saiHA = haAtual.filter((x) => !final.includes(`${x.dia_semana}-${x.horario_slot}`));
      const entraHA = final.filter((k) => !atualK.includes(k));
      haApagar.push(...saiHA);
      for (const k of entraHA) { const [d, a] = k.split("-").map(Number); haCriar.push({ prof: p.id, turno, d, a }); }
      if (saiHA.length || entraHA.length) resumoHA.push(`  ${ROT[turno].padEnd(6)} ${p.nome.padEnd(26)} HA ${N}: sai ${saiHA.map((x) => rot(x.dia_semana, x.horario_slot)).join(", ") || "-"} | entra ${entraHA.map((k) => rot(...k.split("-").map(Number))).join(", ") || "-"}`);
    }
  }
  // bloqueio novo nao pode ficar onde vai entrar HA nova
  for (let i = blqCriar.length - 1; i >= 0; i--) { const b = blqCriar[i]; if (haCriar.some((h) => h.prof === b.prof && h.turno === b.turno && h.d === b.d && h.a === b.a)) blqCriar.splice(i, 1); }

  // 6) conferencia final: professor em 2 aulas no mesmo horario real; turma com 2 disciplinas no mesmo horario
  const idsApagar = new Set(apagar.map((h) => h.id));
  const depois = [...aulas.filter((h) => !idsApagar.has(h.id)),
    ...criar.map((x) => ({ turma_id: x.turma, professor_id: x.prof, disciplina_id: x.disc, dia_semana: x.d, numero_aula: x.a, assincrona: false }))];
  const porProfReal = new Map(), porTurma = new Map();
  for (const h of depois) {
    if (h.assincrona || turmaPorId.get(h.turma_id)?.fantasma) continue;
    const r = realDe(h);
    const kp = `${h.professor_id}|${h.dia_semana}|${r.turno}|${r.aula}`; porProfReal.set(kp, [...(porProfReal.get(kp) || []), h]);
    const kt = `${h.turma_id}|${h.dia_semana}|${h.numero_aula}`; porTurma.set(kt, [...(porTurma.get(kt) || []), h]);
  }
  for (const [, xs] of porProfReal) if (new Set(xs.map((x) => x.turma_id)).size > 1) {
    const r = realDe(xs[0]);
    problemas.push(`CHOQUE: ${nomeP(xs[0].professor_id)} ${rot(xs[0].dia_semana, r.aula)} ${ROT[r.turno] ?? r.turno} em ${xs.map((x) => turmaPorId.get(x.turma_id)?.nome).join(" e ")}`);
  }
  // trio (docencia por trio): as disciplinas do mesmo grupo dividem o horario de proposito
  const grupoTrio = new Map(vinc.filter((v) => (v.grupo_trio ?? "").trim()).map((v) => [`${v.turma_id}|${v.disciplina_id}`, v.grupo_trio.trim()]));
  const mesmoTrio = (xs) => { const g = xs.map((x) => grupoTrio.get(`${x.turma_id}|${x.disciplina_id}`)); return g.every((y) => y && y === g[0]); };
  for (const [, xs] of porTurma) if (new Set(xs.map((x) => x.disciplina_id)).size > 1 && !mesmoTrio(xs))
    problemas.push(`TURMA ${turmaPorId.get(xs[0].turma_id)?.nome} ${rot(xs[0].dia_semana, xs[0].numero_aula)}: ${xs.map((x) => `${discNome.get(x.disciplina_id)} (${nomeP(x.professor_id)})`).join(" e ")}`);

  // 7) relatorio
  resumoAulas.forEach((l) => console.log(l));
  // mesma aula (professor, turma, dia, aula) que so troca de disciplina
  const trocas = new Map();
  for (const x of criar) {
    const h = apagar.find((h) => h.professor_id === x.prof && h.turma_id === x.turma && h.dia_semana === x.d && h.numero_aula === x.a);
    if (!h || h.disciplina_id === x.disc) continue;
    const k = `${nomeP(x.prof)} | ${x.turmaNome} | ${discNome.get(h.disciplina_id)} -> ${discNome.get(x.disc)}`;
    trocas.set(k, (trocas.get(k) || 0) + 1);
  }
  if (trocas.size) {
    console.log(`\n== Mesma aula, so muda a DISCIPLINA (${[...trocas.values()].reduce((s, n) => s + n, 0)}):`);
    for (const [k, n] of [...trocas].sort()) console.log(`  ${k} (x${n})`);
  }
  console.log(`\n== HA: ${haApagar.length} saem, ${haCriar.length} entram`);
  resumoHA.forEach((l) => console.log(l));
  console.log(`\n== Bloqueios importados: ${blqApagar.length} saem (aula do Urania em cima), ${blqCriar.length} entram (traco do Urania)`);
  for (const b of blqApagar) console.log(`  - ${ROT[b.turno]} ${b.prof} ${rot(b.b.dia_semana, b.b.horario_slot)}`);
  const porProfBlq = new Map(); for (const b of blqCriar) porProfBlq.set(`${ROT[b.turno]} ${b.nomeProf}`, [...(porProfBlq.get(`${ROT[b.turno]} ${b.nomeProf}`) || []), rot(b.d, b.a)]);
  for (const [k, l] of porProfBlq) console.log(`  + ${k}: ${l.join(", ")}`);
  if (semCadastro.length) console.log(`\nNo Urania sem aula e sem cadastro (ignorados): ${semCadastro.join(", ")}`);
  if (reativar.size) console.log(`\n== Professores que voltam a ficar ATIVOS: ${[...reativar].map(([id, n]) => `${n} (#${id})`).join(", ")}`);
  if (trocaVinculo.length) {
    console.log(`\n== Vinculos turma x disciplina que mudam de professor (${trocaVinculo.length}):`);
    for (const v of trocaVinculo) console.log(`  ${v.turmaNome.padEnd(8)} ${String(discNome.get(v.disc)).padEnd(28)} ${nomeP(v.de)} -> ${nomeP(v.para)}`);
  }
  if (cedeuAoUrania.length) { console.log(`\n== O Urania prevalece (${cedeuAoUrania.length}):`); cedeuAoUrania.forEach((a) => console.log("  " + a)); }
  if (avisos.length) { console.log(`\nAvisos (nao impedem gravar):`); avisos.forEach((a) => console.log("  - " + a)); }
  if (problemas.length) { console.log(`\nATENCAO (${problemas.length}):`); problemas.forEach((p) => console.log("  - " + p)); }
  console.log(`\nAulas oficiais da escola: hoje ${aulas.length} -> depois ${aulas.length - apagar.length + criar.length}`);
  if (!APLICAR) { console.log("\nDRY-RUN: nada foi alterado. Rode com --aplicar."); await c.end(); return; }
  if (problemas.length) { console.log("\nNAO GRAVADO: resolva os itens de ATENCAO antes."); await c.end(); process.exitCode = 1; return; }

  const pasta = path.join(__dirname, "_arquivo"); if (!fs.existsSync(pasta)) fs.mkdirSync(pasta);
  const arq = path.join(pasta, `backup-mario-braga-urania-0211-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  const vincAntes = (await c.query(
    `select td.* from turma_disciplinas td join turmas t on t.id=td.turma_id where t.escola_id=$1`, [ESCOLA])).rows;
  fs.writeFileSync(arq, JSON.stringify({ horarios: aulas, disponibilidade: disp, turmaDisciplinas: vincAntes, professores: profs }, null, 1));
  console.log(`Backup: ${arq}`);
  await c.query("BEGIN");
  try {
    if (reativar.size) await c.query("update professores set ativo = true where escola_id=$1 and id = any($2)", [ESCOLA, [...reativar.keys()]]);
    for (const v of trocaVinculo) await c.query(
      "update turma_disciplinas set professor_id=$1 where turma_id=$2 and disciplina_id=$3 and professor_id=$4", [v.para, v.turma, v.disc, v.de]);
    if (apagar.length) await c.query("delete from horarios where id = any($1)", [apagar.map((h) => h.id)]);
    for (const x of criar) await c.query(
      `insert into horarios (escola_id, turma_id, disciplina_id, professor_id, dia_semana, numero_aula, versao_grade, fixa)
       values ($1,$2,$3,$4,$5,$6,'oficial',$7)`, [ESCOLA, x.turma, x.disc, x.prof, x.d, x.a, !!x.fixa]);
    const del = [...haApagar.map((x) => x.id), ...blqApagar.map((b) => b.b.id)];
    if (del.length) await c.query("delete from disponibilidade_professores where id = any($1)", [del]);
    const up = `insert into disponibilidade_professores (professor_id, dia_semana, horario_slot, turno, disponivel, hora_atividade_obrigatoria, motivo)
                values ($1,$2,$3,$4,$5,$6,$7) on conflict (professor_id, dia_semana, horario_slot, turno)
                do update set disponivel = excluded.disponivel, hora_atividade_obrigatoria = excluded.hora_atividade_obrigatoria, motivo = excluded.motivo`;
    for (const x of haCriar) await c.query(up, [x.prof, x.d, x.a, x.turno, true, true, MOTIVO_HA]);
    for (const x of blqCriar) await c.query(up, [x.prof, x.d, x.a, x.turno, false, false, MOTIVO_BLQ]);
    await c.query("COMMIT");
  } catch (e) { await c.query("ROLLBACK"); throw e; }
  console.log("\nGRAVADO. Rode de novo este script (dry-run) e o ver-conflitos.ts para conferir.");
  await c.end();
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
