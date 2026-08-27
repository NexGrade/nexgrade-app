const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function carregarDatabaseUrl() {
  const conteudo = fs.readFileSync(path.join('lib', 'db', '.env'), 'utf8');
  const linha = conteudo.split('\n').find((l) => l.trim().startsWith('DATABASE_URL='));
  let valor = linha.slice(linha.indexOf('=') + 1).trim();
  return valor.replace(/^["']|["']$/g, '');
}

const APLICAR = process.argv.includes('--aplicar');

async function main() {
  const client = new Client({ connectionString: carregarDatabaseUrl() });
  await client.connect();
  try {
    const rows = (await client.query(
      `SELECT id, professor_id, dia_semana, horario_slot, turno, disponivel, hora_atividade_obrigatoria, motivo
       FROM disponibilidade_professores ORDER BY professor_id, turno, dia_semana, horario_slot`
    )).rows;

    const grupos = new Map();
    for (const r of rows) {
      const chave = `${r.professor_id}-${r.turno}-${r.dia_semana}-${r.horario_slot}`;
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave).push(r);
    }

    const idsParaRemover = [];
    let celulasComConflito = 0;
    for (const [chave, regs] of grupos.entries()) {
      if (regs.length <= 1) continue;
      celulasComConflito++;
      // Prioridade: BLOQUEIO manual (sem motivo automatico) > BLOQUEIO
      // automatico > HA > disponivel solto. Mantem so o de maior
      // prioridade, remove o resto.
      function prioridade(r) {
        if (!r.disponivel && !r.motivo) return 3; // bloqueio manual, sem motivo -- mais confiavel
        if (!r.disponivel) return 2; // bloqueio automatico
        if (r.hora_atividade_obrigatoria) return 1; // HA automatica
        return 0; // "disponivel" solto -- artefato, menor prioridade
      }
      const ordenado = [...regs].sort((a, b) => prioridade(b) - prioridade(a));
      const manter = ordenado[0];
      const remover = ordenado.slice(1);
      idsParaRemover.push(...remover.map(r => r.id));
    }

    console.log(`Modo: ${APLICAR ? 'APLICAR' : 'DRY-RUN'}`);
    console.log(`Celulas com conflito (mais de 1 registro): ${celulasComConflito}`);
    console.log(`Linhas a remover: ${idsParaRemover.length}`);

    if (idsParaRemover.length === 0) { console.log('Nada a fazer.'); return; }

    if (APLICAR) {
      await client.query(`DELETE FROM disponibilidade_professores WHERE id = ANY($1)`, [idsParaRemover]);
      console.log(`Removidas ${idsParaRemover.length} linhas conflitantes.`);
    } else {
      console.log('DRY-RUN -- rode com --aplicar pra remover de fato.');
    }
  } finally {
    await client.end();
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
