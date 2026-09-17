// [ATENCAO: --aplicar GRAVA DE VERDADE] Recalcula a distribuicao de HA
// (mesma logica do recalcular-ha.ts, incluindo o fix de adjacencia por
// turno e o fix de spillover entre turnos de ensino) direto em cima da
// grade OFICIAL (tabela horarios, todos os turnos). Sem --aplicar roda
// em dry-run (so mostra relatorio, nao grava nada); com --aplicar grava
// em disponibilidade_professores. Corrigido em 2026-09-17 -- ate entao
// o cabecalho dizia "somente leitura" mas o --aplicar sempre gravou de
// verdade, e a adjacencia usava chave so por dia (sem turno), causando
// HA incompleta/errada pra professor multi-turno.
//
// Uso:
//   node simular-ha-oficial-multiturno.cjs --escola org_3HCMsuYeAwkggR1dxXNzEdzNaX8
//   node simular-ha-oficial-multiturno.cjs --escola org_3HCMsuYeAwkggR1dxXNzEdzNaX8 --aplicar

const { Client } = require("pg");

function argValor(flag, padrao) {
  const i = process.argv.indexOf(flag);
  if (i === -1 || i === process.argv.length - 1) return padrao;
  return process.argv[i + 1];
}

const NOME_EXPERIMENTO = argValor("--nome", "CPSAT-2026-09-06 - Matutino 18:50");
let ESCOLA_ID = argValor("--escola", null);
const APLICAR = process.argv.includes("--aplicar");
const MOTIVO_HA_AUTO = "Hora-atividade institucional (recalculada automaticamente)";

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

function calcularHoraAtividadePorTurno(aulasPorTurno, exigidoOverride) {
  const turnos = Object.keys(aulasPorTurno);
  const totalAulas = turnos.reduce((s, t) => s + (aulasPorTurno[t] || 0), 0);
  if (totalAulas <= 0) {
    const zeros = {};
    turnos.forEach((t) => (zeros[t] = 0));
    return zeros;
  }
  const exigidoTotal = exigidoOverride ?? calcularHoraAtividadeInstitucional(totalAulas);
  const partes = turnos.map((turno) => {
    const aulas = aulasPorTurno[turno] || 0;
    const proporcional = (aulas / totalAulas) * exigidoTotal;
    return { turno, base: Math.floor(proporcional), resto: proporcional - Math.floor(proporcional) };
  });
  let alocado = partes.reduce((s, p) => s + p.base, 0);
  let faltam = exigidoTotal - alocado;
  const ordenado = [...partes].sort((a, b) => b.resto - a.resto);
  for (let i = 0; i < ordenado.length && faltam > 0; i++) {
    ordenado[i].base += 1;
    faltam--;
  }
  const resultado = {};
  partes.forEach((p) => (resultado[p.turno] = p.base));
  return resultado;
}

