// AUDITORIA DE INTEGRIDADE -- roda todas as verificacoes que
// descobrimos serem necessarias na sessao de 27/08/2026, num script
// so, somente leitura (nunca aplica nada sozinho). Pensado pra rodar
// periodicamente (depois de qualquer sincronizacao, geracao de grade,
// ou edicao manual da matriz curricular) pra pegar regressao cedo.
//
// Uso:
//   node auditoria-integridade.cjs
//
// Cada secao imprime quantos problemas achou. Zero em tudo = tudo
// certo. Se achar algo, os scripts de correcao especificos de cada
// categoria (ja usados hoje) resolvem -- esse script so DETECTA, nunca
// corrige sozinho.

const { Client } = require("pg");
const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("ERRO: DATABASE_URL não definida nesta sessão.");
    process.exit(1);
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  let totalProblemas = 0;

  console.log("=".repeat(70));
  console.log("AUDITORIA DE INTEGRIDADE —", new Date().toLocaleString("pt-BR"));
  console.log("=".repeat(70));

  // 1) Professor fixado na matriz diverge do professor real na grade
  // sincronizada -- mesma causa raiz do caso do Alecksey (substituto de
  // licença nunca atualizado quando a pessoa volta).
  console.log("\n[1] Professor fixado na matriz X professor real na grade");
  const divergenciasRaw = await client.query(`
    SELECT td.id AS matriz_id, td.turma_id, td.disciplina_id, td.professor_id AS fixado_id,
           t.nome AS turma, d.nome AS disciplina, pf.nome AS fixado
    FROM turma_disciplinas td
    JOIN turmas t ON t.id = td.turma_id
    JOIN disciplinas d ON d.id = td.disciplina_id
    LEFT JOIN professores pf ON pf.id = td.professor_id
    WHERE t.escola_id = $1 AND td.professor_id IS NOT NULL
  `, [ESCOLA_ID]);
  // [FIX] pra cada combo (turma,disciplina), compara o CONJUNTO de
  // professores da matriz com o CONJUNTO de professores reais na
  // grade -- nao so "o mais comum" (isso dava falso positivo em toda
  // dupla docencia legitima, ja que cada linha da dupla comparava
  // sozinha contra so 1 "dominante" arbitrario).
  const realPorCombo = await client.query(`
    SELECT turma_id, disciplina_id, array_agg(DISTINCT professor_id) AS profs_reais
    FROM horarios WHERE escola_id = $1
    GROUP BY turma_id, disciplina_id
  `, [ESCOLA_ID]);
  const realMap = new Map(realPorCombo.rows.map(r => [`${r.turma_id}-${r.disciplina_id}`, new Set(r.profs_reais)]));
  const matrizPorCombo = new Map();
  for (const row of divergenciasRaw.rows) {
    const chave = `${row.turma_id}-${row.disciplina_id}`;
    if (!matrizPorCombo.has(chave)) matrizPorCombo.set(chave, []);
    matrizPorCombo.get(chave).push(row);
  }
  let divergenciasReais = 0;
  for (const [chave, linhas] of matrizPorCombo) {
    const realSet = realMap.get(chave);
    if (!realSet) continue; // sem aula real ainda pra essa combinacao -- nao e divergencia
    const matrizSet = new Set(linhas.map(l => l.fixado_id));
    const igual = matrizSet.size === realSet.size && [...matrizSet].every(id => realSet.has(id));
    if (!igual) {
      const nomesFixados = linhas.map(l => l.fixado).join(" + ");
      console.log(`    ${linhas[0].turma} / ${linhas[0].disciplina}: matriz tem [${nomesFixados}], grade real tem outro conjunto de professores`);
      divergenciasReais++;
    }
  }
  console.log(`  ${divergenciasReais} divergência(s) real(is)`);
  totalProblemas += divergenciasReais;

  // 2) Pares de dupla docência incompletos: 2+ professores no mesmo
  // slot na grade real, mas a matriz só tem 1 linha (perderia o
  // segundo professor numa geração futura).
  console.log("\n[2] Duplas incompletas na matriz curricular");
  const duplasReais = await client.query(`
    SELECT h.turma_id, h.disciplina_id, COUNT(DISTINCT h.professor_id)::int AS profs_na_grade
    FROM horarios h WHERE h.escola_id = $1
    GROUP BY h.turma_id, h.disciplina_id, h.dia_semana, h.numero_aula
    HAVING COUNT(DISTINCT h.professor_id) > 1
  `, [ESCOLA_ID]);
  const combosComDupla = new Set(duplasReais.rows.map(r => `${r.turma_id}-${r.disciplina_id}`));
  let duplasIncompletas = 0;
  for (const combo of combosComDupla) {
    const [turmaId, disciplinaId] = combo.split("-");
    const linhasMatriz = await client.query(
      `SELECT COUNT(*)::int AS qtd FROM turma_disciplinas WHERE turma_id = $1 AND disciplina_id = $2`,
      [turmaId, disciplinaId]
    );
    if (linhasMatriz.rows[0].qtd < 2) {
      const info = await client.query(`
        SELECT t.nome AS turma, d.nome AS disciplina FROM turmas t, disciplinas d
        WHERE t.id = $1 AND d.id = $2
      `, [turmaId, disciplinaId]);
      console.log(`    ${info.rows[0]?.turma} / ${info.rows[0]?.disciplina}: grade real tem dupla, matriz só tem ${linhasMatriz.rows[0].qtd} linha(s)`);
      duplasIncompletas++;
    }
  }
  console.log(`  ${duplasIncompletas} dupla(s) incompleta(s)`);
  totalProblemas += duplasIncompletas;

  // 3) Disponibilidade marcada indisponível num slot que a grade real
  // já usa (mesmo padrão dos 356 casos corrigidos hoje).
  console.log("\n[3] Disponibilidade indisponível conflitando com grade real");
  const dispConflito = await client.query(`
    SELECT COUNT(*)::int AS total
    FROM horarios h
    JOIN disponibilidade_professores d
      ON d.professor_id = h.professor_id AND d.dia_semana = h.dia_semana AND d.horario_slot = h.numero_aula
    WHERE h.escola_id = $1 AND d.disponivel = false
  `, [ESCOLA_ID]);
  console.log(`  ${dispConflito.rows[0].total} conflito(s)`);
  totalProblemas += dispConflito.rows[0].total;

  // 4) Professor duplicado (mesma turma, mesmo slot, 2+ professores)
  // que NÃO está na lista de duplas conhecidas -- pode ser erro real
  // (tipo o caso da Gleiciane/Hibrida) em vez de dupla de propósito.
  console.log("\n[4] Professor duplicado no mesmo slot (mesma turma) -- revisar se é erro ou dupla de verdade");
  const profDuplicado = await client.query(`
    SELECT t.nome AS turma, h.dia_semana, h.numero_aula, COUNT(*)::int AS qtd,
           array_agg(DISTINCT p.nome) AS professores
    FROM horarios h
    JOIN turmas t ON t.id = h.turma_id
    JOIN professores p ON p.id = h.professor_id
    WHERE h.escola_id = $1
    GROUP BY t.nome, h.dia_semana, h.numero_aula
    HAVING COUNT(DISTINCT h.professor_id) > 1
  `, [ESCOLA_ID]);
  console.log(`  ${profDuplicado.rows.length} slot(s) com mais de um professor na mesma turma`);
  profDuplicado.rows.slice(0, 10).forEach(r => console.log(`    ${r.turma} dia=${r.dia_semana} aula=${r.numero_aula}: ${r.professores.join(" + ")}`));
  // nao soma em totalProblemas -- pode ser dupla legitima, é só um alerta pra revisar

  // 5) Esquema (horario_slots) x numeração real das aulas (horarios)
  // desalinhados -- causa "periodo_invalido" como o do noturno hoje.
  console.log("\n[5] numero_aula fora do esquema configurado (horario_slots)");
  const foraDoEsquema = await client.query(`
    SELECT t.turno, t.nome AS turma, h.numero_aula, COUNT(*)::int AS qtd
    FROM horarios h
    JOIN turmas t ON t.id = h.turma_id
    WHERE h.escola_id = $1
      AND NOT EXISTS (
        SELECT 1 FROM horario_slots hs
        WHERE hs.escola_id = $1 AND hs.turno = t.turno AND hs.numero_aula = h.numero_aula AND hs.letivo = true
          AND (hs.nivel_ensino IS NULL OR hs.nivel_ensino = t.nivel_ensino)
      )
    GROUP BY t.turno, t.nome, h.numero_aula
  `, [ESCOLA_ID]);
  console.log(`  ${foraDoEsquema.rows.length} caso(s)`);
  foraDoEsquema.rows.slice(0, 10).forEach(r => console.log(`    ${r.turma} (${r.turno}) período ${r.numero_aula}: ${r.qtd} aula(s) fora do esquema`));
  totalProblemas += foraDoEsquema.rows.length;

  // 6) Hora-Atividade: quantidade insuficiente/excedente (formula
  // oficial SEED-PR) e HA colidindo com bloqueio ou aula real (mesma
  // logica de recalcular-ha.ts, replicada aqui só pra detectar --
  // quem corrige de verdade é a função recalcularHoraAtividade,
  // chamada automaticamente ao promover uma grade).
  console.log("\n[6] Hora-Atividade (quantidade e colisões)");
  const TABELA_HA = [0, 0, 0, 1, 1, 2, 2, 2, 2, 3, 3, 4, 4, 4, 4, 5, 5, 5, 6, 6, 6, 7, 7, 7, 8, 8, 8, 9, 9, 10, 10];
  function haEsperada(aulas) {
    if (!aulas || aulas <= 0) return 0;
    if (aulas <= 30) return TABELA_HA[Math.round(aulas)];
    return Math.ceil(aulas / 3);
  }

  const [profs, horariosTodos, dispTodas] = await Promise.all([
    client.query(`SELECT id, nome FROM professores WHERE escola_id = $1`, [ESCOLA_ID]),
    client.query(`
      SELECT h.professor_id, t.turno, h.dia_semana, h.numero_aula
      FROM horarios h JOIN turmas t ON t.id = h.turma_id
      WHERE h.escola_id = $1
    `, [ESCOLA_ID]),
    client.query(`
      SELECT d.professor_id, d.turno, d.dia_semana, d.horario_slot, d.disponivel, d.hora_atividade_obrigatoria
      FROM disponibilidade_professores d
      JOIN professores p ON p.id = d.professor_id
      WHERE p.escola_id = $1
    `, [ESCOLA_ID]),
  ]);

  let haProblemas = 0;
  let haColisoes = 0;
  for (const prof of profs.rows) {
    const aulasDoProf = horariosTodos.rows.filter(h => h.professor_id === prof.id);
    if (aulasDoProf.length === 0) continue;

    const aulasPorTurno = {};
    const ocupadoPorTurno = new Map();
    for (const h of aulasDoProf) {
      aulasPorTurno[h.turno] = (aulasPorTurno[h.turno] ?? 0) + 1;
      if (!ocupadoPorTurno.has(h.turno)) ocupadoPorTurno.set(h.turno, new Set());
      ocupadoPorTurno.get(h.turno).add(`${h.dia_semana}-${h.numero_aula}`);
    }
    const totalAulas = Object.values(aulasPorTurno).reduce((s, n) => s + n, 0);
    const exigido = haEsperada(totalAulas);

    const haDoProf = dispTodas.rows.filter(d => d.professor_id === prof.id && d.hora_atividade_obrigatoria);
    const bloqueiosDoProf = dispTodas.rows.filter(d => d.professor_id === prof.id && !d.disponivel);

    let marcadasValidas = 0;
    for (const m of haDoProf) {
      const turno = m.turno ?? "sem_turno";
      const ocupado = ocupadoPorTurno.get(turno);
      const chave = `${m.dia_semana}-${m.horario_slot}`;
      const colideAula = ocupado?.has(chave) ?? false;
      const colideBloqueio = bloqueiosDoProf.some(b =>
        (b.turno === m.turno || b.turno === null) && b.dia_semana === m.dia_semana && b.horario_slot === m.horario_slot
      );
      if (colideAula || colideBloqueio) {
        haColisoes++;
        console.log(`    COLISÃO: ${prof.nome} — HA em ${turno} dia=${m.dia_semana} aula=${m.horario_slot} colide com ${colideAula ? "aula real" : "bloqueio"}`);
      } else {
        marcadasValidas++;
      }
    }
    if (marcadasValidas !== exigido) {
      console.log(`    ${prof.nome}: HA marcada=${marcadasValidas}, exigida=${exigido} (${marcadasValidas < exigido ? "falta" : "sobra"} ${Math.abs(exigido - marcadasValidas)})`);
      haProblemas++;
    }
  }
  console.log(`  ${haProblemas} professor(es) com quantidade de HA errada, ${haColisoes} colisão(ões)`);
  totalProblemas += haProblemas + haColisoes;

  console.log("\n" + "=".repeat(70));
  console.log(`TOTAL DE PROBLEMAS ENCONTRADOS: ${totalProblemas}` + (profDuplicado.rows.length ? ` (+ ${profDuplicado.rows.length} alerta(s) de professor duplicado pra revisar manualmente)` : ""));
  console.log("=".repeat(70));

  await client.end();
}
main().catch(err => { console.error(err); process.exit(1); });
