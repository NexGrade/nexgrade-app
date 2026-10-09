/**
 * ajustar-horario-noturno-romario.cjs
 *
 * Alinha o horario da 3a aula do NOTURNO do C.E. Romario Martins ao do Urania
 * (09/10/2026): o PDF do Urania mostra 18:40 / 19:30 / 20:35 / 21:20 / 22:10, e o
 * NexGrade tinha a 3a aula em 20:30 (50 min). Para a 4a aula continuar comecando
 * as 21:20, a 3a aula passa a ter 45 min (20:35 a 21:20).
 *
 * O assistente "Esquema de aulas" so aceita uma duracao igual para todas as aulas,
 * por isso este ajuste e pontual, direto na tabela horario_slots.
 *
 * Seguro: so mexe na aula 3 do noturno desta escola, so se ela estiver exatamente
 * em 20:30 / 50 min (senao nao faz nada), dentro de uma transacao.
 *
 * Uso:
 *   node ajustar-horario-noturno-romario.cjs            (ensaio: so mostra)
 *   node ajustar-horario-noturno-romario.cjs --aplicar  (grava)
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const ESCOLA_ID = "org_3JxLX0hl4xYxiHbrUIIabRHaAO9"; // C.E. Romario Martins
const TURNO = "noturno";
const AULA = 3;
const DE = { inicio: "20:30", duracao: 50 };
const PARA = { inicio: "20:35", duracao: 45 };
const APLICAR = process.argv.includes("--aplicar");

function carregarDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const p = [path.join(__dirname, ".env"), path.join("lib", "db", ".env")].find((f) => fs.existsSync(f));
  if (!p) throw new Error("DATABASE_URL nao encontrada (defina a variavel ou crie lib/db/.env)");
  const linha = fs.readFileSync(p, "utf8").split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
  if (!linha) throw new Error("DATABASE_URL nao encontrada no .env");
  return linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

const hhmm = (t) => String(t).slice(0, 5);
function fim(inicio, dur) {
  const [h, m] = hhmm(inicio).split(":").map(Number);
  const t = h * 60 + m + dur;
  return String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0");
}
function mostrar(linhas) {
  for (const s of linhas) {
    console.log(`  aula ${s.numero_aula}: ${hhmm(s.hora_inicio)} -> ${fim(s.hora_inicio, s.duracao_minutos)} (${s.duracao_minutos} min)${s.letivo ? "" : "  [nao letivo]"}`);
  }
}

async function main() {
  const c = new Client({ connectionString: carregarDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const sel = () => c.query(
      `SELECT id, numero_aula, hora_inicio, duracao_minutos, letivo FROM horario_slots
       WHERE escola_id = $1 AND turno = $2 AND nivel_ensino IS NULL ORDER BY numero_aula`,
      [ESCOLA_ID, TURNO],
    );
    const antes = (await sel()).rows;
    console.log(`Horarios do ${TURNO} (Romario) ANTES:`);
    mostrar(antes);
    const alvo = antes.find((s) => s.numero_aula === AULA);
    if (!alvo) { console.log(`\nA aula ${AULA} nao existe neste esquema. Nada a fazer.`); return; }
    if (hhmm(alvo.hora_inicio) === PARA.inicio && alvo.duracao_minutos === PARA.duracao) {
      console.log("\nJa esta ajustado (20:35, 45 min). Nada a fazer."); return;
    }
    if (hhmm(alvo.hora_inicio) !== DE.inicio || alvo.duracao_minutos !== DE.duracao) {
      console.log(`\nValor inesperado na aula ${AULA} (${hhmm(alvo.hora_inicio)}, ${alvo.duracao_minutos} min). Esperado ${DE.inicio}/${DE.duracao}. Nada foi alterado.`);
      return;
    }
    console.log(`\nMudanca: aula ${AULA}: ${DE.inicio} (${DE.duracao} min) -> ${PARA.inicio} (${PARA.duracao} min), termina as ${fim(PARA.inicio, PARA.duracao)}`);
    if (!APLICAR) { console.log("\n[ENSAIO] Nada foi gravado. Rode com --aplicar para gravar."); return; }

    await c.query("BEGIN");
    const r = await c.query(
      `UPDATE horario_slots SET hora_inicio = $1, duracao_minutos = $2
       WHERE id = $3 AND hora_inicio = $4 AND duracao_minutos = $5`,
      [PARA.inicio, PARA.duracao, alvo.id, DE.inicio, DE.duracao],
    );
    if (r.rowCount !== 1) { await c.query("ROLLBACK"); throw new Error("Atualizacao nao afetou exatamente 1 linha; desfeito."); }
    await c.query("COMMIT");
    console.log("\nHorarios do " + TURNO + " (Romario) DEPOIS:");
    mostrar((await sel()).rows);
    console.log("\nGravado. O XML do RCO e os PDFs passam a usar 20:35 na 3a aula do noturno.");
  } catch (e) {
    try { await c.query("ROLLBACK"); } catch {}
    throw e;
  } finally {
    await c.end();
  }
}

main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
