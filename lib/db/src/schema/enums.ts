import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Composição Curricular — enum fechado com as siglas oficiais do SERE-PR,
 * confirmado via CODIGOS_SEED.pdf e validado contra cenários reais em
 * todos os níveis de ensino.
 *
 * SUBSTITUI o campo de texto livre `categoriaCurricular` que existia em
 * itens_matriz (nomenclatura própria do NexGrade: base_nacional_comum,
 * parte_diversificada, etc.) — ver migration-notes.md para o mapeamento
 * de valores antigos e os dois casos que exigem revisão manual antes de
 * migrar dados existentes.
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
