import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Composição Curricular — enum fechado confirmado via CODIGOS_SEED.pdf,
 * validado contra cenários reais do SERE-PR em todos os níveis de ensino.
 * NUNCA armazenar como texto livre — sempre usar este enum.
 *
 * BNC  Base Nacional Comum                     (Ensino Fundamental, 6º-9º ano)
 * PD   Parte Diversificada                      (Ensino Fundamental)
 * FGB  Formação Geral Básica                    (Ensino Médio Regular)
 * PFO  Percurso Formativo Obrigatório            (Projeto de Vida, Ed. Financeira)
 * IFA  Itinerário Formativo de Aprofundamento    (disciplinas propedêuticas do Médio)
 * IFP  Itinerário Formativo Profissional         (teóricas de Técnicos/Magistério)
 * APF  Aprofundamento Profissional               (práticas, laboratórios, estágios)
 */
export const composicaoCurricularEnum = pgEnum("composicao_curricular", [
  "BNC",
  "PD",
  "FGB",
  "PFO",
  "IFA",
  "IFP",
  "APF",
]);

/** Turno de funcionamento da turma / janela de horário. */
export const turnoEnum = pgEnum("turno", ["manha", "tarde", "noite"]);

/**
 * Dia da semana letivo. Apenas segunda a sexta foram observados nas grades
 * reais analisadas (Urânia UP) — ajustar se a escola tiver aula aos sábados.
 */
export const diaSemanaEnum = pgEnum("dia_semana", [
  "segunda",
  "terca",
  "quarta",
  "quinta",
  "sexta",
]);

/**
 * Comportamento de geminação do professor quando ele tem duas aulas no
 * mesmo dia com a mesma turma. Confirmado como parâmetro real de
 * configuração do motor (tela de cadastro básico do concorrente).
 */
export const geminacaoProfessorEnum = pgEnum("geminacao_professor", [
  "variar",
  "sempre_juntas",
  "nunca_juntas",
]);

/**
 * Regra aplicada quando um mesmo professor leciona duas disciplinas
 * diferentes para a mesma turma no mesmo dia.
 */
export const regraMultidisciplinaEnum = pgEnum("regra_multidisciplina", [
  "permitir_junto",
  "preferir_separado",
  "exigir_separado",
]);
