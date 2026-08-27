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
const DIA_QUINTA = 3; // 0=Segunda ... 4=Sexta
const PERIODOS = [1, 2, 3]; // 13:05, 13:55, 14:45

async function main() {
  const client = new Client({ connectionString: carregarDatabaseUrl() });
  await client.connect();
  try {
    const [prof] = (await client.query(`SELECT id, nome FROM professores WHERE nome = 'Simone' AND escola_id = 'org_3HCMsuYeAwkggR1dxXNzEdzNaX8'`)).rows;
    if (!prof) { console.log('Professora nao encontrada.'); return; }

    console.log(`Modo: ${APLICAR ? 'APLICAR' : 'DRY-RUN'}`);
    console.log(`Professora: ${prof.nome} (id=${prof.id})`);
    console.log(`Vai criar HA em: Quinta, periodos ${PERIODOS.join(', ')} (vespertino)\n`);

    if (!APLICAR) {
      console.log('DRY-RUN -- rode com --aplicar pra gravar de fato.');
      return;
    }

    for (const periodo of PERIODOS) {
      await client.query(
        `INSERT INTO disponibilidade_professores (professor_id, dia_semana, horario_slot, turno, disponivel, hora_atividade_obrigatoria, motivo)
         VALUES ($1, $2, $3, 'vespertino', true, true, 'Hora-atividade em contraturno (decisao institucional -- coordenacao e direcao)')`,
        [prof.id, DIA_QUINTA, periodo]
      );
      console.log(`  Criado: Quinta, periodo ${periodo}`);
    }
    console.log('\nPronto.');
  } finally {
    await client.end();
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
