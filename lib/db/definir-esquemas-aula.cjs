/**
 * definir-esquemas-aula.cjs  [ENSAIO por padrao; grava so com --aplicar]
 * Cria o esquema de aulas (Calendario e Turnos) de uma escola nova, no padrao do Heraclito
 * (referencia: manha do Fundamental no RCO, 07:30-11:50, intervalo depois da 3a aula):
 *   manha Fundamental  : 07:30 08:20 09:10 | 10:10 11:00                (50 min)
 *   manha Medio/Tecnico: as mesmas + 11:50
 *   tarde              : 13:00 13:50 14:40 | 15:40 16:30
 *   noite              : 18:30 (NAO letiva, so assincronas, 10 min) + 18:40 19:30 20:30 21:20 22:10
 *                        (horario fixo do RCO; a aula 1 e a das assincronas)
 * Esquema que ja existe na escola (mesmo turno e nivel) NAO e mexido: aparece na lista e fica de fora.
 * Uso (em lib\db):
 *   node definir-esquemas-aula.cjs esc_xxx
 *   node definir-esquemas-aula.cjs esc_xxx --aplicar
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const ARGS = process.argv.slice(2);
const APLICAR = ARGS.includes("--aplicar");
const ESCOLA_ID = ARGS.find((a) => !a.startsWith("--"));
const a = (inicio, dur = 50, letivo = true) => ({ inicio, dur, letivo });
const ESQUEMAS = [
  { turno: "matutino", nivel: "fundamental", aulas: [a("07:30"), a("08:20"), a("09:10"), a("10:10"), a("11:00")] },
  { turno: "matutino", nivel: "medio_tecnico", aulas: [a("07:30"), a("08:20"), a("09:10"), a("10:10"), a("11:00"), a("11:50")] },
  { turno: "vespertino", nivel: null, aulas: [a("13:00"), a("13:50"), a("14:40"), a("15:40"), a("16:30")] },
  { turno: "noturno", nivel: null, aulas: [a("18:30", 10, false), a("18:40"), a("19:30"), a("20:30"), a("21:20"), a("22:10")] },
];

function carregarDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const p = [path.join(__dirname, ".env"), path.join("lib", "db", ".env")].find((f) => fs.existsSync(f));
  const linha = fs.readFileSync(p, "utf8").split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
  return linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}
const fim = (ini, dur) => { const [h, m] = ini.split(":").map(Number); const t = h * 60 + m + dur; return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };

(async () => {
  if (!ESCOLA_ID) { console.log("Uso: node definir-esquemas-aula.cjs esc_xxx [--aplicar]"); return; }
  const c = new Client({ connectionString: carregarDatabaseUrl(), ssl: process.env.PGSSL === "0" ? false : { rejectUnauthorized: false } });
  await c.connect();
  try {
    const escola = (await c.query(`SELECT nome_fantasia FROM escolas WHERE id = $1`, [ESCOLA_ID])).rows[0];
    if (!escola) { console.log("Escola nao encontrada:", ESCOLA_ID); return; }
    console.log(`Escola: ${escola.nome_fantasia}`);
    const existentes = (await c.query(`SELECT turno, nivel_ensino, numero_aula, hora_inicio, duracao_minutos, letivo FROM horario_slots WHERE escola_id = $1 ORDER BY turno, nivel_ensino, numero_aula`, [ESCOLA_ID])).rows;
    const usadas = (await c.query(
      `SELECT t.turno, t.nivel_ensino, MAX(h.numero_aula)::int AS maior FROM horarios h JOIN turmas t ON t.id = h.turma_id
        WHERE t.escola_id = $1 AND COALESCE(h.versao_grade,'oficial') = 'oficial' GROUP BY 1, 2`, [ESCOLA_ID])).rows;
    const novos = [];
    for (const e of ESQUEMAS) {
      const ja = existentes.filter((s) => s.turno === e.turno && (s.nivel_ensino ?? null) === e.nivel);
      const rotulo = `${e.turno}${e.nivel ? " " + e.nivel : ""}`;
      if (ja.length) {
        console.log(`\n${rotulo}: JA EXISTE (fica como esta): ${ja.map((s) => `${s.numero_aula}a ${String(s.hora_inicio).slice(0, 5)}${s.letivo ? "" : " (nao letiva)"}`).join(" · ")}`);
        continue;
      }
      console.log(`\n${rotulo}: ${e.aulas.map((x, i) => `${i + 1}a ${x.inicio}-${fim(x.inicio, x.dur)}${x.letivo ? "" : " (nao letiva)"}`).join(" · ")}`);
      const maior = usadas.filter((u) => u.turno === e.turno && (e.turno !== "matutino" || u.nivel_ensino === e.nivel)).reduce((m, u) => Math.max(m, u.maior), 0);
      if (maior > e.aulas.length) console.log(`  ATENCAO: a grade usa ate a ${maior}a aula e o esquema tem ${e.aulas.length}`);
      e.aulas.forEach((x, i) => novos.push({ turno: e.turno, nivel: e.nivel, numero: i + 1, ...x }));
    }
    if (!APLICAR) { console.log(`\nENSAIO: ${novos.length} linha(s) a criar; nada foi gravado. Para gravar, rode de novo com --aplicar.`); return; }
    if (!novos.length) { console.log("\nNada a gravar."); return; }
    await c.query("BEGIN");
    try {
      for (const n of novos) {
        await c.query(`INSERT INTO horario_slots (escola_id, turno, nivel_ensino, numero_aula, hora_inicio, duracao_minutos, letivo) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [ESCOLA_ID, n.turno, n.nivel, n.numero, n.inicio, n.dur, n.letivo]);
      }
      await c.query("COMMIT");
    } catch (e) { await c.query("ROLLBACK"); throw e; }
    const n = (await c.query(`SELECT COUNT(*)::int n FROM horario_slots WHERE escola_id = $1`, [ESCOLA_ID])).rows[0].n;
    console.log(`\nGRAVADO: ${novos.length} linhas de esquema. Linhas da escola agora: ${n}.`);
  } finally { await c.end(); }
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