// [MESMA LOGICA DO FIX aplicado em recalcular-ha.ts]
function preencherGuloso(ctx, turno, orcamentoInicial, ocupadoInicial) {
  const { maxAulaPorTurno, bloqueadoPorTurno, marcasFinais, professorId, contagemDiaAtual, haPosicoesPorDia } = ctx;
  let orcamento = orcamentoInicial;
  const maxAula = maxAulaPorTurno.get(turno) ?? 6;
  const bloqueado = bloqueadoPorTurno.get(turno) ?? new Set();
  const ocupado = new Set(ocupadoInicial);
  const MAX_HA_POR_DIA = 3;


  function livre(dia, aula) {
    if (aula < 1 || aula > maxAula) return false;
    const chave = `${dia}-${aula}`;
    return !ocupado.has(chave) && !bloqueado.has(chave);
  }
  // [FIX-ADJACENCIA-POR-TURNO] chave agora inclui o turno -- antes so
  // "dia" fazia HA de um turno bloquear candidato de outro turno com
  // numero de aula vizinho, mesmo sendo horarios completamente
  // diferentes. Mesmo fix ja aplicado no recalcular-ha.ts.
  function adjacenteAHAExistente(dia, aula) {
    const posicoes = haPosicoesPorDia.get(`${turno}-${dia}`);
    if (!posicoes) return false;
    return posicoes.has(aula - 1) || posicoes.has(aula + 1);
  }
  function contarJanelasNoDia(conjunto, dia) {
    let min = null;
    let max = null;
    for (let aula = 1; aula <= maxAula; aula++) {
      if (conjunto.has(`${dia}-${aula}`)) {
        if (min === null) min = aula;
        max = aula;
      }
    }
    if (min === null || max === null) return 0;
    let buracos = 0;
    for (let aula = min + 1; aula < max; aula++) {
      if (!conjunto.has(`${dia}-${aula}`)) buracos++;
    }
    return buracos;
  }
  // [FIX-JANELA-MULTI-SLOT] mesma correcao aplicada em recalcular-ha.ts
  function contarJanelas(conjunto) {
    let total = 0;
    for (let dia = 0; dia < 5; dia++) {
      total += contarJanelasNoDia(conjunto, dia);
    }
    return total;
  }

  while (orcamento > 0) {
    let candidatos = [];
    for (let dia = 0; dia < 5; dia++) {
      for (let aula = 1; aula <= maxAula; aula++) {
        if (livre(dia, aula)) candidatos.push({ dia, aula });
      }
    }
    if (candidatos.length === 0) break;

    candidatos = candidatos.filter((c) => !adjacenteAHAExistente(c.dia, c.aula));
    if (candidatos.length === 0) break;

    candidatos = candidatos.filter((c) => (contagemDiaAtual.get(c.dia) ?? 0) < MAX_HA_POR_DIA);
    if (candidatos.length === 0) break;

    let melhor = null;
    for (const c of candidatos) {
      const testado = new Set(ocupado);
      testado.add(`${c.dia}-${c.aula}`);
      const janelas = contarJanelas(testado);
      const diaCount = contagemDiaAtual.get(c.dia) ?? 0;
      const colado = ocupado.has(`${c.dia}-${c.aula - 1}`) || ocupado.has(`${c.dia}-${c.aula + 1}`);
      const dist = Math.min(c.aula - 1, maxAula - c.aula);
      // [REVERTIDO] mesma reversao aplicada em recalcular-ha.ts
      if (
        !melhor ||
        janelas < melhor.janelas ||
        (janelas === melhor.janelas && diaCount < melhor.diaCount) ||
        (janelas === melhor.janelas && diaCount === melhor.diaCount && colado && !melhor.colado) ||
        (janelas === melhor.janelas && diaCount === melhor.diaCount && colado === melhor.colado && dist < melhor.dist) ||
        (janelas === melhor.janelas && diaCount === melhor.diaCount && colado === melhor.colado && dist === melhor.dist && c.dia < melhor.dia)
      ) {
        melhor = { ...c, janelas, diaCount, colado, dist };
      }
    }
    if (!melhor) break;
    marcasFinais.push({ professorId, turno, diaSemana: melhor.dia, horarioSlot: melhor.aula });
    ocupado.add(`${melhor.dia}-${melhor.aula}`);
    contagemDiaAtual.set(melhor.dia, (contagemDiaAtual.get(melhor.dia) ?? 0) + 1);
    const chaveTurnoDia = `${turno}-${melhor.dia}`;
    if (!haPosicoesPorDia.has(chaveTurnoDia)) haPosicoesPorDia.set(chaveTurnoDia, new Set());
    haPosicoesPorDia.get(chaveTurnoDia).add(melhor.aula);
    orcamento--;
  }
  return orcamento;
}

