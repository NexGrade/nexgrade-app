/**
 * conferir-carga-horaria-oficial-por-turno.cjs
 * Script SOMENTE LEITURA.
 *
 * Mesma conferencia de carga horaria de antes, mas olhando a tabela
 * OFICIAL (horarios), filtrando por turno -- usa isso depois que um
 * experimento ja foi promovido (nesse momento ele sai de
 * horarios_experimentais e nao tem mais "nome" pra filtrar).
 *
 * Uso:
 *   node conferir-carga-horaria-oficial-por-turno.cjs --turno=matutino --escola=org_3HCMsuYeAwkggR1dxXNzEdzNaX8
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
    turno: args.turno ?? 'matutino',
    escolaId: args.escola ?? 'org_3HCMsuYeAwkggR1dxXNzEdzNaX8',
  };
}

async function main() {
  const { turno, escolaId } = parseArgs();
  const linhasSaida = [];
  const log = (msg = '') => { linhasSaida.push(String(msg)); console.log(msg); };

  const client = new Client({ connectionString: carregarDatabaseUrl() });
  await client.connect();
  try {
    log(`Conferindo grade OFICIAL do turno "${turno}" (escola=${escolaId})\n`);

    const turmasDoTurno = (await client.query(
      `SELECT id, nome, matriz_curricular_id FROM turmas WHERE escola_id = $1 AND turno = $2`,
      [escolaId, turno]
    )).rows;
    const turmaIds = turmasDoTurno.map((t) => t.id);
    if (turmaIds.length === 0) {
      log(`[AVISO] Nenhuma turma encontrada nesse turno.`);
      return;
    }
    const turmaMap = new Map(turmasDoTurno.map((t) => [t.id, t]));

    const slots = (await client.query(
      `SELECT turma_id, disciplina_id, COUNT(*) AS gerado
       FROM horarios
       WHERE escola_id = $1 AND turma_id = ANY($2)
       GROUP BY turma_id, disciplina_id`,
      [escolaId, turmaIds]
    )).rows;

    if (slots.length === 0) {
      log('[AVISO] Nenhum horário oficial encontrado pra essas turmas. Talvez ainda não tenha sido promovido.');
      return;
    }

    const disciplinaIds = [...new Set(slots.map((s) => s.disciplina_id))];
    const disciplinas = (await client.query(`SELECT id, nome, carga_semanal FROM disciplinas WHERE id = ANY($1)`, [disciplinaIds])).rows;
    const discMap = new Map(disciplinas.map((d) => [d.id, d]));

    const turmaDiscs = (await client.query(
      `SELECT turma_id, disciplina_id, carga_horaria_semanal_override FROM turma_disciplinas WHERE turma_id = ANY($1)`,
      [turmaIds]
    )).rows;
    const turmaDiscMap = new Map(turmaDiscs.map((td) => [`${td.turma_id}-${td.disciplina_id}`, td]));

    const matrizIds = [...new Set(turmasDoTurno.map((t) => t.matriz_curricular_id).filter((id) => id != null))];
    const itensMatriz = matrizIds.length > 0
      ? (await client.query(`SELECT matriz_curricular_id, disciplina_id, carga_horaria_semanal FROM itens_matriz WHERE matriz_curricular_id = ANY($1)`, [matrizIds])).rows
      : [];
    const itensMatrizMap = new Map(itensMatriz.map((im) => [`${im.matriz_curricular_id}-${im.disciplina_id}`, im]));

    // Co-docencia: agrupa por turma+disciplina+dia+aula pra contar
    // AULAS (nao linhas de professor). Cada linha em `horarios` tem
    // dia_semana/numero_aula tambem -- refaz a contagem certa aqui.
    const aulasReais = (await client.query(
      `SELECT turma_id, disciplina_id, dia_semana, numero_aula
       FROM horarios WHERE escola_id = $1 AND turma_id = ANY($2)`,
      [escolaId, turmaIds]
    )).rows;
    const aulaSet = new Map(); // chave turma-disc -> Set de "dia-aula" distintos
    for (const a of aulasReais) {
      const chave = `${a.turma_id}-${a.disciplina_id}`;
      if (!aulaSet.has(chave)) aulaSet.set(chave, new Set());
      aulaSet.get(chave).add(`${a.dia_semana}-${a.numero_aula}`);
    }

    let totalOk = 0, totalDivergente = 0, totalSemExpectativa = 0;
    const divergencias = [];

    for (const [chave, setAulas] of aulaSet.entries()) {
      const [turmaIdStr, discIdStr] = chave.split('-');
      const turmaId = Number(turmaIdStr), discId = Number(discIdStr);
      const turma = turmaMap.get(turmaId);
      const disc = discMap.get(discId);
      const td = turmaDiscMap.get(chave);
      const itemMatriz = turma?.matriz_curricular_id != null ? itensMatrizMap.get(`${turma.matriz_curricular_id}-${discId}`) : undefined;
      const esperado = td?.carga_horaria_semanal_override ?? itemMatriz?.carga_horaria_semanal ?? disc?.carga_semanal ?? null;
      const gerado = setAulas.size; // aulas distintas (dia,aula), independente de quantos professores

      if (esperado == null) {
        totalSemExpectativa++;
        divergencias.push({ turma: turma?.nome ?? `#${turmaId}`, disciplina: disc?.nome ?? `#${discId}`, esperado: 'SEM EXPECTATIVA', gerado });
        continue;
      }
      if (gerado === esperado) totalOk++;
      else {
        totalDivergente++;
        divergencias.push({ turma: turma?.nome ?? `#${turmaId}`, disciplina: disc?.nome ?? `#${discId}`, esperado, gerado });
      }
    }

    log(`Total de combinações turma+disciplina: ${aulaSet.size}`);
    log(`Bateram certinho: ${totalOk}`);
    log(`Divergentes: ${totalDivergente}`);
    log(`Sem carga horária pra comparar: ${totalSemExpectativa}\n`);

    if (divergencias.length > 0) {
      log('=== Detalhe das divergências ===');
      for (const d of divergencias) log(`  ${d.turma} | ${d.disciplina} | esperado=${d.esperado} | gerado=${d.gerado}`);
    } else {
      log('Nenhuma divergência -- carga horária bateu 100%.');
    }

  } finally {
    await client.end();
    fs.writeFileSync(path.join(__dirname, `conferir-oficial-${turno}-${Date.now()}.txt`), linhasSaida.join('\n'), { encoding: 'utf8' });
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
