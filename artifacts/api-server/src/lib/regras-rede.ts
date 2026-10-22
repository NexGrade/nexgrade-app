// [REGRAS-REDE] (21/10/2026) Regras de geração iguais para TODAS as escolas, no padrão do C.E. Romário
// Martins (escola de referência, regras testadas e aprovadas). Travadas: o sistema usa sempre estes valores,
// mesmo que a escola tenha algo gravado em `configuracoes`, e a rota de configurações recusa mudança.
// Escola nova já nasce com elas. Para mudar uma regra, muda aqui (vale para a rede inteira).
// Continuam por escola (exceções de verdade): limite por turma+disciplina, limite diário de um professor,
// autorização de teto (`seed_pr.teto_aulas_turno_liberado`) e conflitos aceitos (`conflitos.aceitos`).
export const REGRAS_REDE = {
  /** máximo de aulas seguidas da mesma disciplina no dia (quando a turma+disciplina não tem limite próprio) */
  maxAulasGeminadasPadrao: 3,
  /** teto de aulas do professor por turno (SEED-PR) */
  tetoAulasTurno: { diurno: 24, noturno: 19 },
  /** até quantas aulas no turno a HA fica no mesmo turno das aulas (Art. 11, §4º) */
  horaAtividadeMesmoTurnoAte: 19,
  /** limite de aulas por dia do professor numa turma: o Romário não tem (undefined = sem limite) */
  maxAulasComplementarPadrao: undefined as number | undefined,
} as const;

/** Chaves de `configuracoes` que são regra da rede: não podem ser gravadas por escola. */
export const CHAVES_REGRA_REDE = new Set([
  "seed_pr.max_aulas_geminadas_padrao",
  "seed_pr.teto_aulas_turno",
  "seed_pr.hora_atividade_mesmo_turno_ate",
  "seed_pr.max_aulas_complementar_padrao",
  "seed_pr.padrao_20h",
  "seed_pr.padrao_40h",
]);
