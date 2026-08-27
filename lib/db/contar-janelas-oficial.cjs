/**
 * contar-janelas-oficial.cjs
 *
 * Consulta a grade OFICIAL real (tabela horarios) de uma escola/turno
 * e conta janelas de professor -- buracos entre a primeira e ultima
 * aula ocupada do dia, considerando tanto aulas reais quanto HA
 * marcada como ocupacao (ja que HA tambem "tapa" o horario do
 * professor, ele nao fica livre).
 *
 * Uso:
 *   node contar-janelas-oficial.cjs --escola=ORG_ID --turno=matutino
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

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
  return { escolaId: args.escola ?? null, turno: args.turno ?? null };
}

async function main() {
  const { escolaId, turno } = parseArgs();
  if (!escolaId || !turno) {
    throw new Error("Informe --escola=ORG_ID --turno=matutino");
  }

  const client = new Client({ connectionString: carregarDatabaseUrl() });
  await client.connect();

  try {
    const professores = (await client.query(
      `SELECT id, nome FROM professores WHERE escola_id = $1`,
      [escolaId]
    )).rows;
    const profMap = new Map(professores.map((p) => [p.id, p.nome]));
    const profIds = professores.map((p) => p.id);

    const turmas = (await client.query(
      `SELECT id, turno FROM turmas WHERE escola_id = $1 AND turno = $2`,
      [escolaId, turno]
    )).rows;
    const turmaIds = new Set(turmas.map((t) => t.id));

    const horarios = (await client.query(
      `SELECT professor_id, turma_id, dia_semana, numero_aula
         FROM horarios
        WHERE professor_id = ANY($1)`,
      [profIds]
    )).rows.filter((h) => turmaIds.has(h.turma_id));

    const haReal = (await client.query(
      `SELECT professor_id, dia_semana, horario_slot
         FROM disponibilidade_professores
        WHERE professor_id = ANY($1)
          AND turno = $2
          AND hora_atividade_obrigatoria = true`,
      [profIds, turno]
    )).rows;

    const ocupado = new Map();
    for (const h of horarios) {
      if (!ocupado.has(h.professor_id)) ocupado.set(h.professor_id, new Set());
      ocupado.get(h.professor_id).add(`${h.dia_semana}-${h.numero_aula}`);
    }
    for (const ha of haReal) {
      if (!ocupado.has(ha.professor_id)) ocupado.set(ha.professor_id, new Set());
      ocupado.get(ha.professor_id).add(`${ha.dia_semana}-${ha.horario_slot}`);
    }

    let totalJanelas = 0;
    const porProfessor = [];

    for (const [profId, slots] of ocupado.entries()) {
      const porDia = new Map();
      for (const chave of slots) {
        const [dia, aula] = chave.split("-").map(Number);
        if (!porDia.has(dia)) porDia.set(dia, new Set());
        porDia.get(dia).add(aula);
      }
      let janelasDoProf = 0;
      for (const aulas of porDia.values()) {
        if (aulas.size < 2) continue;
        const min = Math.min(...aulas);
        const max = Math.max(...aulas);
        for (let a = min; a <= max; a++) {
          if (!aulas.has(a)) janelasDoProf++;
        }
      }
      if (janelasDoProf > 0) {
        porProfessor.push({ nome: profMap.get(profId), janelas: janelasDoProf });
      }
      totalJanelas += janelasDoProf;
    }

    porProfessor.sort((a, b) => b.janelas - a.janelas);

    console.log(`Escola: ${escolaId} | Turno: ${turno}`);
    console.log(`Total de janelas de professor (considerando HA como ocupacao): ${totalJanelas}\n`);
    console.log("Top professores com mais janelas:");
    for (const p of porProfessor.slice(0, 15)) {
      console.log(`  ${p.nome}: ${p.janelas}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("ERRO:", err.message);
  process.exit(1);
});
