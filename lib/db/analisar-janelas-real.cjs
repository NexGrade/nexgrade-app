const { Client } = require("pg");
const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";

const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(async () => {
    const rows = await client.query(`
      SELECT h.professor_id, p.nome AS professor_nome, h.dia_semana, h.numero_aula,
             t.turno, t.nome AS turma_nome
      FROM horarios h
      JOIN professores p ON p.id = h.professor_id
      JOIN turmas t ON t.id = h.turma_id
      WHERE h.escola_id = $1
      ORDER BY p.nome, t.turno, h.dia_semana, h.numero_aula;
    `, [ESCOLA_ID]);

    // agrupa por (professor, turno, dia) -- janelas fazem sentido dentro do mesmo turno/dia
    const grupos = {};
    for (const r of rows.rows) {
      const key = `${r.professor_id}|${r.turno}|${r.dia_semana}`;
      if (!grupos[key]) grupos[key] = { nome: r.professor_nome, aulas: [], turmas: [] };
      grupos[key].aulas.push(r.numero_aula);
      grupos[key].turmas.push(r.turma_nome);
    }

    const stats = { zero: 0, um: 0, doisOuMais: 0 };
    let totalJanelas = 0;
    let totalTrocaTurmaConsecutiva = 0;
    let totalConsecutivos = 0;
    const exemplosComJanela = [];

    for (const key in grupos) {
      const g = grupos[key];
      if (g.aulas.length < 2) continue;
      const unicos = [...new Set(g.aulas)].sort((a, b) => a - b);
      const primeiro = unicos[0], ultimo = unicos[unicos.length - 1];
      const esperado = ultimo - primeiro + 1;
      const janelas = esperado - unicos.length;

      if (janelas === 0) stats.zero++;
      else if (janelas === 1) stats.um++;
      else stats.doisOuMais++;
      totalJanelas += janelas;

      if (janelas > 0 && exemplosComJanela.length < 10) {
        exemplosComJanela.push(`${g.nome} | aulas ocupadas: [${unicos.join(",")}] | ${janelas} janela(s)`);
      }

      // verifica troca de turma entre aulas consecutivas (sem janela)
      for (let i = 1; i < g.aulas.length; i++) {
        if (g.aulas[i] === g.aulas[i - 1] + 1) {
          totalConsecutivos++;
          if (g.turmas[i] !== g.turmas[i - 1]) totalTrocaTurmaConsecutiva++;
        }
      }
    }

    const total = stats.zero + stats.um + stats.doisOuMais;
    console.log(`Total professor+turno+dia (2+ aulas): ${total}`);
    console.log(`  0 janelas: ${stats.zero} (${(100 * stats.zero / total).toFixed(1)}%)`);
    console.log(`  1 janela: ${stats.um} (${(100 * stats.um / total).toFixed(1)}%)`);
    console.log(`  2+ janelas: ${stats.doisOuMais} (${(100 * stats.doisOuMais / total).toFixed(1)}%)`);
    console.log(`  Média de janelas por dia: ${(totalJanelas / total).toFixed(2)}`);
    console.log(`\nDe ${totalConsecutivos} pares de aulas consecutivas (sem janela):`);
    console.log(`  ${totalTrocaTurmaConsecutiva} (${(100 * totalTrocaTurmaConsecutiva / totalConsecutivos).toFixed(1)}%) trocam de turma`);
    console.log(`  ${totalConsecutivos - totalTrocaTurmaConsecutiva} (${(100 * (totalConsecutivos - totalTrocaTurmaConsecutiva) / totalConsecutivos).toFixed(1)}%) ficam na mesma turma`);

    console.log(`\nExemplos com janela:`);
    exemplosComJanela.forEach(e => console.log("  " + e));

    return client.end();
  })
  .catch(err => { console.error(err); return client.end(); });
