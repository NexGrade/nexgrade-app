const { Client } = require("pg");
const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";
const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex"];
const NOMES = ["Rafael Belo", "Robson dos Santos Amaral", "Alecksey", "Márcio Augusto"];

const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(async () => {
    for (const nome of NOMES) {
      const prof = (await client.query(
        `SELECT id, nome FROM professores WHERE nome = $1 AND escola_id = $2`,
        [nome, ESCOLA_ID]
      )).rows[0];
      if (!prof) { console.log(`\n=== ${nome}: NÃO ENCONTRADO ===`); continue; }

      console.log(`\n=== ${prof.nome} ===`);

      const bloqueiosDiaInteiro = (await client.query(`
        SELECT turno, dia_semana, COUNT(*)::int AS qtd_bloqueada
        FROM disponibilidade_professores
        WHERE professor_id = $1 AND disponivel = false
        GROUP BY turno, dia_semana
        HAVING COUNT(*) >= 4
      `, [prof.id])).rows;
      console.log("Dias quase/totalmente bloqueados (4+ slots indisponíveis):");
      bloqueiosDiaInteiro.forEach(b => console.log(`  ${b.turno} ${DIAS[b.dia_semana]}: ${b.qtd_bloqueada} slots bloqueados`));

      const ocupacaoPorDia = (await client.query(`
        SELECT t.turno, h.dia_semana, COUNT(*)::int AS aulas_no_dia
        FROM horarios h JOIN turmas t ON t.id = h.turma_id
        WHERE h.professor_id = $1 AND h.escola_id = $2
        GROUP BY t.turno, h.dia_semana
        ORDER BY t.turno, h.dia_semana
      `, [prof.id, ESCOLA_ID])).rows;
      console.log("Aulas reais por dia:");
      ocupacaoPorDia.forEach(o => console.log(`  ${o.turno} ${DIAS[o.dia_semana]}: ${o.aulas_no_dia} aula(s)`));
    }
    return client.end();
  })
  .catch(err => { console.error(err); return client.end(); });
