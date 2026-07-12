import pg from 'pg';
const c = new pg.Client({connectionString: process.env.DATABASE_URL, ssl:{rejectUnauthorized:false}});
await c.connect();
const checks = [
  ["aulas_fixas", "SELECT COUNT(*) FROM aulas_fixas"],
  ["professores.abreviatura", "SELECT COUNT(*) FROM professores WHERE abreviatura IS NOT NULL"],
  ["disciplinas.abreviatura", "SELECT COUNT(*) FROM disciplinas WHERE abreviatura IS NOT NULL"],
  ["turma_disciplinas.professor_id", "SELECT COUNT(*) FROM turma_disciplinas WHERE professor_id IS NOT NULL"],
  ["horarios.modalidade", "SELECT COUNT(*) FROM horarios WHERE modalidade IS NOT NULL"],
  ["matrizes_curriculares.codigo_matriz_sere", "SELECT COUNT(*) FROM matrizes_curriculares WHERE codigo_matriz_sere IS NOT NULL"],
];
for (const [label, sql] of checks) {
  try {
    const r = await c.query(sql);
    console.log(`${label}: ${r.rows[0].count} registros`);
  } catch (e) {
    console.log(`${label}: NÃO EXISTE (${e.message})`);
  }
}
await c.end();