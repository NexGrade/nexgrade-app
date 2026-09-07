/**
 * sincronizar-disponibilidade-07-11-09.cjs
 *
 * Sincroniza disponibilidade_professores a partir do PDF oficial Urania
 * (matutino, C.E. Prof. Mario Braga, periodo 07/09 a 11/09), usando a
 * politica confirmada com o usuario:
 *   - Tracos ("- - -")           -> disponivel=false, hora_atividade_obrigatoria=false
 *   - HA / HA*                   -> disponivel=false, hora_atividade_obrigatoria=true
 *   - PAEE/COORD/PAC/LAB/FORM/REP e marcadores tipo "3B" (com asterisco)
 *     -> disponivel=false, hora_atividade_obrigatoria=false
 *     (motivo registra o codigo original pra rastreabilidade)
 *   - Celulas vazias             -> NAO sincroniza (fica de fora, so aparece
 *     no arquivo vazios_revisao.json pra conferencia manual)
 *   - Celulas de aula real       -> NAO gera bloqueio (é so o horario atual,
 *     sera regenerado pelo CP-SAT)
 *
 * Nomes de professor sao casados com a tabela `professores` (escola_id =
 * org_3HCMsuYeAwkggR1dxXNzEdzNaX8) por normalizacao exata (maiusculas,
 * sem acento, sem "*"). Nomes que nao batem exatamente ficam sinalizados
 * em vez de aplicados -- NUNCA adivinha (Regra de ouro: nao inferir dados
 * de professor sem confirmacao).
 *
 * Uso:
 *   node sincronizar-disponibilidade-07-11-09.cjs            (dry-run)
 *   node sincronizar-disponibilidade-07-11-09.cjs --aplicar   (grava)
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ESCOLA_ID = 'org_3HCMsuYeAwkggR1dxXNzEdzNaX8';
const TURNO = 'matutino';
const APLICAR = process.argv.includes('--aplicar');

// mapa horario_texto (do PDF) -> sera resolvido contra horario_slots via
// hora_inicio (ex: "07:30" -> numero_aula correspondente no turno matutino)

function normalizarNome(n) {
  return n
    .toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/\*/g, '')
    .trim();
}

async function main() {
  const bloqueios = JSON.parse(fs.readFileSync(path.join(__dirname, 'bloqueios_para_sync.json'), 'utf8'));

  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const profs = (await c.query(
      `SELECT id, nome FROM professores WHERE escola_id = $1`,
      [ESCOLA_ID]
    )).rows;
    const porNomeNormalizado = new Map();
    for (const p of profs) {
      const chave = normalizarNome(p.nome);
      if (porNomeNormalizado.has(chave)) {
        // homonimo/duplicado -- nao decide sozinho, marca como ambiguo
        porNomeNormalizado.set(chave, null);
      } else {
        porNomeNormalizado.set(chave, p.id);
      }
    }

    function resolverProfessorId(nomePdf) {
      const chave = normalizarNome(nomePdf);
      // 1) match exato
      if (porNomeNormalizado.has(chave)) return porNomeNormalizado.get(chave);
      // 2) match por prefixo (PDF usa so o primeiro nome/nomes)
      let candidatos = profs.filter(p => normalizarNome(p.nome).startsWith(chave + ' ') || normalizarNome(p.nome) === chave);
      if (candidatos.length === 1) return candidatos[0].id;
      if (candidatos.length > 1) return null; // ambiguo
      // 3) match por qualquer palavra do nome completo (ex: PDF usa sobrenome)
      candidatos = profs.filter(p => normalizarNome(p.nome).split(' ').includes(chave));
      if (candidatos.length === 1) return candidatos[0].id;
      if (candidatos.length > 1) return null; // ambiguo
      return undefined; // nao encontrado
    }

    const slots = (await c.query(
      `SELECT numero_aula, hora_inicio FROM horario_slots WHERE escola_id = $1 AND turno = $2 AND letivo = true`,
      [ESCOLA_ID, TURNO]
    )).rows;
    const porHoraInicio = new Map(slots.map(s => [s.hora_inicio.slice(0,5), s.numero_aula]));

    const naoEncontrados = new Set();
    const ambiguos = new Set();
    const horarioNaoMapeado = new Set();
    const paraAplicar = [];

    for (const b of bloqueios) {
      const profId = resolverProfessorId(b.professor_pdf);
      if (profId === undefined) {
        naoEncontrados.add(b.professor_pdf);
        continue;
      }
      if (profId === null) {
        ambiguos.add(b.professor_pdf);
        continue;
      }
      const numeroAula = porHoraInicio.get(b.horario_texto);
      if (numeroAula === undefined) {
        horarioNaoMapeado.add(b.horario_texto);
        continue;
      }
      paraAplicar.push({ professor_id: profId, dia_semana: b.dia_semana, horario_slot: numeroAula, disponivel: b.disponivel, hora_atividade_obrigatoria: b.hora_atividade_obrigatoria, motivo: b.motivo });
    }

    console.log(`Total de bloqueios no arquivo: ${bloqueios.length}`);
    console.log(`Prontos para aplicar (nome + horario resolvidos): ${paraAplicar.length}`);
    console.log(`Professores NAO ENCONTRADOS no banco (${naoEncontrados.size}):`, [...naoEncontrados]);
    console.log(`Professores AMBIGUOS/homonimos (${ambiguos.size}):`, [...ambiguos]);
    console.log(`Horarios do PDF sem correspondencia em horario_slots (${horarioNaoMapeado.size}):`, [...horarioNaoMapeado]);

    if (!APLICAR) {
      console.log('\nDRY-RUN -- nada foi gravado. Revise os avisos acima e rode com --aplicar para gravar.');
      return;
    }

    await c.query('BEGIN');
    for (const item of paraAplicar) {
      await c.query(
        `INSERT INTO disponibilidade_professores (professor_id, dia_semana, horario_slot, turno, disponivel, hora_atividade_obrigatoria, motivo)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (professor_id, dia_semana, horario_slot, turno)
         DO UPDATE SET disponivel = EXCLUDED.disponivel, hora_atividade_obrigatoria = EXCLUDED.hora_atividade_obrigatoria, motivo = EXCLUDED.motivo`,
        [item.professor_id, item.dia_semana, item.horario_slot, TURNO, item.disponivel, item.hora_atividade_obrigatoria, item.motivo]
      );
    }
    await c.query('COMMIT');
    console.log(`\nAPLICADO: ${paraAplicar.length} linhas de disponibilidade sincronizadas.`);
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    await c.end();
  }
}

main().catch(e => { console.error(e); process.exitCode = 1; });
