/**
 * [DISPONIBILIDADE-HERACLITO] (28/10/2026) Grava os tracos ("--------") do "Relatorio de Professores
 * (Individual)" do sistema anterior como horario indisponivel do professor (disponibilidade_professores).
 * Dados: dados\heraclito-disponibilidade-26-10.json (manha, tarde e noite). Noite: aula N do relatorio = N+1.
 *  - celula com tracos -> disponivel=false; se ali houver HA automatica, ela vira bloqueio (a HA e recalculada depois);
 *  - celula com turma, HA ou vazia nao muda nada;
 *  - avisa traco onde o professor tem aula no NexGrade (nao grava esse).
 * Uso (em lib\db):  node importar-disponibilidade-heraclito.cjs            (ensaio)
 *                   node importar-disponibilidade-heraclito.cjs --aplicar
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const APLICAR = process.argv.includes("--aplicar");
const ESCOLA = process.env.ESCOLA_ID || "esc_279086285f70451298dc1f31";
const DADOS = JSON.parse(fs.readFileSync(path.join(__dirname, "dados", "heraclito-disponibilidade-26-10.json"), "utf8")).turnos;
const MOTIVO = "Indisponivel (relatorio do sistema anterior, 26/10)";
const DIAS = { Seg: 0, Ter: 1, Qua: 2, Qui: 3, Sex: 4 };
const DIA = ["Seg", "Ter", "Qua", "Qui", "Sex"];
// nome no relatorio -> nome no NexGrade (por turno quando precisa); null = ignorar
const NOMES = { "Luiz F.": "Luiz Fernando", "Miriana": "Miriam", "Sidneia": "Sidneya", "Matematica": "Matematica (vaga)" };
const NOMES_TURNO = { matutino: { Fabio: "Fábio" }, noturno: { Fabio: null } };

function carregarDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const p = [path.join(__dirname, ".env"), path.join("lib", "db", ".env")].find((f) => fs.existsSync(f));
  const linha = fs.readFileSync(p, "utf8").split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
  return linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

(async () => {
  const c = new Client({ connectionString: carregarDatabaseUrl(), ssl: process.env.PGSSL === "0" ? false : { rejectUnauthorized: false } });
  await c.connect();
  try {
    const escola = (await c.query("select nome_fantasia from escolas where id=$1", [ESCOLA])).rows[0];
    if (!escola) { console.log("Escola nao encontrada"); return; }
    console.log(`Escola: ${escola.nome_fantasia}`);
    const profs = (await c.query("select id, nome from professores where escola_id=$1", [ESCOLA])).rows;
    const porNome = new Map(profs.map((p) => [p.nome, p.id]));
    const ids = profs.map((p) => p.id);
    const aulas = new Set((await c.query(
      `select h.professor_id, t.turno, h.dia_semana, h.numero_aula from horarios h join turmas t on t.id=h.turma_id
        where t.escola_id=$1 and coalesce(h.versao_grade,'oficial')='oficial'`, [ESCOLA])).rows.map((a) => `${a.professor_id}|${a.turno}|${a.dia_semana}|${a.numero_aula}`));
    const disp = new Map((await c.query("select * from disponibilidade_professores where professor_id = any($1)", [ids])).rows
      .map((d) => [`${d.professor_id}|${d.turno}|${d.dia_semana}|${d.horario_slot}`, d]));

    const inserir = [], virarBloqueio = [], jaBloqueado = [], comAula = [], semCadastro = [], usados = new Set();
    const porTurno = {};
    for (const [turno, profsRel] of Object.entries(DADOS)) {
      porTurno[turno] = { inserir: 0, ha: 0 };
      for (const [nomeRel, cels] of Object.entries(profsRel)) {
        const map = NOMES_TURNO[turno] && nomeRel in NOMES_TURNO[turno] ? NOMES_TURNO[turno][nomeRel] : (NOMES[nomeRel] ?? nomeRel);
        if (map === null) continue;
        const pid = porNome.get(map);
        if (!pid) { semCadastro.push(`${nomeRel} (${turno})`); continue; }
        usados.add(pid);
        for (const [cel, v] of Object.entries(cels)) {
          if (v !== "X") continue;
          const dia = DIAS[cel.slice(0, 3)];
          const aula = Number(cel.slice(3)) + (turno === "noturno" ? 1 : 0);
          const k = `${pid}|${turno}|${dia}|${aula}`;
          const rot = `${map} ${DIA[dia]} ${aula}a ${turno}`;
          if (aulas.has(k)) { comAula.push(rot); continue; }
          const d = disp.get(k);
          if (!d) { inserir.push({ pid, turno, dia, aula }); porTurno[turno].inserir++; }
          else if (d.hora_atividade_obrigatoria) { virarBloqueio.push({ id: d.id, rot }); porTurno[turno].ha++; }
          else if (!d.disponivel) jaBloqueado.push(rot);
          else virarBloqueio.push({ id: d.id, rot });
        }
      }
    }
    for (const [t, n] of Object.entries(porTurno)) console.log(`${t}: ${n.inserir} bloqueio(s) novo(s) · ${n.ha} HA que vira(m) bloqueio`);
    console.log(`Ja estavam bloqueados: ${jaBloqueado.length}`);
    const semRel = profs.filter((p) => !usados.has(p.id)).map((p) => p.nome);
    if (semRel.length) console.log(`Professores do NexGrade fora do relatorio (ficam sem bloqueio): ${semRel.join(", ")}`);
    if (semCadastro.length) console.log(`ATENCAO: no relatorio, sem cadastro no NexGrade: ${semCadastro.join(", ")}`);
    if (comAula.length) console.log(`ATENCAO: traco onde o professor tem aula no NexGrade (nao gravado): ${comAula.join("; ")}`);
    if (!APLICAR) { console.log("\nENSAIO: nada foi gravado. Para gravar, rode de novo com --aplicar."); return; }

    const pasta = path.join(__dirname, "_arquivo"); fs.mkdirSync(pasta, { recursive: true });
    const arq = path.join(pasta, `backup-disponibilidade-heraclito-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(arq, JSON.stringify({ alterados: virarBloqueio.map((v) => disp.get([...disp.keys()].find((k) => disp.get(k).id === v.id))), inseridos: inserir }, null, 1));
    await c.query("BEGIN");
    try {
      for (const v of virarBloqueio) await c.query("update disponibilidade_professores set disponivel=false, hora_atividade_obrigatoria=false, motivo=$1 where id=$2", [MOTIVO, v.id]);
      for (let i = 0; i < inserir.length; i += 500) {
        const lote = inserir.slice(i, i + 500);
        const vals = [], params = [];
        lote.forEach((x, j) => { vals.push(`($${j * 5 + 1},$${j * 5 + 2},$${j * 5 + 3},$${j * 5 + 4},false,$${j * 5 + 5},false)`); params.push(x.pid, x.dia, x.aula, x.turno, MOTIVO); });
        await c.query(`insert into disponibilidade_professores (professor_id, dia_semana, horario_slot, turno, disponivel, motivo, hora_atividade_obrigatoria) values ${vals.join(",")}`, params);
      }
      await c.query("COMMIT");
    } catch (e) { await c.query("ROLLBACK"); throw e; }
    console.log(`\nGRAVADO: ${inserir.length} bloqueios novos e ${virarBloqueio.length} horarios convertidos em bloqueio. Backup: ${arq}`);
    console.log("Proximo passo: recalcular a HA (scripts/recalcular-ha.ts).");
  } finally { await c.end(); }
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