const DIAS_NOMES = ["Seg", "Ter", "Qua", "Qui", "Sex"];

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  // [VARIANTE-OFICIAL-MULTITURNO] le a grade OFICIAL (tabela horarios,
  // todos os turnos de uma vez) em vez de um experimento -- reproduz
  // exatamente o cenario multi-turno da producao (calcularHAIdeal sem
  // aulasOverride), pra validar mudancas que so aparecem quando um
  // professor da aula em mais de um turno. So precisa de --escola.
  if (!ESCOLA_ID) {
    console.error("Passe --escola <id>.");
    process.exit(1);
  }

  const { rows: aulasExp } = await client.query(
    `SELECT professor_id, turma_id, dia_semana, numero_aula
     FROM horarios
     WHERE escola_id = $1`,
    [ESCOLA_ID],
  );
  console.log(`Aulas do experimento carregadas: ${aulasExp.length}`);
  if (aulasExp.length === 0) {
    console.error("Zero aulas -- confira nome/escola.");
    process.exit(1);
  }

  const { rows: turmas } = await client.query(`SELECT id, turno FROM turmas WHERE escola_id = $1`, [ESCOLA_ID]);
  const turmaMap = new Map(turmas.map((t) => [t.id, t.turno]));

  const { rows: profs } = await client.query(`SELECT id, nome FROM professores WHERE escola_id = $1`, [ESCOLA_ID]);
  const profNomeMap = new Map(profs.map((p) => [p.id, p.nome]));

  const { rows: slots } = await client.query(`SELECT turno, numero_aula FROM horario_slots WHERE escola_id = $1`, [ESCOLA_ID]);
  const maxAulaPorTurno = new Map();
  for (const s of slots) {
    const atual = maxAulaPorTurno.get(s.turno) ?? 0;
    if (s.numero_aula > atual) maxAulaPorTurno.set(s.turno, s.numero_aula);
  }

  const { rows: disponibilidades } = await client.query(`SELECT * FROM disponibilidade_professores`);

  // agrupa aulas por professor
  const aulasPorProf = new Map();
  for (const a of aulasExp) {
    if (!aulasPorProf.has(a.professor_id)) aulasPorProf.set(a.professor_id, []);
    aulasPorProf.get(a.professor_id).push(a);
  }

  const marcasFinais = [];
  const relatorioPendencias = [];

  for (const [professorId, aulasDoProf] of aulasPorProf) {
    const aulasPorTurno = {};
    const ocupadoPorTurnoOriginal = new Map();
    for (const h of aulasDoProf) {
      const turno = turmaMap.get(h.turma_id);
      if (!turno) continue;
      aulasPorTurno[turno] = (aulasPorTurno[turno] ?? 0) + 1;
      if (!ocupadoPorTurnoOriginal.has(turno)) ocupadoPorTurnoOriginal.set(turno, new Set());
      ocupadoPorTurnoOriginal.get(turno).add(`${h.dia_semana}-${h.numero_aula}`);
    }

    const bloqueadoPorTurno = new Map();
    for (const d of disponibilidades) {
      if (d.professor_id !== professorId || d.disponivel) continue;
      const chave = `${d.dia_semana}-${d.horario_slot}`;
      if (d.turno == null) {
        for (const turno of Object.keys(aulasPorTurno)) {
          if (!bloqueadoPorTurno.has(turno)) bloqueadoPorTurno.set(turno, new Set());
          bloqueadoPorTurno.get(turno).add(chave);
        }
      } else {
        if (!bloqueadoPorTurno.has(d.turno)) bloqueadoPorTurno.set(d.turno, new Set());
        bloqueadoPorTurno.get(d.turno).add(chave);
      }
    }

    const haManualContraturno = disponibilidades.filter(
      (d) => d.professor_id === professorId && d.hora_atividade_obrigatoria && !((d.turno ?? "") in aulasPorTurno),
    );
    for (const m of haManualContraturno) {
      marcasFinais.push({ professorId, turno: m.turno ?? "sem_turno", diaSemana: m.dia_semana, horarioSlot: m.horario_slot });
    }

    const totalAulas = Object.values(aulasPorTurno).reduce((s, n) => s + n, 0);
    const exigidoTotal = calcularHoraAtividadeInstitucional(totalAulas);
    const exigidoParaDistribuir = Math.max(0, exigidoTotal - haManualContraturno.length);
    const orcamentoPorTurno = calcularHoraAtividadePorTurno(aulasPorTurno, exigidoParaDistribuir);

    const ctx = { maxAulaPorTurno, bloqueadoPorTurno, marcasFinais, professorId, contagemDiaAtual: new Map(), haPosicoesPorDia: new Map() };

    let sobraGeral = 0;
    for (const turno of Object.keys(aulasPorTurno)) {
      const orcamento = orcamentoPorTurno[turno] ?? 0;
      if (orcamento <= 0) continue;
      sobraGeral += preencherGuloso(ctx, turno, orcamento, ocupadoPorTurnoOriginal.get(turno) ?? new Set());
    }

    if (sobraGeral > 0) {
      const turnosContraturno = [...maxAulaPorTurno.keys()].filter((t) => !(t in aulasPorTurno));
      const espacoLivre = (turno) => {
        const maxAula = maxAulaPorTurno.get(turno) ?? 6;
        const bloqueado = bloqueadoPorTurno.get(turno) ?? new Set();
        let livre = 0;
        for (let dia = 0; dia < 5; dia++) for (let aula = 1; aula <= maxAula; aula++) if (!bloqueado.has(`${dia}-${aula}`)) livre++;
        return livre;
      };
      turnosContraturno.sort((a, b) => espacoLivre(b) - espacoLivre(a));
      for (const turno of turnosContraturno) {
        if (sobraGeral <= 0) break;
        const jaManual = new Set(haManualContraturno.filter((m) => (m.turno ?? "sem_turno") === turno).map((m) => `${m.dia_semana}-${m.horario_slot}`));
        sobraGeral = preencherGuloso(ctx, turno, sobraGeral, jaManual);
      }
    }

    // [FIX-SOBRA-ENTRE-TURNOS-DE-ENSINO] mesmo fix aplicado no
    // recalcular-ha.ts em 2026-09-17 -- professor em 3+ turnos pode nao
    // ter nenhum turno de contraturno puro, entao a sobra tenta de novo
    // nos proprios turnos de ensino, usando espaco alem do orcamento
    // proporcional original.
    if (sobraGeral > 0) {
      const turnosDeEnsino = Object.keys(aulasPorTurno);
      const ocupadoAtual = (turno) => {
        const s = new Set(ocupadoPorTurnoOriginal.get(turno) ?? new Set());
        for (let dia = 0; dia < 5; dia++) {
          const pos = ctx.haPosicoesPorDia.get(`${turno}-${dia}`);
          if (pos) for (const aula of pos) s.add(`${dia}-${aula}`);
        }
        return s;
      };
      const espacoLivreEnsino = (turno) => {
        const maxAula = maxAulaPorTurno.get(turno) ?? 6;
        const bloqueado = bloqueadoPorTurno.get(turno) ?? new Set();
        const ocup = ocupadoAtual(turno);
        let livre = 0;
        for (let dia = 0; dia < 5; dia++) for (let aula = 1; aula <= maxAula; aula++) if (!ocup.has(`${dia}-${aula}`) && !bloqueado.has(`${dia}-${aula}`)) livre++;
        return livre;
      };
      const ordenados = [...turnosDeEnsino].sort((a, b) => espacoLivreEnsino(b) - espacoLivreEnsino(a));
      for (const turno of ordenados) {
        if (sobraGeral <= 0) break;
        sobraGeral = preencherGuloso(ctx, turno, sobraGeral, ocupadoAtual(turno));
      }
    }

    if (sobraGeral > 0) {
      relatorioPendencias.push({ professorId, nome: profNomeMap.get(professorId) ?? `#${professorId}`, sobra: sobraGeral });
    }
  }

  // ===== RELATORIO =====
  console.log("\n=== VERIFICACAO DE VIOLACOES (deve dar tudo zero) ===");
  // [FIX-CHECKER-MULTI-TURNO] agrupar so por professorId+diaSemana somava
  // HA de turnos diferentes (ex.: ultima aula do matutino + primeira do
  // vespertino) como se fossem "consecutivas" no mesmo bloco de tempo --
  // falso positivo. Agora a chave inclui o turno tambem.
  const porProfDia = new Map();
  for (const m of marcasFinais) {
    const key = `${m.professorId}|${m.turno}`;
    if (!porProfDia.has(key)) porProfDia.set(key, new Map());
    const porDia = porProfDia.get(key);
    if (!porDia.has(m.diaSemana)) porDia.set(m.diaSemana, []);
    porDia.get(m.diaSemana).push(m.horarioSlot);
  }

  let estouros = 0;
  let consecutivos = 0;
  for (const [chaveCompostaProfTurno, porDia] of porProfDia) {
    const [profIdStr] = chaveCompostaProfTurno.split("|");
    const profId = Number(profIdStr);
    for (const [dia, aulas] of porDia) {
      const ordenado = [...aulas].sort((a, b) => a - b);
      if (ordenado.length > 3) {
        estouros++;
        console.log(`  ESTOURO: ${profNomeMap.get(profId)} tem ${ordenado.length} HA em ${DIAS_NOMES[dia]}`);
      }
      for (let i = 1; i < ordenado.length; i++) {
        if (ordenado[i] === ordenado[i - 1] + 1) {
          consecutivos++;
          console.log(`  CONSECUTIVA: ${profNomeMap.get(profId)} tem HA seguida em ${DIAS_NOMES[dia]} (aulas ${ordenado[i - 1]} e ${ordenado[i]})`);
        }
      }
    }
  }
  if (estouros === 0 && consecutivos === 0) {
    console.log("  Nenhuma violacao encontrada -- zero estouro de 3/dia, zero HA consecutiva.");
  }

  console.log(`\n=== RESUMO ===`);
  console.log(`Total de marcas de HA calculadas: ${marcasFinais.length}`);
  console.log(`Professores com HA pendente (sem lugar nem no turno nem em contraturno): ${relatorioPendencias.length}`);
  for (const p of relatorioPendencias) {
    console.log(`  - ${p.nome}: ${p.sobra} HA sem lugar`);
  }

  if (!APLICAR) {
    console.log("\nDRY-RUN -- nada foi gravado. Rode com --aplicar para gravar de verdade.");
    await client.end();
    return;
  }

  console.log(`\nAPLICANDO ${marcasFinais.length} marcas de HA no banco...`);
  await client.query("BEGIN");
  try {
    let gravadas = 0;
    for (const m of marcasFinais) {
      const turnoDb = m.turno === "sem_turno" ? null : m.turno;
      const r = await client.query(
        `INSERT INTO disponibilidade_professores (professor_id, dia_semana, horario_slot, turno, disponivel, hora_atividade_obrigatoria, motivo)
         VALUES ($1, $2, $3, $4, true, true, $5)
         ON CONFLICT (professor_id, dia_semana, horario_slot, turno)
         DO UPDATE SET disponivel = true, hora_atividade_obrigatoria = true, motivo = EXCLUDED.motivo
         WHERE disponibilidade_professores.hora_atividade_obrigatoria = true`,
        [m.professorId, m.diaSemana, m.horarioSlot, turnoDb, MOTIVO_HA_AUTO],
      );
      gravadas += r.rowCount;
    }
    await client.query("COMMIT");
    console.log(`APLICADO: ${gravadas} linhas gravadas/atualizadas (de ${marcasFinais.length} marcas calculadas -- a diferenca sao HA manuais ja existentes, que o WHERE nao sobrescreve porque nao eram HA automatica antes).`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }

  await client.end();
}

main().catch((err) => {
  console.error("ERRO:", err);
  process.exit(1);
});
