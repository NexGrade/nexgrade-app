// SO LEITURA -- checa, pra cada professor que da aula no MATUTINO, se
// a quantidade de aulas exigida pela matriz curricular cabe na
// quantidade de slots disponiveis (nao bloqueados) que ele tem nesse
// turno. Se a exigencia > disponibilidade, o professor esta
// genuinamente sobrecarregado -- explica por que o CP-SAT pode estar
// travando em UNKNOWN mesmo na fase rapida (so-turma).
const { Client } = require("pg");
const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";
const TURNO = "matutino";
const AULAS_POR_DIA = 6;
const DIAS = 5;

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // carga exigida por professor (soma de carga_horaria_semanal_override,
  // fallback pra cargaSemanal da disciplina quando null)
  const carga = await client.query(`
    SELECT td.professor_id, p.nome,
           SUM(COALESCE(td.carga_horaria_semanal_override, d.carga_semanal, 0))::int AS carga_exigida
    FROM turma_disciplinas td
    JOIN turmas t ON t.id = td.turma_id
    JOIN professores p ON p.id = td.professor_id
    JOIN disciplinas d ON d.id = td.disciplina_id
    WHERE t.escola_id = $1 AND t.turno = $2 AND td.professor_id IS NOT NULL
    GROUP BY td.professor_id, p.nome
    ORDER BY p.nome
  `, [ESCOLA_ID, TURNO]);

  // bloqueios por professor nesse turno
  const bloqueios = await client.query(`
    SELECT professor_id, COUNT(*)::int AS qtd_bloqueada
    FROM disponibilidade_professores
    WHERE turno = $1 AND disponivel = false
    GROUP BY professor_id
  `, [TURNO]);
  const bloqueioPorProf = new Map(bloqueios.rows.map(r => [r.professor_id, r.qtd_bloqueada]));

  const TOTAL_SLOTS = AULAS_POR_DIA * DIAS; // 30

  console.log(`Total de slots por professor no ${TURNO}: ${TOTAL_SLOTS} (${AULAS_POR_DIA} aulas/dia x ${DIAS} dias)\n`);
  console.log("Professores SOBRECARREGADOS (exigido > disponivel):");
  let algumSobrecarregado = false;
  for (const row of carga.rows) {
    const bloqueado = bloqueioPorProf.get(row.professor_id) ?? 0;
    const disponivel = TOTAL_SLOTS - bloqueado;
    if (row.carga_exigida > disponivel) {
      algumSobrecarregado = true;
      console.log(`  ${row.nome}: exige ${row.carga_exigida} aula(s)/semana, so tem ${disponivel} slot(s) livre(s) (${bloqueado} bloqueado(s) de ${TOTAL_SLOTS})`);
    }
  }
  if (!algumSobrecarregado) console.log("  (nenhum)");

  console.log("\nProfessores no limite (folga <= 2 slots, pode ficar dificil pro solver mesmo sem estourar):");
  for (const row of carga.rows) {
    const bloqueado = bloqueioPorProf.get(row.professor_id) ?? 0;
    const disponivel = TOTAL_SLOTS - bloqueado;
    const folga = disponivel - row.carga_exigida;
    if (folga >= 0 && folga <= 2) {
      console.log(`  ${row.nome}: exige ${row.carga_exigida}, disponivel ${disponivel}, folga ${folga}`);
    }
  }

  await client.end();
}
main().catch(err => { console.error(err); process.exit(1); });
