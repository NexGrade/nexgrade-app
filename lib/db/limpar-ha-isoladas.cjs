/**
 * limpar-ha-isoladas.cjs
 *
 * Versao corrigida do limpar-ha-mal-posicionadas.cjs. Marca como
 * candidata qualquer HA ISOLADA -- sem nenhuma aula real OU outra HA
 * colada antes/depois dela no mesmo dia. Essas sao as que a regra
 * corrigida (v2) teria evitado, preferindo colar no bloco de
 * ocupacao existente.
 *
 * NUNCA remove:
 *   - HA que tapa buraco real (antes E depois ocupados por aula real)
 *   - HA colada em pelo menos uma ocupacao (aula real ou outra HA)
 *   - HA marcada manualmente (motivo diferente do automatico)
 *
 * Uso:
 *   node limpar-ha-isoladas.cjs --escola=ORG_ID           # dry-run
 *   node limpar-ha-isoladas.cjs --escola=ORG_ID --aplicar # aplica
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const MOTIVO_HA_AUTO = "Hora-atividade institucional (recalculada automaticamente)";

function carregarDatabaseUrl() {
  const envPath = path.join(__dirname, ".env");
  const envPathAlt = path.join("lib", "db", ".env");
  const p = fs.existsSync(envPath) ? envPath : envPathAlt;
  const conteudo = fs.readFileSync(p, "utf8");
  const linha = conteudo.split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
  if (!linha) throw new Error("DATABASE_URL nao encontrada no .env");
  const valor = linha.slice(linha.indexOf("=") + 1).trim();
  return valor.replace(/^["']|["']$/g, "");
}

function parseArgs() {
  const args = {};
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  }
  return { escolaId: args.escola ?? null, aplicar: process.argv.includes("--aplicar") };
}

async function main() {
  const { escolaId, aplicar } = parseArgs();
  if (!escolaId) throw new Error("Informe --escola=ORG_ID");

  const client = new Client({ connectionString: carregarDatabaseUrl() });
  await client.connect();

  try {
    const professores = (await client.query(
      `SELECT id, nome FROM professores WHERE escola_id = $1`,
      [escolaId]
    )).rows;
    const profIds = professores.map((p) => p.id);
    const profMap = new Map(professores.map((p) => [p.id, p.nome]));
    if (profIds.length === 0) {
      console.log("Nenhum professor encontrado.");
      return;
    }

    const turmas = (await client.query(
      `SELECT id, turno FROM turmas WHERE escola_id = $1`,
      [escolaId]
    )).rows;
    const turmaTurnoMap = new Map(turmas.map((t) => [t.id, t.turno]));

    const horarios = (await client.query(
      `SELECT professor_id, turma_id, dia_semana, numero_aula
         FROM horarios WHERE professor_id = ANY($1)`,
      [profIds]
    )).rows;

    const ocupadoReal = new Map();
    for (const h of horarios) {
      const turno = turmaTurnoMap.get(h.turma_id);
      if (!turno) continue;
      if (!ocupadoReal.has(h.professor_id)) ocupadoReal.set(h.professor_id, new Map());
      const porTurno = ocupadoReal.get(h.professor_id);
      if (!porTurno.has(turno)) porTurno.set(turno, new Set());
      porTurno.get(turno).add(`${h.dia_semana}-${h.numero_aula}`);
    }

    const haAuto = (await client.query(
      `SELECT id, professor_id, turno, dia_semana, horario_slot
         FROM disponibilidade_professores
        WHERE professor_id = ANY($1)
          AND hora_atividade_obrigatoria = true
          AND motivo = $2`,
      [profIds, MOTIVO_HA_AUTO]
    )).rows;

    const ocupadoTotal = new Map();
    for (const [profId, porTurno] of ocupadoReal.entries()) {
      ocupadoTotal.set(profId, new Map());
      for (const [turno, slots] of porTurno.entries()) {
        ocupadoTotal.get(profId).set(turno, new Set(slots));
      }
    }
    for (const ha of haAuto) {
      if (!ocupadoTotal.has(ha.professor_id)) ocupadoTotal.set(ha.professor_id, new Map());
      const porTurno = ocupadoTotal.get(ha.professor_id);
      if (!porTurno.has(ha.turno)) porTurno.set(ha.turno, new Set());
      porTurno.get(ha.turno).add(`${ha.dia_semana}-${ha.horario_slot}`);
    }

    const candidatas = [];
    for (const ha of haAuto) {
      const total = ocupadoTotal.get(ha.professor_id)?.get(ha.turno) ?? new Set();
      const antesChave = `${ha.dia_semana}-${ha.horario_slot - 1}`;
      const depoisChave = `${ha.dia_semana}-${ha.horario_slot + 1}`;
      const colada = total.has(antesChave) || total.has(depoisChave);
      if (!colada) candidatas.push(ha);
    }

    console.log(`Escola: ${escolaId}`);
    console.log(`Total de HA automaticas: ${haAuto.length}`);
    console.log(`Candidatas isoladas (nao coladas em nada): ${candidatas.length}\n`);

    const DIAS_NOMES = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];
    for (const c of candidatas) {
      console.log(`  ${profMap.get(c.professor_id)} - ${c.turno} - ${DIAS_NOMES[c.dia_semana] ?? c.dia_semana} - aula ${c.horario_slot}`);
    }

    if (candidatas.length === 0) {
      console.log("Nada para remover.");
      return;
    }

    if (!aplicar) {
      console.log("\n[DRY-RUN] Nenhuma mudança gravada. Rode com --aplicar para remover de verdade.");
      return;
    }

    const ids = candidatas.map((c) => c.id);
    await client.query(`DELETE FROM disponibilidade_professores WHERE id = ANY($1)`, [ids]);
    console.log(`\nAPLICADO: ${ids.length} HA isoladas removidas.`);
    console.log("Gere ou promova uma grade para que sejam recriadas na posicao correta.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("ERRO:", err.message);
  process.exit(1);
});
