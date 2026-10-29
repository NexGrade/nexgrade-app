/**
 * [HERACLITO-3C] (28/10/2026) Completa o 3ºC (noite) do Heraclito para fechar as 30 aulas do RCO.
 * Assincronas informadas pela escola (terca, 18:30): Ingles I, Historia I, Geografia I, Ed. Financeira e
 * Matematica. Projeto de Vida deixa de ser assincrona e passa a ser presencial.
 *  - assincrona de Projeto de Vida (Angelo) vira assincrona de Historia I (Angelo);
 *  - uma das 2 aulas de Historia I da segunda (Angelo, 4a aula, 20:30) vira Projeto de Vida (A CONFERIR);
 *  - nova assincrona de Geografia I (Regyane) e de Matematica (A. Marcos), terca 18:30;
 *  - Sociologia I nas 2 aulas vazias de quinta (3a e 4a, que eram do Fabio), com "Sociologia I 3ºC (vaga)";
 *  - aulas assincronas por semana no vinculo: PV 0, Historia I 1, Geografia I 1, Matematica 1;
 *  - tira HA de Regyane e A. Marcos na terca 18:30 (recalcular a HA depois).
 * Uso (em lib\db):  node completar-3c-heraclito.cjs            (ensaio)
 *                   node completar-3c-heraclito.cjs --aplicar
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const APLICAR = process.argv.includes("--aplicar");
const ESCOLA = process.env.ESCOLA_ID || "esc_279086285f70451298dc1f31";
const COD = { PV: 3780, HIST: 3811, GEO: 3807, MAT: 2, SOC: 4052, EDFIN: 3482, ING: 3808 };
const DIA = ["Seg", "Ter", "Qua", "Qui", "Sex"];
const VAGA = "Sociologia I 3ºC (vaga)";

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
    const turma = (await c.query("select id, nome from turmas where escola_id=$1 and nome='3ºC' and turno='noturno'", [ESCOLA])).rows[0];
    if (!turma) { console.log("Turma 3ºC (noturno) nao encontrada"); return; }
    const vinc = (await c.query(
      `select td.*, d.codigo_externo_rco cod, d.nome disc, coalesce(td.carga_horaria_semanal_override, d.carga_semanal) carga
         from turma_disciplinas td join disciplinas d on d.id=td.disciplina_id where td.turma_id=$1`, [turma.id])).rows;
    const v = (cod) => vinc.find((x) => Number(x.cod) === cod);
    // nome comparado sem acento, sem diferenca de maiusculas e de espacos
    const chave = (x) => String(x ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
    const todosProfs = (await c.query("select id, nome from professores where escola_id=$1", [ESCOLA])).rows;
    const prof = async (nome) => todosProfs.find((p) => chave(p.nome) === chave(nome));
    const aulas = (await c.query(
      `select h.*, d.codigo_externo_rco cod, p.nome prof from horarios h join disciplinas d on d.id=h.disciplina_id join professores p on p.id=h.professor_id
        where h.turma_id=$1 and coalesce(h.versao_grade,'oficial')='oficial'`, [turma.id])).rows;
    const problemas = [];
    for (const k of Object.keys(COD)) if (!v(COD[k])) problemas.push(`vinculo ${k} (cod ${COD[k]}) nao esta no 3ºC`);
    const angelo = await prof("Angelo"), regyane = await prof("Regyane"), marcos = (await prof("A. Marcos")) ?? (await prof("Marcos")); // renomeado para "Marcos" na tela
    for (const [n, p] of [["Angelo", angelo], ["Regyane", regyane], ["A. Marcos", marcos]]) {
      if (p) continue;
      const parecidos = todosProfs.filter((x) => chave(x.nome).includes(chave(n).split(" ").pop())).map((x) => `"${x.nome}"`);
      problemas.push(`professor "${n}" nao encontrado${parecidos.length ? " (parecidos: " + parecidos.join(", ") + ")" : ""}`);
    }
    if (problemas.length) { problemas.forEach((p) => console.log("ATENCAO: " + p)); return; }

    const pvAsinc = aulas.find((h) => Number(h.cod) === COD.PV && h.assincrona);
    const histSeg4 = aulas.find((h) => Number(h.cod) === COD.HIST && !h.assincrona && h.dia_semana === 0 && h.numero_aula === 4);
    const ocupado = (dia, aula) => aulas.some((h) => !h.assincrona && h.dia_semana === dia && h.numero_aula === aula);
    if (!pvAsinc) problemas.push("nao achei a assincrona de Projeto de Vida");
    if (!histSeg4) problemas.push("nao achei Historia I na segunda, 4a aula");
    // quinta 3a e 4a: se ja tem Sociologia I, nao cria de novo; se tem outra coisa, avisa
    const naQuinta = aulas.filter((h) => !h.assincrona && h.dia_semana === 3 && (h.numero_aula === 3 || h.numero_aula === 4));
    const socJa = naQuinta.length === 2 && naQuinta.every((h) => Number(h.cod) === COD.SOC);
    if (naQuinta.length && !socJa)
      problemas.push(`quinta 3a/4a aula ja tem aula no 3ºC: ${naQuinta.map((h) => `${h.numero_aula}a ${h.prof} (cod ${h.cod})`).join("; ")}`);
    for (const [p, cod] of [[regyane, COD.GEO], [marcos, COD.MAT]])
      if (aulas.some((h) => h.assincrona && Number(h.cod) === cod)) problemas.push(`ja existe assincrona de cod ${cod}`);
    // professores ocupados na terca 18:30 (noite) em outra turma
    const outras = (await c.query(
      `select p.nome, t.nome turma from horarios h join turmas t on t.id=h.turma_id join professores p on p.id=h.professor_id
        where t.escola_id=$1 and t.turno='noturno' and h.dia_semana=1 and h.numero_aula=1 and h.turma_id<>$2 and h.professor_id = any($3)
          and coalesce(h.versao_grade,'oficial')='oficial'`, [ESCOLA, turma.id, [regyane.id, marcos.id]])).rows;
    for (const o of outras) problemas.push(`${o.nome} ja tem aula na ${o.turma} terca 18:30`);
    const haTer = (await c.query(
      "select d.*, p.nome from disponibilidade_professores d join professores p on p.id=d.professor_id where d.professor_id = any($1) and d.turno='noturno' and d.dia_semana=1 and d.horario_slot=1",
      [[regyane.id, marcos.id]])).rows;
    for (const d of haTer) if (!d.hora_atividade_obrigatoria && !d.disponivel) problemas.push(`${d.nome} tem bloqueio na terca 18:30: ${d.motivo}`);
    const vaga = await prof(VAGA);

    console.log(`3ºC hoje: ${aulas.length} aulas (${aulas.filter((h) => h.assincrona).length} assincronas)`);
    const nomeDisc = new Map(vinc.map((x) => [Number(x.cod), x.disc]));
    for (const d of [0, 1, 2, 3, 4]) {
      const doDia = aulas.filter((h) => h.dia_semana === d).sort((a, b) => a.numero_aula - b.numero_aula);
      console.log(`  ${DIA[d]}: ${doDia.map((h) => `${h.numero_aula}${h.assincrona ? "(ass)" : ""} ${nomeDisc.get(Number(h.cod)) ?? h.cod} - ${h.prof}`).join(" | ")}`);
    }
    console.log("Mudancas:");
    console.log(`  - assincrona Ter 18:30 de Projeto de Vida (Angelo) -> Historia I (Angelo)`);
    console.log(`  - Seg 4a aula (20:30): Historia I -> Projeto de Vida (Angelo)  [A CONFERIR com a escola]`);
    console.log(`  - nova assincrona Ter 18:30: Geografia I (Regyane)`);
    console.log(`  - nova assincrona Ter 18:30: Matematica (${marcos.nome})`);
    console.log(socJa ? "  - Qui 3a e 4a: ja tem Sociologia I (nada a fazer)" : `  - Qui 3a e 4a aulas (19:30 e 20:30): Sociologia I com "${VAGA}"${vaga ? "" : " (professor novo)"}`);
    console.log(`  - assincronas por semana: PV 0, Historia I 1, Geografia I 1, Matematica 1`);
    if (haTer.length) console.log(`  - HA tirada na terca 18:30: ${haTer.filter((d) => d.hora_atividade_obrigatoria).map((d) => d.nome).join(", ")}`);
    console.log(`3ºC depois: ${aulas.length + 2 + (socJa ? 0 : 2)} aulas (5 assincronas)`);
    const cargas = vinc.map((x) => `${x.disc} ${x.carga}`).join(" · ");
    console.log(`Cargas do RCO no 3ºC: ${cargas}`);
    if (problemas.length) { problemas.forEach((p) => console.log("ATENCAO: " + p)); console.log("Nada sera gravado."); return; }
    if (!APLICAR) { console.log("\nENSAIO: nada foi gravado. Para gravar, rode de novo com --aplicar."); return; }

    const pasta = path.join(__dirname, "_arquivo"); fs.mkdirSync(pasta, { recursive: true });
    const arq = path.join(pasta, `backup-completar-3c-heraclito-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(arq, JSON.stringify({ aulas, vinculos: vinc, haTer }, null, 1));
    await c.query("BEGIN");
    try {
      await c.query("update horarios set disciplina_id=$1 where id=$2", [v(COD.HIST).disciplina_id, pvAsinc.id]);
      await c.query("update horarios set disciplina_id=$1 where id=$2", [v(COD.PV).disciplina_id, histSeg4.id]);
      const ins = (disc, profId, dia, aula, asinc) => c.query(
        `insert into horarios (escola_id, turma_id, disciplina_id, professor_id, dia_semana, numero_aula, versao_grade, assincrona) values ($1,$2,$3,$4,$5,$6,'oficial',$7)`,
        [ESCOLA, turma.id, disc, profId, dia, aula, asinc]);
      await ins(v(COD.GEO).disciplina_id, regyane.id, 1, 1, true);
      await ins(v(COD.MAT).disciplina_id, marcos.id, 1, 1, true);
      if (!socJa) {
        const vagaId = vaga?.id ?? (await c.query("insert into professores (escola_id, nome, email) values ($1,$2,$3) returning id", [ESCOLA, VAGA, "sem-email.sociologia.i.3c.vaga@pendente.invalid"])).rows[0].id;
        await ins(v(COD.SOC).disciplina_id, vagaId, 3, 3, false);
        await ins(v(COD.SOC).disciplina_id, vagaId, 3, 4, false);
        await c.query("update turma_disciplinas set professor_id=$1 where id=$2 and professor_id is null", [vagaId, v(COD.SOC).id]);
        const ja = (await c.query("select 1 from professor_disciplinas where professor_id=$1 and disciplina_id=$2", [vagaId, v(COD.SOC).disciplina_id])).rows.length;
        if (!ja) await c.query("insert into professor_disciplinas (professor_id, disciplina_id) values ($1,$2)", [vagaId, v(COD.SOC).disciplina_id]);
      }
      for (const [cod, n] of [[COD.PV, 0], [COD.HIST, 1], [COD.GEO, 1], [COD.MAT, 1]])
        await c.query("update turma_disciplinas set aulas_assincronas=$1 where id=$2", [n, v(cod).id]);
      const tirar = haTer.filter((d) => d.hora_atividade_obrigatoria).map((d) => d.id);
      if (tirar.length) await c.query("delete from disponibilidade_professores where id = any($1)", [tirar]);
      await c.query("COMMIT");
    } catch (e) { await c.query("ROLLBACK"); throw e; }
    console.log(`\nGRAVADO. Backup: ${arq}`);
    console.log("Proximo passo: recalcular a HA (scripts/recalcular-ha.ts).");
  } finally { await c.end(); }
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
