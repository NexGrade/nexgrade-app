/**
 * liberar-bloqueios-geverson-provisorio.cjs
 *
 * Libera PROVISORIAMENTE 3 bloqueios do professor Geverson Luiz de
 * Oliveira (id=630) no matutino -- Segunda, Quarta e Quinta, 1a aula
 * (07:30) -- pra fechar a demanda real dele (23 aulas/semana) contra
 * a disponibilidade (20 slots com os 10 bloqueios originais da
 * sincronizacao Urania). Decisao tomada em 05/09 pendente confirmacao
 * final da Direcao. Se a Direcao nao confirmar, rodar
 * reverter-liberacao-geverson.cjs (ou reaplicar o sync original).
 *
 * Uso:
 *   node liberar-bloqueios-geverson-provisorio.cjs            (dry-run)
 *   node liberar-bloqueios-geverson-provisorio.cjs --aplicar   (grava)
 */
const { Client } = require('pg');

const PROFESSOR_ID = 630; // Geverson Luiz de Oliveira
const ESCOLA_ID = 'org_3HCMsuYeAwkggR1dxXNzEdzNaX8';
const TURNO = 'matutino';
const DIAS_A_LIBERAR = [0, 2, 3]; // Seg, Qua, Qui
const HORARIO_TEXTO = '07:30';
const APLICAR = process.argv.includes('--aplicar');

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const slot = (await c.query(
      `SELECT numero_aula FROM horario_slots WHERE escola_id = $1 AND turno = $2 AND hora_inicio = $3 LIMIT 1`,
      [ESCOLA_ID, TURNO, HORARIO_TEXTO]
    )).rows[0];
    if (!slot) {
      console.error(`Nao encontrei horario_slots com hora_inicio=${HORARIO_TEXTO} para ${TURNO}.`);
      process.exitCode = 1;
      return;
    }
    const numeroAula = slot.numero_aula;

    const atuais = await c.query(
      `SELECT dia_semana, horario_slot, disponivel, hora_atividade_obrigatoria, motivo
       FROM disponibilidade_professores
       WHERE professor_id = $1 AND turno = $2 AND dia_semana = ANY($3) AND horario_slot = $4`,
      [PROFESSOR_ID, TURNO, DIAS_A_LIBERAR, numeroAula]
    );
    console.log(`Bloqueios encontrados (antes de liberar):`);
    console.table(atuais.rows);

    if (!APLICAR) {
      console.log('DRY-RUN -- rode com --aplicar para liberar de fato.');
      return;
    }

    const motivoNovo = 'LIBERADO PROVISORIAMENTE em 05/09/2026 -- decisao para fechar demanda x disponibilidade (23 vs 20). PENDENTE confirmacao da Direcao.';
    const upd = await c.query(
      `UPDATE disponibilidade_professores
       SET disponivel = true, hora_atividade_obrigatoria = false, motivo = $1
       WHERE professor_id = $2 AND turno = $3 AND dia_semana = ANY($4) AND horario_slot = $5`,
      [motivoNovo, PROFESSOR_ID, TURNO, DIAS_A_LIBERAR, numeroAula]
    );
    console.log(`APLICADO: ${upd.rowCount} linhas liberadas (disponivel=true).`);
  } finally {
    await c.end();
  }
}

main().catch(e => { console.error(e); process.exitCode = 1; });
