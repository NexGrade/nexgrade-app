const { Client } = require("pg");
const fs = require("fs");
const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";
const conteudo = fs.readFileSync(".env", "utf8");
const linha = conteudo.split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
const url = linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");

const TABELA_OFICIAL_HA = [
  0,
  0, 0, 1, 1, 2, 2, 2, 2, 3, 3,
  4, 4, 4, 4, 5, 5, 5, 6, 6, 6,
  7, 7, 7, 8, 8, 8, 9, 9, 10, 10,
];
function calcularHoraAtividadeInstitucional(aulasNoTurno) {
  if (!aulasNoTurno || aulasNoTurno <= 0) return 0;
  if (aulasNoTurno <= 30) return TABELA_OFICIAL_HA[Math.round(aulasNoTurno)];
  return Math.ceil(aulasNoTurno / 3);
}
function calcularHoraAtividadePorTurno(aulasPorTurno) {
  const turnos = Object.keys(aulasPorTurno);
  const totalAulas = turnos.reduce((soma, t) => soma + (aulasPorTurno[t] || 0), 0);
  if (totalAulas <= 0) {
    const zeros = {};
    turnos.forEach((t) => (zeros[t] = 0));
    return zeros;
  }
  const exigidoTotal = calcularHoraAtividadeInstitucional(totalAulas);
  const partes = turnos.map((turno) => {
    const aulas = aulasPorTurno[turno] || 0;
    const proporcional = (aulas / totalAulas) * exigidoTotal;
    return { turno, base: Math.floor(proporcional), resto: proporcional - Math.floor(proporcional) };
  });
  let alocado = partes.reduce((soma, p) => soma + p.base, 0);
  let faltam = exigidoTotal - alocado;
  const ordenadoPorResto = [...partes].sort((a, b) => b.resto - a.resto);
  for (let i = 0; i < ordenadoPorResto.length && faltam > 0; i++) {
    ordenadoPorResto[i].base += 1;
    faltam--;
  }
  const resultado = {};
  partes.forEach((p) => (resultado[p.turno] = p.base));
  return resultado;
}

async function main() {
  const client = new Client({ connectionString: url });
  await client.connect();

  console.log("=== 1. Colunas da tabela professores ===");
  try {
    const cols = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'professores' ORDER BY ordinal_position`
    );
    console.log(cols.rows.map(r => r.column_name).join(", "));
  } catch (e) { console.log("ERRO:", e.message); }

  console.log("\n=== 2. Colunas da tabela horarios ===");
  try {
    const cols = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'horarios' ORDER BY ordinal_position`
    );
    console.log(cols.rows.map(r => r.column_name).join(", "));
  } catch (e) { console.log("ERRO:", e.message); }

  console.log("\n=== 3. Pente fino: recalculo de HA por professor ===");
  try {
    const professores = await client.query(
      `SELECT id, nome, carga_horaria_total FROM professores WHERE escola_id = $1 AND carga_horaria_total > 0 ORDER BY nome`,
      [ESCOLA_ID]
    );
    const disciplinasSemTurma = await client.query(
      `SELECT id FROM disciplinas WHERE escola_id = $1 AND sem_turma = true`,
      [ESCOLA_ID]
    );
    const idsSemTurma = new Set(disciplinasSemTurma.rows.map(r => r.id));

    const resultado = [];
    for (const prof of professores.rows) {
      const aulas = await client.query(
        `SELECT h.disciplina_id, t.turno FROM horarios h JOIN turmas t ON t.id = h.turma_id WHERE h.professor_id = $1`,
        [prof.id]
      );
      const turnosComAula = {};
      aulas.rows.forEach(a => {
        if (idsSemTurma.has(a.disciplina_id)) return;
        turnosComAula[a.turno] = (turnosComAula[a.turno] || 0) + 1;
      });
      const haPorTurno = calcularHoraAtividadePorTurno(turnosComAula);
      const exigidoCalculado = Object.values(haPorTurno).reduce((a, b) => a + b, 0);

      const haMarcadas = await client.query(
        `SELECT COUNT(*)::int as total FROM disponibilidade_professores WHERE professor_id = $1 AND hora_atividade_obrigatoria = true`,
        [prof.id]
      );
      const marcadasCalculado = haMarcadas.rows[0].total;

      const turnosComHA = await client.query(
        `SELECT DISTINCT turno FROM disponibilidade_professores WHERE professor_id = $1 AND hora_atividade_obrigatoria = true AND turno IS NOT NULL`,
        [prof.id]
      );
      const temHAAlgumTurno = turnosComHA.rows.length > 0;

      if (exigidoCalculado > 0 && marcadasCalculado < exigidoCalculado) {
        resultado.push({
          professor: prof.nome,
          tipo: "hora_atividade_insuficiente",
          exigido_calculado: exigidoCalculado,
          marcadas_calculado: marcadasCalculado,
          turnos: JSON.stringify(turnosComAula),
        });
      }
      Object.entries(turnosComAula).forEach(([turno, total]) => {
        if (total <= 19 && !temHAAlgumTurno) {
          resultado.push({
            professor: prof.nome,
            tipo: "hora_atividade_turno_incorreto",
            turno,
            aulas_no_turno: total,
            tem_ha_algum_turno: temHAAlgumTurno,
          });
        }
      });
    }
    console.log(`Total de conflitos de HA recalculados do zero: ${resultado.length}`);
    console.table(resultado);
  } catch (e) {
    console.log("ERRO no pente fino:", e.message);
  }

  await client.end();
}
main().catch((err) => { console.error("ERRO GERAL:", err.message); process.exit(1); });
