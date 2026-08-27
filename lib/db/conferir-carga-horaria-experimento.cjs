/**
 * conferir-carga-horaria-experimento.cjs
 * Script SOMENTE LEITURA.
 *
 * Compara, para cada turma+disciplina, quantas aulas foram GERADAS no
 * experimento contra quantas DEVERIAM ter sido geradas (carga horaria
 * semanal esperada), usando a mesma logica de resolucao que o backend
 * usa em runCpsatGeneration:
 *   turma_disciplinas.carga_horaria_semanal_override
 *   ?? itens_matriz.carga_horaria_semanal (via matriz_curricular_id + disciplina_id)
 *   ?? disciplinas.carga_semanal
 *
 * Uso:
 *   node conferir-carga-horaria-experimento.cjs --nome="Lote-2026-08-13" --escola=org_3HCMsuYeAwkggR1dxXNzEdzNaX8
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function carregarDatabaseUrl() {
  const conteudo = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  const linha = conteudo.split('\n').find((l) => l.trim().startsWith('DATABASE_URL='));
  let valor = linha.slice(linha.indexOf('=') + 1).trim();
  return valor.replace(/^["']|["']$/g, '');
}

function parseArgs() {
  const args = {};
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  }
  return {
    nome: args.nome ?? 'Lote-2026-08-13',
    escolaId: args.escola ?? 'org_3HCMsuYeAwkggR1dxXNzEdzNaX8',
  };
}

async function main() {
  const { nome, escolaId } = parseArgs();
  const linhasSaida = [];
  const log = (msg = '') => { linhasSaida.push(String(msg)); console.log(msg); };

  const client = new Client({ connectionString: carregarDatabaseUrl() });
  await client.connect();
  try {
    log(`Conferindo experimento "${nome}" (escola=${escolaId})\n`);

    const expSlots = (await client.query(
      `SELECT turma_id, disciplina_id, COUNT(*) AS gerado
       FROM horarios_experimentais
       WHERE nome = $1 AND escola_id = $2
       GROUP BY turma_id, disciplina_id`,
      [nome, escolaId]
    )).rows;

    if (expSlots.length === 0) {
      log('[AVISO] Nenhum slot encontrado para esse nome de experimento nessa escola. Confira o nome exato.');
      return;
    }

    const turmaIds = [...new Set(expSlots.map((s) => s.turma_id))];

    const turmas = (await client.query(`SELECT id, nome, matriz_curricular_id FROM turmas WHERE id = ANY($1)`, [turmaIds])).rows;
    const turmaMap = new Map(turmas.map((t) => [t.id, t]));

    const disciplinaIds = [...new Set(expSlots.map((s) => s.disciplina_id))];
    const disciplinas = (await client.query(`SELECT id, nome, carga_semanal FROM disciplinas WHERE id = ANY($1)`, [disciplinaIds])).rows;
    const discMap = new Map(disciplinas.map((d) => [d.id, d]));

    const turmaDiscs = (await client.query(
      `SELECT turma_id, disciplina_id, carga_horaria_semanal_override
       FROM turma_disciplinas WHERE turma_id = ANY($1)`,
      [turmaIds]
    )).rows;
    const turmaDiscMap = new Map(turmaDiscs.map((td) => [`${td.turma_id}-${td.disciplina_id}`, td]));

    const matrizIds = [...new Set(turmas.map((t) => t.matriz_curricular_id).filter((id) => id != null))];
    const itensMatriz = matrizIds.length > 0
      ? (await client.query(`SELECT matriz_curricular_id, disciplina_id, carga_horaria_semanal FROM itens_matriz WHERE matriz_curricular_id = ANY($1)`, [matrizIds])).rows
      : [];
    const itensMatrizMap = new Map(itensMatriz.map((im) => [`${im.matriz_curricular_id}-${im.disciplina_id}`, im]));

    let totalOk = 0;
    let totalDivergente = 0;
    let totalSemExpectativa = 0;
    const divergencias = [];

    for (const s of expSlots) {
      const turma = turmaMap.get(s.turma_id);
      const disc = discMap.get(s.disciplina_id);
      const td = turmaDiscMap.get(`${s.turma_id}-${s.disciplina_id}`);
      const itemMatriz = turma?.matriz_curricular_id != null
        ? itensMatrizMap.get(`${turma.matriz_curricular_id}-${s.disciplina_id}`)
        : undefined;

      const esperado = td?.carga_horaria_semanal_override
        ?? itemMatriz?.carga_horaria_semanal
        ?? disc?.carga_semanal
        ?? null;

      const gerado = Number(s.gerado);

      if (esperado == null) {
        totalSemExpectativa++;
        divergencias.push({
          turma: turma?.nome ?? `#${s.turma_id}`,
          disciplina: disc?.nome ?? `#${s.disciplina_id}`,
          esperado: 'SEM EXPECTATIVA (nao achei carga configurada)',
          gerado,
        });
        continue;
      }

      if (gerado === esperado) {
        totalOk++;
      } else {
        totalDivergente++;
        divergencias.push({
          turma: turma?.nome ?? `#${s.turma_id}`,
          disciplina: disc?.nome ?? `#${s.disciplina_id}`,
          esperado,
          gerado,
        });
      }
    }

    log(`Total de combinações turma+disciplina no experimento: ${expSlots.length}`);
    log(`Bateram certinho (gerado == esperado): ${totalOk}`);
    log(`Divergentes (gerado != esperado): ${totalDivergente}`);
    log(`Sem carga horária configurada pra comparar: ${totalSemExpectativa}\n`);

    if (divergencias.length > 0) {
      log('=== Detalhe das divergências ===');
      for (const d of divergencias) {
        log(`  ${d.turma} | ${d.disciplina} | esperado=${d.esperado} | gerado=${d.gerado}`);
      }
    } else {
      log('Nenhuma divergência -- carga horária bateu 100% em todas as combinações.');
    }

  } finally {
    await client.end();
    fs.writeFileSync(path.join(__dirname, `conferir-carga-horaria-relatorio-${Date.now()}.txt`), linhasSaida.join('\n'), { encoding: 'utf8' });
  }
}

main().catch((err) => { console.error('Erro:', err); process.exitCode = 1; });
