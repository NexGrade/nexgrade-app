/**
 * limpar-ha-mal-posicionadas.cjs
 *
 * Identifica HA marcadas AUTOMATICAMENTE pelo sistema (motivo =
 * "Hora-atividade institucional (recalculada automaticamente)") que
 * NAO estao tapando um buraco real (nao tem aula real antes E depois
 * no mesmo dia) E nao estao na borda do dia (nao sao a 1a nem a
 * ultima aula do turno). Essas sao candidatas a reposicionamento --
 * foram parar no meio do dia sem necessidade, porque a versao antiga
 * do algoritmo nao tinha preferencia de posicao no fallback.
 *
 * NUNCA remove:
 *   - HA que realmente tapa um buraco real (antes E depois ocupados
 *     por aula de verdade) -- essas sao legitimas e ficam.
 *   - HA marcada manualmente (motivo diferente do automatico).
 *   - HA na borda do dia (ja esta no lugar certo).
 *
 * Depois de remover as candidatas, a proxima geracao/promocao de
 * grade vai chamar recalcularHoraAtividade() automaticamente (como ja
 * acontece hoje) e recriar essas HA faltantes, agora usando a logica
 * corrigida que prefere bordas do dia.
 *
 * Uso:
 *   node limpar-ha-mal-posicionadas.cjs --escola=ORG_ID           # dry-run
 *   node limpar-ha-mal-posicionadas.cjs --escola=ORG_ID --aplicar # aplica
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
  return {
    escolaId: args.escola ?? null,
    aplicar: process.argv.includes("--aplicar"),
  };
}

async function main() {
  const { escolaId, aplicar } = parseArgs();
  if (!escolaId) {
    throw new Error("Informe --escola=ORG_ID (ex.: org_3HCMsuYeAwkggR1dxXNzEdzNaX8)");
  }

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
      console.log("Nenhum professor encontrado para essa escola.");
      return;
    }

    const turmas = (await client.query(
      `SELECT id, turno FROM turmas WHERE escola_id = $1`,
      [escolaId]
    )).rows;
    const turmaTurnoMap = new Map(turmas.map((t) => [t.id, t.turno]));

    const horarios = (await client.query(
      `SELECT professor_id, turma_id, dia_semana, numero_aula
         FROM horarios
        WHERE professor_id = ANY($1)`,
      [profIds]
    )).rows;

    const horarioSlots = (await client.query(
      `SELECT turno, numero_aula, letivo FROM horario_slots WHERE escola_id = $1`,
      [escolaId]
    )).rows;
    const maxAulaPorTurno = new Map();
    for (const s of horarioSlots) {
      if (!s.letivo) continue;
      const atual = maxAulaPorTurno.get(s.turno) ?? 0;
      if (s.numero_aula > atual) maxAulaPorTurno.set(s.turno, s.numero_aula);
    }

    const ocupado = new Map();
    for (const h of horarios) {
      const turno = turmaTurnoMap.get(h.turma_id);
      if (!turno) continue;
      if (!ocupado.has(h.professor_id)) ocupado.set(h.professor_id, new Map());
      const porTurno = ocupado.get(h.professor_id);
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

    const candidatas = [];
    for (const ha of haAuto) {
      const porTurno = ocupado.get(ha.professor_id);
      const ocupadoNesseTurno = porTurno?.get(ha.turno) ?? new Set();
      const maxAula = maxAulaPorTurno.get(ha.turno) ?? 6;

      const antesOcupado = ocupadoNesseTurno.has(`${ha.dia_semana}-${ha.horario_slot - 1}`);
      const depoisOcupado = ocupadoNesseTurno.has(`${ha.dia_semana}-${ha.horario_slot + 1}`);
      const tapaBuracoReal = antesOcupado && depoisOcupado;
      const naBorda = ha.horario_slot === 1 || ha.horario_slot === maxAula;

      if (!tapaBuracoReal && !naBorda) {
        candidatas.push(ha);
      }
    }

    console.log(`Escola: ${escolaId}`);
    console.log(`Total de HA automaticas: ${haAuto.length}`);
    console.log(`Candidatas a reposicionamento (nao tapam buraco real, nao estao na borda): ${candidatas.length}\n`);

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
      console.log("Depois de remover, a proxima geracao/promocao de grade recria essas HA");
      console.log("automaticamente, ja usando a logica corrigida (preferencia por bordas do dia).");
      return;
    }

    const ids = candidatas.map((c) => c.id);
    await client.query(
      `DELETE FROM disponibilidade_professores WHERE id = ANY($1)`,
      [ids]
    );
    console.log(`\nAPLICADO: ${ids.length} HA mal posicionadas removidas.`);
    console.log("Gere ou promova uma grade para que sejam recriadas na posicao correta.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("ERRO:", err.message);
  process.exit(1);
});
